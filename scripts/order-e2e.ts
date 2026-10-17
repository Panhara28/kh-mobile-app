/**
 * End-to-end check of the app's ordering code (src/lib/order.ts + src/lib/api.ts) against a
 * running kh-pos, as a staff user. Uses two free tables, then deletes its orders and frees them.
 * Development servers only.
 *
 *   KHPOS_URL=http://localhost:3001 STAFF_USERNAME=staff1 STAFF_PASSWORD=... pnpm e2e
 *
 * Needs the seed data (scripts/seed-dev.mjs): Fried Rice with the "Add-ons" modifier, Iced Latte.
 */
const randomUUID = () => crypto.randomUUID(); // global in Node 22
import { KhPosApi, type MenuProduct, type ModifierItem } from '../src/lib/api';
import { activeLines, addToTable, kitchenMoves, lineExtras, modifierNames, orderCounts, pendingQty, statusQty } from '../src/lib/order';

const BASE = (process.env.KHPOS_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
let token: string | null = null;
const api = new KhPosApi(BASE, () => token);

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function deleteOrder(orderId: string) {
  await fetch(`${BASE}/api/pos/order/${orderId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
}

async function main() {
  const username = process.env.STAFF_USERNAME ?? 'staff1';
  const password = process.env.STAFF_PASSWORD;
  if (!password) throw new Error('Set STAFF_PASSWORD (from scripts/seed-dev.mjs).');
  token = await api.login(username, password);
  const me = await api.me();
  const wh = me.currentWarehouseId!;
  const menu = await api.menu({ warehouse: wh, limit: 100, offset: 0 });
  const find = (n: string) => {
    const p = menu.find((x) => x.productTitle.startsWith(n));
    if (!p) throw new Error(`"${n}" not on the menu: run scripts/seed-dev.mjs first`);
    return p;
  };
  const rice = find('Fried Rice');
  const latte = find('Iced Latte');
  const egg = rice.modifiers?.flatMap((g) => g.items ?? []).find((i) => i.name === 'Fried egg');
  if (!egg) throw new Error('Fried Rice has no "Fried egg" option: run scripts/seed-dev.mjs first');
  const names = modifierNames(menu);

  const free = (await api.tables()).filter((t) => !t.order && t.status === 'available');
  if (free.length < 2) throw new Error('Needs two free tables');
  const [a, b] = free as [(typeof free)[0], (typeof free)[0]];
  console.log(`Using ${a.table_name} and ${b.table_name}\n`);
  const created: string[] = [];

  const add = async (tableId: string, product: MenuProduct, qty: number, options: ModifierItem[] = [], note = '') =>
    addToTable(api, { table: await api.table(tableId), warehouseId: wh, product, qty, options, note }, randomUUID);

  try {
    await add(a.id, rice, 1, [egg], 'no chili');
    let t = await api.table(a.id);
    if (t.order) created.push(t.order.orderId);
    check('first item opens the order and marks the table taken', !!t.order && t.status === 'order_taken', `invoice ${t.order?.invoiceNo}`);
    const riceLine = activeLines(t.order).find((l) => l.variantId === rice.variantId)!;
    const extras = lineExtras(riceLine, names);
    check('option and note saved on the line', extras.options.join() === 'Fried egg' && extras.note === 'no chili', JSON.stringify(extras));
    const ricePrice = Number(rice.price) + Number(egg.price);
    check('line priced with the option', Number(riceLine.totalAmount) === ricePrice, riceLine.totalAmount);

    await add(a.id, latte, 2);
    await add(a.id, latte, 1);
    t = await api.table(a.id);
    const latteLines = activeLines(t.order).filter((l) => l.variantId === latte.variantId);
    check('same plain item merges into one pending line', latteLines.length === 1 && pendingQty(latteLines[0]!) === 3);

    await api.setPendingQty(t.order!.orderId, latteLines[0]!.orderDetailId, 2);
    t = await api.table(a.id);
    check('pending quantity can be lowered', orderCounts(t.order).pending === 3, JSON.stringify(orderCounts(t.order)));
    const expected = ricePrice + 2 * Number(latte.price);
    check('order total is right', Number(t.order!.totalAmount) === expected, `${t.order!.totalAmount} vs ${expected}`);

    await api.sendToKitchen(t.order!.orderId, kitchenMoves(t.order));
    t = await api.table(a.id);
    const c = orderCounts(t.order);
    check('send to kitchen moves everything pending to cooking', c.pending === 0 && c.cooking === 3, JSON.stringify(c));

    await add(a.id, latte, 1);
    t = await api.table(a.id);
    const lattes = activeLines(t.order).filter((l) => l.variantId === latte.variantId);
    check('after sending, the same item starts a new pending line', lattes.length === 2 && lattes.some((l) => pendingQty(l) === 1 && statusQty(l, 'cooking') === 0));
    const newLine = lattes.find((l) => pendingQty(l) === 1)!;
    await api.removeLine(t.order!.orderId, newLine.orderDetailId);
    t = await api.table(a.id);
    check('a pending line can be removed', activeLines(t.order).filter((l) => l.variantId === latte.variantId).length === 1);

    // "Customize Your Order" actions on the rice line (now cooking): note with a charge,
    // manual discount, serve, and options off/on. Totals are kh-pos's own sums.
    const orderId = t.order!.orderId;
    const riceId = riceLine.orderDetailId;
    const riceNow = async () => activeLines((await api.table(a.id)).order).find((l) => l.orderDetailId === riceId)!;
    await api.updateNote(orderId, { orderDetailId: riceId, notes: 'extra spicy', price: 1 });
    let r = await riceNow();
    check('note updated with an extra charge', lineExtras(r, names).note === 'extra spicy' && Number(r.totalAmount) === ricePrice + 1, r.totalAmount);
    await api.setManualDiscount(orderId, { itemId: riceId, amount: 10, discountType: 'PERCENTAGE' });
    r = await riceNow();
    check('10% manual discount applied', Math.abs(Number(r.totalAmount) - (ricePrice + 1) * 0.9) < 0.01, r.totalAmount);
    await api.moveStatus(orderId, [{ orderDetailId: riceId, fromStatus: 'cooking', toStatus: 'served', qty: 1 }]);
    r = await riceNow();
    check('Serve moves preparing to served', statusQty(r, 'served') === 1 && statusQty(r, 'cooking') === 0);
    await api.removeModifier(orderId, { orderDetailId: riceId, modifierItemId: egg.id });
    r = await riceNow();
    check('option removed, total recalculated', Math.abs(Number(r.totalAmount) - (Number(rice.price) + 1) * 0.9) < 0.01, r.totalAmount);
    await api.addModifier(orderId, { orderDetailId: riceId, modifierItemId: egg.id, price: Number(egg.price) });
    check('promotions list loads', Array.isArray(await api.promotionsFor(rice.productId)));
    const expected2 = (ricePrice + 1) * 0.9 + 2 * Number(latte.price);

    const row = (await api.tables()).find((x) => x.id === a.id)!;
    check('tables list shows the order', row.status === 'order_taken' && Math.abs(Number(row.order?.totalAmount) - expected2) < 0.01, row.order?.totalAmount);

    // Two phones add to the same free table at the same moment.
    const freeB = await api.table(b.id);
    const results = await Promise.allSettled([
      addToTable(api, { table: freeB, warehouseId: wh, product: rice, qty: 1, options: [], note: '' }, randomUUID),
      addToTable(api, { table: freeB, warehouseId: wh, product: latte, qty: 1, options: [], note: '' }, randomUUID),
    ]);
    t = await api.table(b.id);
    if (t.order) created.push(t.order.orderId);
    check(
      'two phones on one free table: both items land on a single order',
      results.every((r) => r.status === 'fulfilled') && activeLines(t.order).length === 2,
      results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok')).join(' / '),
    );
  } finally {
    for (const id of created) await deleteOrder(id);
    for (const table of [a, b]) await api.setTableStatus(table.id, 'available');
    console.log(`\nCleaned up: ${created.length} order(s) deleted, tables freed.`);
  }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error('ERROR', e instanceof Error ? e.message : e);
  process.exit(1);
});
