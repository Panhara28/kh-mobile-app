/**
 * Demo data for a small restaurant, on the phone: the same store, staff, menu, tables and week of sales as the kh-pos-v2
 * web demo (apps/api/scripts/seed-demo.mjs). Like there, everything is made through the kh-pos API (so the business
 * rules are the same); only what the API has no call for (roles, menu rows, back-dating history) is written directly.
 * Runs on a phone whose kh-pos has no users yet. Everyone signs in with password 123123.
 */
import type { SqlDriver } from './driver';

export const DEMO_PASSWORD = '123123';
const STORE = { name: 'BongIT Demo Restaurant', phone: '012 345 678', address: 'Toul Kork, Phnom Penh' };
const RATE = 4100;
const DAYS_OF_HISTORY = 6;
const TAG_COUNT = 50;

export const DEMO_STAFF = [
  { username: 'panhara', fullname: 'Panhara', role: 'Owner' },
  { username: 'sokha', fullname: 'Sokha Chan', role: 'SUPERVISOR' },
  { username: 'dara', fullname: 'Dara Kim', role: 'Service' },
  { username: 'vanna', fullname: 'Vanna Sok', role: 'Service' },
  { username: 'sreymom', fullname: 'Sreymom Lim', role: 'Cashier' },
] as const;

const ROLES: Record<string, Record<string, string>> = {
  SUPERVISOR: {
    order: 'create,read,update',
    shift: 'create,read,update',
    payment: 'create,read,update',
    product: 'create,read,update,delete',
    category: 'create,read,update',
    modifier: 'create,read,update',
    setting: 'create,read,update',
    dashboard: 'create,read,update,delete',
    'end-of-day': 'create,read,update,delete',
    restaurant: 'create,read,update,delete',
    'sale-report': 'create,read,update,delete',
    'sale-item-report': 'create,read,update,delete',
    'void-order': 'read',
    'order-preparation': 'create,read,update',
  },
  Cashier: {
    order: 'create,read,update',
    shift: 'create,read,update',
    product: 'read',
    category: 'read',
    'end-of-day': 'create,read,update,delete',
    restaurant: 'read,update,create',
    'sale-report': 'create,read,update,delete',
    'sale-item-report': 'create,read,update,delete',
    'order-preparation': 'create,read,update',
  },
  // waiters work only on the tables screen (no Orders page)
  Service: {
    restaurant: 'read,create,update',
    'order-preparation': 'read,create,update',
  },
};

type Dish = [name: string, price: number, cost: number, modifiers: string[]];
const MENU: [category: string, kitchen: boolean, dishes: Dish[]][] = [
  ['Rice & Noodles', true, [
    ['Fried Rice with Chicken', 3.5, 1.2, ['spice', 'addons']],
    ['Beef Lok Lak', 5.5, 2.2, ['spice', 'addons']],
    ['Kuy Teav Noodle Soup', 3.0, 1.0, ['spice']],
    ['Fried Noodles with Seafood', 4.5, 1.8, ['spice', 'addons']],
  ]],
  ['Soups & Curries', true, [
    ['Fish Amok', 6.0, 2.4, ['spice']],
    ['Khmer Red Curry', 5.0, 1.9, ['spice']],
    ['Samlor Korko', 4.5, 1.6, ['spice']],
    ['Tom Yum Soup', 5.5, 2.0, ['spice']],
  ]],
  ['Grill', true, [
    ['Bai Sach Chrouk (Pork & Rice)', 3.0, 1.0, ['addons']],
    ['Grilled Chicken Wings', 4.0, 1.5, ['spice']],
    ['BBQ Beef Skewers', 5.0, 2.0, ['spice']],
  ]],
  ['Drinks', false, [
    ['Iced Coffee with Milk', 1.5, 0.4, ['ice']],
    ['Lemon Iced Tea', 1.25, 0.3, ['ice']],
    ['Fresh Coconut', 2.0, 0.8, ['ice']],
    ['Angkor Beer', 1.5, 0.8, []],
    ['Coca-Cola', 1.0, 0.45, ['ice']],
    ['Mineral Water', 0.5, 0.15, []],
  ]],
  ['Desserts', true, [
    ['Mango Sticky Rice', 2.5, 0.9, []],
    ['Pumpkin Custard', 2.0, 0.7, []],
  ]],
];

