import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CheckoutPayment, MenuProduct, OrderLine, PaymentMethod, PosInfo, RestaurantTable } from '@/lib/api';
import { applyOutbox } from '@/lib/offline/overlay';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useOffline } from '@/lib/offline/provider';
import type { CommandKind, CommandPayload, NewCommand } from '@/lib/offline/types';
import { activeLines, addToTable, canCheckout, kitchenMoves, modifierNames, modifierPrice, orderCounts, pendingQty, serveMoves, statusQty } from '@/lib/order';
import { orderTotal } from '@/lib/payment';
import { methodNames, receiptFromCheckout, receiptFromDetail, type Receipt } from '@/lib/receipt';
import { toKhPosTime } from '@/lib/time';
import { useShift } from '@/lib/use-shift';
import { can } from '@/lib/line';
import { selectAll, selectedCount, type TransferBody } from '@/lib/transfer';
import { useSession } from '@/lib/session';
import { isGroupSeat } from '@/lib/table-groups';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button } from '@/ui/components';
import { CartDrawer } from '@/ui/cart-drawer';
import { CheckoutSheet } from '@/ui/checkout-sheet';
import { TransferSheet } from '@/ui/transfer-sheet';
import { CartDiscountSheet, type CartDiscountRow } from '@/ui/cart-discount-sheet';
import { OrderTypeSheet } from '@/ui/order-type-sheet';
import { orderTypeBody, servedTypeOf, type CustomerRow, type ServedType } from '@/lib/customers';
import { ReceiptSheet } from '@/ui/receipt-sheet';
import { CustomizeLine, type LineApi } from '@/ui/customize-line';
import { MenuBrowser } from '@/ui/menu-browser';
import { PromotionPicker } from '@/ui/promotion-picker';
import { buildLines, defaultChoices, type PromotionSet, needsChoice, unavailable, visibleSets, type PromotionLine, type PromotionSlot, type SummaryLabels, type VisibleSet } from '@/lib/promotion-set';
import { ApiError } from '@/lib/api';
import { ProductSheet, type ProductChoice } from '@/ui/product-sheet';
import { errorKind, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner, SyncBadge } from '@/ui/sync-status';
import { colors, font, space } from '@/ui/theme';

const REFRESH_MS = 15_000;

/**
 * One table. Tapping a dish adds it to the cart at once (like the kh-pos web POS); holding it
 * opens options and a note. The cart button opens a drawer with the order and Send to kitchen.
 *
 * Works without kh-pos: the table comes from the saved copy, and every change (adding dishes,
 * quantities, Prepare and Serve, options, notes, discounts, promotions, guests, Send to kitchen,
 * resend) is done at once when kh-pos can be reached, and otherwise kept on the phone, shown on
 * screen right away, and sent later (see lib/offline).
 */