const MODIFIERS: Record<string, [string, [string, number][]]> = {
  spice: ['Spice level', [['No chili', 0], ['Mild', 0], ['Extra spicy', 0]]],
  ice: ['Ice', [['Less ice', 0], ['No ice', 0]]],
  addons: ['Add-ons', [['Fried egg', 0.5], ['Extra rice', 0.5]]],
};

export interface DemoDeps {
  /** fetch for kh-pos on the phone (src/local/server.ts localFetch). */
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;
  /** The phone's kh-pos database, for what the API has no call for. */
  sql: SqlDriver;
  newId: () => string;
  /** 0..1 and what is being made, for a progress bar. */
  onProgress?: (done: number, what: string) => void;
  /** Table + Tag style (every order gets a numbered tag; T-01 seats two parties). */
  tags?: boolean;
}

/** Fills a blank phone kh-pos with the demo restaurant. Throws if it already has users. */
export async function seedDemoRestaurant({ fetch, sql, newId, onProgress = () => undefined, tags = false }: DemoDeps): Promise<{ orders: number }> {
  let seed = 20261124;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const money = (n: number) => Math.round(n * 100) / 100;
  // Phnom Penh is UTC+7 all year
  const ppNow = () => new Date(Date.now() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  const ppDate = (daysAgo: number) => new Date(Date.now() + 7 * 3600_000 - daysAgo * 86400_000).toISOString().slice(0, 10);
  const two = (n: number) => String(n).padStart(2, '0');
  const at = (date: string, h: number, m: number) => `${date} ${two(h)}:${two(m)}:${two(between(0, 59))}`;

  const call = async <T = any>(method: string, path: string, body?: unknown, token?: string): Promise<T> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`http://phone.local${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await r.json().catch(() => null)) as { success?: boolean; result?: T; error?: string } | null;
    if (r.status >= 300 || json?.success === false) throw new Error(`${method} ${path}: ${json?.error ?? r.status}`);
    return (json && 'result' in json ? json.result : json) as T;
  };
  const login = async (username: string) => (await call<{ token: string }>('POST', '/api/auth/login', { username, password: DEMO_PASSWORD })).token;
  const insert = (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    sql.run(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(row));
  };

  if (Number(sql.all('SELECT count(*) AS n FROM "user"', [])[0]?.n ?? 0) > 0) throw new Error('kh-pos on this phone already has users');

  onProgress(0.02, 'store');
  await call('POST', '/api/user/first-user', { warehouseName: STORE.name, ownerName: 'Panhara', userName: 'panhara', password: DEMO_PASSWORD, phoneNumber: STORE.phone, address: STORE.address });
  const owner = await login('panhara');
  const me = (await call<{ user: { id: string; currentWarehouseId: string } }>('GET', '/api/user/me', undefined, owner)).user;
  const warehouse = me.currentWarehouseId;
  const created = ppNow();

  onProgress(0.08, 'staff');
  const roleIds: Record<string, string> = {};
  for (const [role, permissions] of Object.entries(ROLES)) {
    roleIds[role] = newId();
    sql.run('INSERT INTO user_role (id, role, is_default, permissions, created_at) VALUES (?,?,0,?,?)', [roleIds[role], role, JSON.stringify(permissions), created]);
  }
  for (const s of DEMO_STAFF.slice(1)) {
    await call('POST', '/api/user', { username: s.username, password: DEMO_PASSWORD, fullname: s.fullname, phoneNumber: '0' + between(10000000, 99999999), profile: '', roleId: roleIds[s.role], warehouseId: warehouse }, owner);
  }

  onProgress(0.25, 'menu');
  const modifierIds: Record<string, string> = {};
  for (const [key, [title, items]] of Object.entries(MODIFIERS)) {
    modifierIds[key] = newId();
    insert('modifier', { modifier_id: modifierIds[key], title, description: '', created_at: created, created_by: me.id, updated_by: me.id });
    for (const [name, price] of items) insert('modifier_items', { id: newId(), modifier_id: modifierIds[key], name, price, created_at: created, created_by: me.id });
  }
  const dishes: { variantId: string; price: number; drink: boolean }[] = [];
  const kitchenCategories: string[] = [];
  MENU.forEach(([title, kitchen, items], sort) => {
    const categoryId = newId();
    insert('product_category', { id: categoryId, title, created_at: created, sort_order: sort });
    if (kitchen) kitchenCategories.push(categoryId);
    for (const [name, price, cost, mods] of items) {
      const productId = newId();
      const variantId = newId();
      insert('product', { id: productId, title: name, is_for_sale: 1, created_at: created, created_by: me.id });
      insert('product_variant', { id: variantId, name: 'Regular', product_id: productId, price, purchased_cost: cost, created_at: created });
      insert('product_categories', { product_id: productId, category_id: categoryId, created_at: created });
      for (const m of mods) insert('product_modifier', { product_id: productId, modifier_id: modifierIds[m] });
      dishes.push({ variantId, price, drink: !kitchen });
    }
  });

  onProgress(0.3, 'setup');
  await call('PUT', '/api/setup', { step: 'store', name: STORE.name, phone: STORE.phone, address: STORE.address, logo: '' }, owner);
  await call('PUT', '/api/setup', { step: 'type', systemType: 'RESTAURANT', edition: 'LITE' }, owner);
  await call('PUT', '/api/setup', { step: 'currency', currency: 'USD', exchangeRate: RATE }, owner);
  await call('PUT', '/api/setup', { step: 'payment' }, owner);
  await call('PUT', '/api/setup', {
    step: 'printers',
    printers: [{ id: 'kitchen', name: 'Kitchen', printerName: 'Kitchen printer', ip: '192.168.1.200', port: 9100 }],
    categories: kitchenCategories.map((categoryId) => ({ categoryId, printerId: 'kitchen' })),
  }, owner);
  await call('POST', '/api/table/layout', { count: 12, default: { key: 'T', capacity: 4, section: 'main-dining', shape: 'square' } }, owner);
  await call('PUT', '/api/setup', { step: 'tables', tableMode: tags ? 'TAG' : 'NORMAL', tagCount: TAG_COUNT }, owner);
  await call('POST', '/api/setup', {}, owner);

  onProgress(0.35, 'sales');
  const tables = sql.all('SELECT id, table_name FROM restaurant_tables WHERE deleted_at IS NULL ORDER BY table_name', []) as { id: string; table_name: string }[];
  const cashier = await login('sreymom');
  const waiters = [await login('dara'), await login('vanna')];
  const info = await call<{ posSlotId: string; posCustomerId: string }>('GET', `/api/pos/info?warehouse=${warehouse}`, undefined, owner);

  const basket = () => {
    const food = dishes.filter((d) => !d.drink);
    const drinks = dishes.filter((d) => d.drink);
    const merged = new Map<(typeof dishes)[number], number>();
    for (let i = between(1, 3); i > 0; i--) {
      const d = pick(food);
      merged.set(d, (merged.get(d) ?? 0) + between(1, 2));
    }
    for (let i = between(0, 2); i > 0; i--) {
      const d = pick(drinks);
      merged.set(d, (merged.get(d) ?? 0) + between(1, 3));
    }
    return [...merged];
  };
  let nextTag = 0;
  const takeTag = () => String((nextTag++ % TAG_COUNT) + 1);
  const order = async (table: { id: string }, token: string) => {
    const [invoiceNo] = await call<number[]>('GET', '/api/pos/auto_invoice_number?n=1', undefined, token);
    return call<string>('POST', '/api/pos/order', {
      warehouseId: warehouse,
      slotId: info.posSlotId,
      customerId: info.posCustomerId,
      invoiceNo: Number(invoiceNo),
      tableNumber: table.id,
      ...(tags ? { tagNo: takeTag() } : {}),
      items: basket().map(([d, qty]) => ({ id: newId(), variantId: d.variantId, qty, price: String(d.price) })),
    }, token);
  };
  const pay = async (id: string) => {
    const total = Number((await call<{ orderInfo: { totalAmount: string } }>('GET', `/api/pos/order/${id}`, undefined, cashier)).orderInfo.totalAmount);
    const bank = rand() < 0.35;
    await call('POST', `/api/pos/order/${id}/checkout`, {
      slotId: info.posSlotId,
      payments: [{ amount: total, paymentMethod: bank ? '2' : '1', currency: 'USD', amountUsd: total, exchangeRate: RATE, used: total }],
    }, cashier);
    return { total, cash: bank ? 0 : total };
  };
  // invoice numbers are YYYYMMDD + a daily count, so a moved order gets that day's number
  const invoiceSeq = new Map<string, number>();
  const backdate = (id: string, ts: string) => {
    const day = ts.slice(0, 10).replace(/-/g, '');
    const seq = (invoiceSeq.get(day) ?? 0) + 1;
    invoiceSeq.set(day, seq);
    sql.run('UPDATE customer_order SET created_at=?, updated_at=?, paid_at=CASE WHEN paid_at IS NULL THEN NULL ELSE ? END, invoice_no=? WHERE order_id=?', [ts, ts, ts, Number(day + String(seq).padStart(5, '0')), id]);
    sql.run('UPDATE customer_order_detail SET created_at=? WHERE order_id=?', [ts, id]);
    sql.run('UPDATE order_item_status SET created_at=? WHERE order_item_id IN (SELECT order_detail_id FROM customer_order_detail WHERE order_id=?)', [ts, id]);
    sql.run('UPDATE order_payment SET created_at=?, updated_at=? WHERE order_id=?', [ts, ts, id]);
  };

  let orders = 0;
  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 1; daysAgo--) {
    onProgress(0.35 + (0.5 * (DAYS_OF_HISTORY - daysAgo)) / DAYS_OF_HISTORY, 'sales');
    const date = ppDate(daysAgo);
    const shiftId = await call<string>('POST', '/api/shift/open', { openedCashUsd: 50, openedCashKhr: 100000, exchangeRate: RATE }, cashier);
    let cash = 0;
    const count = between(9, 16);
    for (let i = 0; i < count; i++) {
      const id = await order(tables[i % tables.length]!, waiters[i % 2]!);
      cash += (await pay(id)).cash;
      backdate(id, at(date, 11 + Math.floor((i * 10) / count), between(0, 59)));
      orders++;
    }
    // one evening the drawer is 50 cents short
    const counted = money(50 + cash - (daysAgo === 3 ? 0.5 : 0));
    await call('POST', '/api/shift/close', { shiftId, actualCashUsd: counted, actualCashKhr: 100000 }, cashier);
    sql.run('UPDATE shift SET opened_at=?, closed_at=?, updated_at=? WHERE shift_id=?', [at(date, 10, 30), at(date, 22, 0), at(date, 22, 0), shiftId]);
  }

  onProgress(0.9, 'today');
  const todayShift = await call<string>('POST', '/api/shift/open', { openedCashUsd: 50, openedCashKhr: 100000, exchangeRate: RATE }, cashier);
  const today = ppDate(0);
  sql.run('UPDATE shift SET opened_at=? WHERE shift_id=?', [`${today} 10:30:00`, todayShift]);
  const hourNow = Number(ppNow().slice(11, 13));
  const paidToday = Math.max(0, Math.min(6, hourNow - 10));
  for (let i = 0; i < paidToday; i++) {
    const id = await order(tables[i + 3]!, waiters[i % 2]!);
    await pay(id);
    backdate(id, at(today, 11 + Math.floor((i * Math.max(1, hourNow - 11)) / Math.max(1, paidToday)), between(0, 59)));
    orders++;
  }
  nextTag = 0; // the tags handed out so far belong to paid orders and are free again
  for (const t of tables.slice(0, 3)) await order(t, waiters[0]!);
  if (tags) await order(tables[0]!, waiters[1]!); // a second party shares T-01 under its own tag
  sql.exec('DELETE FROM print_queue'); // nothing was sent to the kitchen; keep the demo printer queue empty
  sql.exec("UPDATE restaurant_tables SET status='available' WHERE status='cleaning'"); // earlier guests have gone
  onProgress(1, 'done');
  return { orders };
}