export default function TableScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = useSession();
  const { data, engine, state } = useOffline();
  const writer = useRecordWriter();
  const { warehouseId, currency, capEnabled, exchangeRate } = useBranch();
  const { shift, reload: reloadShift } = useShift();

  /** The table as kh-pos (or the saved copy) has it; changes waiting to be sent are added on top. */
  const [saved, setSaved] = useState<RestaurantTable | null>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  /** Cart line open in "Customize Your Order". */
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [transferTables, setTransferTables] = useState<RestaurantTable[] | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [promoSets, setPromoSets] = useState<VisibleSet[]>([]);
  const [promoBusy, setPromoBusy] = useState<string | null>(null);
  const [promoPick, setPromoPick] = useState<{ title: string; slots: PromotionSlot[] } | null>(null);
  /** Taps queued but not yet saved, per variant: shown at once on the badges. */
  const [queued, setQueued] = useState<Map<string, number>>(new Map());
  const posInfoCache = useRef<{ posInfo?: PosInfo }>({});
  const addQueue = useRef<Promise<void>>(Promise.resolve());

  const table = useMemo(() => (saved ? applyOutbox(saved, state.commands) : null), [saved, state.commands]);
  /** "Table + Tag" style: this screen is one group at the table (lib/table-groups.ts). */
  const groupSeat = isGroupSeat(id);
  const seatName = !table
    ? ''
    : table.order?.tagNo
      ? `${table.table_name} · ${t('tables.tag')} ${table.order.tagNo}`
      : groupSeat
        ? `${table.table_name} · ${t('tables.newGroupTitle')}`
        : table.table_name;

  const load = useCallback(async () => {
    try {
      const r = await data.table(id);
      setSaved(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    }
    // payment methods and the shift are needed for checkout (saved copies when offline)
    data.paymentMethods().then((r) => setMethods(r.data), () => undefined);
    void reloadShift();
  }, [data, id, reloadShift]);

  // Reload when the screen is shown, when changes were sent to kh-pos, or when kh-pos is back.
  const { syncVersion, online } = state;
  useFocusEffect(
    useCallback(() => {
      void load();
      const h = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(h);
    // syncVersion and online are triggers: reload when changes were sent or kh-pos came back
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, syncVersion, online]),
  );

  // the sets running at this branch (the saved copy offline); re-checked every minute for happy hours
  useEffect(() => {
    let live = true;
    let all: PromotionSet[] = [];
    const refresh = () => live && setPromoSets(visibleSets(all, toKhPosTime(new Date())));
    data.promotionSets(warehouseId).then(
      (r) => {
        all = r.data;
        refresh();
      },
      () => undefined,
    );
    const timer = setInterval(refresh, 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [data, warehouseId, online]);

  const promoLabels: SummaryLabels = useMemo(
    () => ({ free: t('promo.free'), percentOff: (v) => `-${v}%`, amountOff: (v) => t('promo.amountOff', { value: `${currency === 'KHR' ? '៛' : '$'}${v}` }) }),
    [t, currency],
  );
  const names = useMemo(() => modifierNames(products), [products]);
  const counts = orderCounts(table?.order);
  const queuedTotal = [...queued.values()].reduce((a, b) => a + b, 0);

  /** Portions per dish in the cart, including taps still being saved. */
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of activeLines(table?.order)) m.set(l.variantId, (m.get(l.variantId) ?? 0) + Number(l.qty));
    for (const [v, n] of queued) m.set(v, (m.get(v) ?? 0) + n);
    return m;
  }, [table, queued]);

  function showError(e: unknown) {
    Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error && e.message !== errorKind(e) ? e.message : undefined);
  }

  const bump = (variantId: string, by: number) =>
    setQueued((prev) => {
      const next = new Map(prev);
      const n = (next.get(variantId) ?? 0) + by;
      if (n > 0) next.set(variantId, n);
      else next.delete(variantId);
      return next;
    });

  const command = <K extends CommandKind>(kind: K, payload: CommandPayload[K]): NewCommand<K> => ({
    id: Crypto.randomUUID(),
    userId: user?.id ?? '',
    kind,
    tableId: id,
    payload,
    createdAt: Date.now(),
  });

  /**
   * Adds one portion. Taps are saved one after another so none is lost or doubled. If kh-pos
   * can't be reached the tap is kept on the phone and sent later; its order line id is made here
   * so every attempt uses the same one.
   */
  function quickAdd(p: MenuProduct, choice: ProductChoice = { qty: 1, options: [], note: '' }) {
    bump(p.variantId, choice.qty);
    const lineId = Crypto.randomUUID();
    const cmd = command('addLine', {
      lineId,
      product: { productId: p.productId, variantId: p.variantId, productTitle: p.productTitle, price: p.price, discountedPrice: p.discountedPrice },
      qty: choice.qty,
      options: choice.options,
      note: choice.note,
      warehouseId,
      capEnabled,
    });
    const job = addQueue.current.then(async () => {
      try {
        await engine.run(cmd, async () => {
          const fresh = await api.table(id); // latest order: another phone may have changed it
          await addToTable(
            api,
            { table: fresh, warehouseId, product: p, qty: choice.qty, options: choice.options, note: choice.note, capEnabled },
            () => lineId,
            posInfoCache.current,
          );
        });
      } catch (e) {
        showError(e);
      } finally {
        await load();
        bump(p.variantId, -choice.qty);
      }
    });
    addQueue.current = job;
    return job;
  }

  /** Adds the lines of a promotion set one after another; kh-pos works out the promotion price. */
  async function addPromotionLines(lines: PromotionLine[]) {
    for (const l of lines) await quickAdd(l.product as MenuProduct, { qty: l.quantity, options: [], note: '' });
  }

  /** Tap on a promotion card: the products for each slot come from kh-pos, then the set is added (after a pick when a slot has options). */
  function addPromotion(entry: VisibleSet) {
    const { promotion } = entry;
    if (entry.availability === 'waiting') {
      Alert.alert(entry.startsAt ? t('promo.notStarted', { title: promotion.title, time: entry.startsAt }) : t('promo.notStartedNoTime', { title: promotion.title }));
      return;
    }
    if (!online) {
      Alert.alert(t('offline.needsConnection'));
      return;
    }
    void (async () => {
      setPromoBusy(promotion.id);
      try {
        const slots = await api.promotionChoices(promotion.id);
        if (unavailable(slots)) {
          Alert.alert(t('promo.unavailable', { title: promotion.title }));
        } else if (needsChoice(slots)) {
          setPromoPick({ title: promotion.title, slots });
        } else {
          const lines = buildLines(slots, defaultChoices(slots));
          if (lines) {
            await addPromotionLines(lines);
            Alert.alert(t('promo.added', { title: promotion.title }));
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) Alert.alert(t('promo.notStartedNoTime', { title: promotion.title }));
        else Alert.alert(t('promo.loadFailed'));
      } finally {
        setPromoBusy(null);
      }
    })();
  }

  /** A change that can wait: done now when kh-pos is reachable, otherwise kept and sent later. */
  async function submit(cmd: NewCommand, online: () => Promise<void>): Promise<'done' | 'queued' | null> {
    setBusy(true);
    try {
      return await engine.run(cmd, online);
    } catch (e) {
      showError(e);
      return null;
    } finally {
      await load();
      setBusy(false);
    }
  }

  /** Runs Customize's change (done now or kept for later); shows kh-pos's refusal, reloads afterwards. */
  async function runLine(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally {
      await load();
      setBusy(false);
    }
  }

  function setPending(line: OrderLine, qty: number) {
    const orderId = table?.order?.orderId;
    if (!orderId) return;
    void submit(command('setPending', { orderDetailId: line.orderDetailId, qty, base: pendingQty(line) }), () => api.setPendingQty(orderId, line.orderDetailId, qty));
  }

  function remove(line: OrderLine) {
    const orderId = table?.order?.orderId;
    if (!orderId) return;
    void submit(command('removeLine', { orderDetailId: line.orderDetailId }), () => api.removeLine(orderId, line.orderDetailId));
  }

  /** Opens the payment screen after the web's checks: an open shift, everything served, stock in the POS slot. */
  async function startCheckout() {
    const order = table?.order;
    if (!order) return;
    if (!shift) {
      Alert.alert(t('checkout.noShift'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('checkout.openShift'), onPress: () => router.push('/shift') },
      ]);
      return;
    }
    if (!canCheckout(order)) {
      Alert.alert(t('checkout.notServed'));
      return;
    }
    if (engine.getState().online && !order.localOnly) {
      try {
        const need = (await api.stockToTransfer(activeLines(order).map((l) => ({ variantId: l.variantId, toFindQty: Number(l.qty) })))).filter((x) => x.slot && x.slot.posSlot === false);
        if (need.length > 0) {
          Alert.alert(t('checkout.needStock'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('checkout.tryAnyway'), onPress: () => setCheckoutOpen(true) },
          ]);
          return;
        }
      } catch {
        // the check is a courtesy: if it can't be made, kh-pos still refuses a payment it can't fulfil
      }
    }
    setCheckoutOpen(true);
  }

  /** Pays the order: done at once when kh-pos can be reached, otherwise kept and sent later. */
  async function completeCheckout(payments: CheckoutPayment[]) {
    const order = table?.order;
    if (!order || !table) return;
    const total = orderTotal(activeLines(order));
    const base = receiptFromCheckout({
      order,
      tableName: seatName,
      cashier: user?.fullname || user?.username || null,
      names,
      methods: methodNames(methods),
      payments,
      total,
      exchangeRate,
      currency,
      paidAt: toKhPosTime(new Date()),
      offline: false,
    });
    const orderId = order.orderId;
    const result = await submit(command('checkout', { payments, warehouseId, receipt: { ...base, offline: true } }), async () => {
      const slot = (await data.posInfo(warehouseId)).data;
      await api.checkout(orderId, { slotId: slot.posSlotId, payments });
    });
    if (!result) return;
    setCheckoutOpen(false);
    if (result === 'queued') {
      Alert.alert(t('checkout.savedOffline'));
      setReceipt({ ...base, offline: true });
      return;
    }
    try {
      setReceipt(receiptFromDetail(await api.orderDetail(orderId), { names, methods: methodNames(methods), exchangeRate, currency }));
    } catch {
      setReceipt(base); // paid, but kh-pos' copy couldn't be read: show what was paid
    }
  }

  /** Moving an order needs both tables as kh-pos has them, so nothing may be waiting to be sent. */
  async function startTransfer() {
    if (!table?.order) return;
    if (table.pendingSync || table.order.localOnly) {
      Alert.alert(t('transfer.syncFirst'));
      return;
    }
    try {
      // Offline this is the saved list of tables: the sheet then offers only free tables and the whole order.
      setTransferTables((await data.tables()).data.map((x) => applyOutbox(x, state.commands)));
    } catch (e) {
      showError(e);
    }
  }

  async function doTransfer(body: TransferBody, destination: RestaurantTable) {
    const order = table?.order;
    if (!order) return;
    setBusy(true);
    try {
      // the whole order onto a free table can be shown on the other table at once; anything else (part of an order, a
      // table that has an order) is kept and sent as it is. Either way it is written to the phone first.
      const moved = body.orderItems.reduce((a, i) => a + i.orderItemStatuses.reduce((b, st) => b + st.quantity, 0), 0);
      const whole = moved === selectedCount(selectAll(order)) && destination.status !== 'order_taken' && !destination.order;
      let how: 'done' | 'queued';
      if (whole) {
        how = await engine.run(
          command('transfer', { orderId: body.orderId, destinationTableId: destination.id, destinationName: destination.table_name, transferDiscount: body.transferDiscount, order }),
          () => api.transferTable(body),
        );
      } else {
        if (!engine.getState().online) setTransferTables(null);
        how = await writer({ entity: 'table-transfer', op: 'action', recordId: `transfer:${body.orderId}:${Date.now()}`, method: 'POST', path: '/api/transfer-table', body, once: true, label: `${t('transfer.button')}: ${destination.table_name}` });
      }
      setTransferTables(null);
      if (how === 'queued') {
        Alert.alert(t('transfer.savedOffline', { name: destination.table_name }));
        if (whole) router.back(); // the order is on the other table now
        return;
      }
      Alert.alert(t('transfer.done', { name: destination.table_name }));
      await load();
      if (!(await data.table(id).then((r) => r.data.order).catch(() => null))) router.back(); // the whole order moved
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  /** Discount cart: one manual-discount change per line, each done now or kept for later like any other. */
  async function applyCartDiscount(rows: CartDiscountRow[]) {
    const orderId = table?.order?.orderId;
    if (!orderId) return;
    setBusy(true);
    try {
      for (const r of rows) {
        await engine.run(command('setDiscount', { orderDetailId: r.orderDetailId, amount: r.amount, discountType: r.discountType }), () =>
          api.setManualDiscount(orderId, { itemId: r.orderDetailId, amount: r.amount, discountType: r.discountType }),
        );
      }
      setDiscountOpen(false);
    } catch (e) {
      showError(e);
    } finally {
      await load();
      setBusy(false);
    }
  }

  /** Order type changes the prices of a delivery, so it needs kh-pos as it is now (nothing waiting to be sent). */
  function startOrderType() {
    if (!table?.order) return;
    if (!engine.getState().online) {
      Alert.alert(t('offline.needsConnection'));
      return;
    }
    if (table.pendingSync || table.order.localOnly) {
      Alert.alert(t('transfer.syncFirst'));
      return;
    }
    setOrderTypeOpen(true);
  }

  async function applyOrderType(type: ServedType, customer: CustomerRow | null) {
    const orderId = table?.order?.orderId;
    if (!orderId) return;
    setBusy(true);
    try {
      const walkIn = (await data.posInfo(warehouseId)).data.posCustomerId;
      const body = orderTypeBody(type, walkIn, customer);
      if (!body) return;
      // sent at once, or kept on the phone and sent when kh-pos can be reached
      const how = await writer({ entity: 'order', op: 'action', recordId: `type:${orderId}`, method: 'PUT', path: `/api/pos/order/${encodeURIComponent(orderId)}/customer`, body, label: t('orderType.title') });
      if (how === 'queued') Alert.alert(t('offline.savedOffline'));
      setOrderTypeOpen(false);
    } catch (e) {
      showError(e);
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function resend(line: OrderLine, qty: number) {
    const result = await submit(command('resend', { orderDetailId: line.orderDetailId, qty }), () => api.resendToKitchen(line.orderDetailId, qty));
    if (result === 'done') Alert.alert(t('cart.resent'));
    else if (result === 'queued') Alert.alert(t('offline.resendQueued'));
  }

  /** ✓ in the cart: every preparing portion → served. */
  async function serveAll() {
    let served = false;
    const result = await submit(command('serveAll', {}), async () => {
      const order = (await api.table(id)).order;
      const moves = serveMoves(order);
      if (!order || moves.length === 0) return;
      await api.moveStatus(order.orderId, moves);
      served = true;
    });
    if (result === 'queued') Alert.alert(t('offline.savedOffline'));
    else if (result === 'done' && served) Alert.alert(t('cart.servedAll'));
  }

  /** Customize Your Order's changes: each is done now, or kept on the phone and sent later. */
  const toOutbox = (cmd: NewCommand, online: () => Promise<void>) => engine.run(cmd, online).then(() => undefined);
  /** What the screen shows now for a line in one status (the base of an offline quantity change). */
  const shownQty = (orderDetailId: string, status: 'pending' | 'cooking' | 'served') => {
    const line = (table?.order?.items ?? []).find((l) => l.orderDetailId === orderDetailId);
    return line ? statusQty(line, status) : undefined;
  };
  const lineApi: LineApi = {
    setStatusQty: (orderId, orderDetailId, status, qty) =>
      toOutbox(command('setStatus', { orderDetailId, status, qty, base: shownQty(orderDetailId, status) }), () => api.setStatusQty(orderId, orderDetailId, status, qty)),
    moveStatus: async (orderId, moves) => {
      for (const m of moves) {
        await toOutbox(command('moveStatus', { orderDetailId: m.orderDetailId, from: m.fromStatus, to: m.toStatus, qty: m.qty }), () => api.moveStatus(orderId, [m]));
      }
    },
    updateNote: (orderId, input) => toOutbox(command('setNote', input), () => api.updateNote(orderId, input)),
    addModifier: (orderId, input) =>
      input.modifierItemId === 'notes'
        ? toOutbox(command('setNote', { orderDetailId: input.orderDetailId, notes: input.notes ?? '', price: input.price }), () => api.addModifier(orderId, input))
        : toOutbox(
            command('setOption', { orderDetailId: input.orderDetailId, modifierItemId: input.modifierItemId, name: names.get(input.modifierItemId)?.name ?? '?', price: input.price, on: true }),
            () => api.addModifier(orderId, input),
          ),
    removeModifier: (orderId, input) =>
      toOutbox(
        command('setOption', {
          orderDetailId: input.orderDetailId,
          modifierItemId: input.modifierItemId,
          name: names.get(input.modifierItemId)?.name ?? '?',
          price: modifierPrice(names.get(input.modifierItemId) ?? {}),
          on: false,
        }),
        () => api.removeModifier(orderId, input),
      ),
    setManualDiscount: (orderId, input) =>
      toOutbox(command('setDiscount', { orderDetailId: input.itemId, amount: input.amount, discountType: input.discountType }), () => api.setManualDiscount(orderId, input)),
    addPromotion: (orderId, input) =>
      toOutbox(command('setPromotion', { orderDetailId: input.itemId, discountId: input.discountId, name: input.name, on: true }), () => api.addPromotion(orderId, input)),
    removePromotion: (orderId, input) =>
      toOutbox(command('setPromotion', { orderDetailId: input.itemId, discountId: input.discountId, name: input.name, on: false }), () => api.removePromotion(orderId, input)),
  };

  /** Discounts for a dish: live, or the copy saved the last time it was loaded online. */
  const loadPromotions = useCallback((productId: string) => data.promotions(productId).then((r) => r.data), [data]);

  function setGuests(count: number) {
    const orderId = table?.order?.orderId;
    if (!orderId) return;
    void submit(command('setGuests', { count }), () => api.setGuests(orderId, count));
  }

  async function send() {
    await addQueue.current; // include taps still being saved
    if (counts.pending < 1 && !engine.getState().online) return;
    let sent = false;
    const result = await submit(command('sendToKitchen', {}), async () => {
      const order = (await api.table(id)).order;
      const moves = kitchenMoves(order);
      if (!order || moves.length === 0) return;
      await api.sendToKitchen(order.orderId, moves);
      sent = true;
    });
    if (result === 'queued') Alert.alert(t('offline.sendQueued'));
    else if (result === 'done' && sent) Alert.alert(t('order.sent'));
  }

  if (!table) {
    return (
      <SafeAreaView style={styles.safe}>
        {loadError ? <ErrorState error={loadError} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const cartCount = counts.portions + queuedTotal;
  const openLine = activeLines(table.order).find((l) => l.orderDetailId === openLineId) ?? null;

  function openCustomize(line: OrderLine) {
    setCartOpen(false);
    setOpenLineId(line.orderDetailId);
  }

  function closeCustomize() {
    setOpenLineId(null);
    setCartOpen(true); // back to the cart
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.tableName} numberOfLines={1}>
            {seatName}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {table.order ? (table.order.localOnly ? t('offline.notOpened') : t('order.invoice', { no: table.order.invoiceNo })) : groupSeat ? t('tables.tagOnSave') : t(`tableStatus.${table.status}`)}
          </Text>
        </View>
        <SyncBadge />
        {table.order && !groupSeat && can(user, 'restaurant', 'update') ? <Button title="⇄" variant="outline" size="sm" onPress={() => void startTransfer()} accessibilityLabel={t('transfer.button')} /> : null}
        <Pressable
          onPress={() => setCartOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('cart.open', { count: cartCount })}
          style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}
        >
          {queuedTotal > 0 ? <ActivityIndicator size="small" color={colors.foreground} /> : <Text style={styles.cartIcon}>🛒</Text>}
          {cartCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {counts.pending > 0 ? (
        <Pressable onPress={() => setCartOpen(true)} style={styles.pendingBar} accessibilityRole="button">
          <Badge tone="warning" text={t('tables.toSend', { count: counts.pending })} />
          <Text style={styles.pendingHint}>{t('cart.sendHint')}</Text>
        </Pressable>
      ) : (
        <Text style={styles.hint}>{t('cart.hint')}</Text>
      )}

      <MenuBrowser
        api={api}
        data={data}
        warehouseId={warehouseId}
        currency={currency}
        onSelect={(p) => void quickAdd(p)}
        onLongSelect={setProduct}
        inCart={inCart}
        onProducts={setProducts}
        promotions={promoSets}
        onPromotion={addPromotion}
        promotionBusyId={promoBusy}
      />
      {promoPick ? (
        <PromotionPicker
          title={promoPick.title}
          slots={promoPick.slots}
          labels={promoLabels}
          currency={currency}
          imageFor={(c) => api.imageUrl(c.images?.[0]?.url)}
          onCancel={() => setPromoPick(null)}
          onAdd={(lines) => {
            const title = promoPick.title;
            setPromoPick(null);
            void addPromotionLines(lines).then(() => Alert.alert(t('promo.added', { title })));
          }}
        />
      ) : null}

      <ProductSheet
        product={product}
        currency={currency}
        busy={false}
        onClose={() => setProduct(null)}
        onAdd={(choice) => {
          if (product) void quickAdd(product, choice);
          setProduct(null);
        }}
      />
      <CartDrawer
        visible={cartOpen}
        tableName={seatName}
        order={table.order}
        names={names}
        imageFor={(variantId) => api.imageUrl(products.find((p) => p.variantId === variantId)?.images?.[0]?.url)}
        user={user}
        currency={currency}
        busy={busy || queuedTotal > 0}
        onClose={() => setCartOpen(false)}
        onSetPending={setPending}
        onDelete={remove}
        onResend={(line, qty) => void resend(line, qty)}
        onSend={() => void send()}
        onServeAll={() => void serveAll()}
        onDiscount={() => {
          setCartOpen(false);
          setDiscountOpen(true);
        }}
        onOrderType={() => {
          setCartOpen(false);
          startOrderType();
        }}
        onCheckout={() => {
          setCartOpen(false);
          void startCheckout();
        }}
        onSetGuests={setGuests}
        onOpenLine={openCustomize}
      />
      {orderTypeOpen && table.order ? <OrderTypeSheet api={api} current={servedTypeOf(table.order.servedType)} busy={busy} onClose={() => setOrderTypeOpen(false)} onApply={(ty, c) => void applyOrderType(ty, c)} /> : null}
      {discountOpen && table.order ? <CartDiscountSheet order={table.order} currency={currency} busy={busy} onClose={() => setDiscountOpen(false)} onApply={(rows) => void applyCartDiscount(rows)} /> : null}
      {checkoutOpen && table.order ? (
        <CheckoutSheet
          total={orderTotal(activeLines(table.order))}
          currency={currency}
          exchangeRate={exchangeRate}
          methods={methods}
          busy={busy}
          onClose={() => setCheckoutOpen(false)}
          onComplete={(p) => void completeCheckout(p)}
        />
      ) : null}
      {transferTables ? <TransferSheet table={table} tables={transferTables} busy={busy} onClose={() => setTransferTables(null)} onTransfer={(b, d) => void doTransfer(b, d)} /> : null}
      <ReceiptSheet
        receipt={receipt}
        onClose={() => {
          setReceipt(null);
          router.back(); // the table is paid: back to the tables
        }}
      />
      {openLine ? (
        <CustomizeLine
          line={openLine}
          orderId={table.order?.orderId ?? null}
          product={products.find((p) => p.variantId === openLine.variantId)}
          user={user}
          api={api}
          lineApi={lineApi}
          loadPromotions={loadPromotions}
          currency={currency}
          busy={busy}
          run={runLine}
          onClose={closeCustomize}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  tableName: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  sub: { fontSize: 12, color: colors.mutedForeground },
  cartButton: {
    width: 48,
    height: 42,
    marginRight: space.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.6 },
  cartIcon: { fontSize: 20 },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { color: colors.destructiveForeground, fontSize: 12, fontWeight: '700' },
  hint: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    backgroundColor: colors.warningBg,
  },
  pendingHint: { flex: 1, fontSize: 12, color: colors.warning },
});
