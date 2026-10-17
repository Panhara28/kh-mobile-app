import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MenuProduct, OrderLine, PosInfo, RestaurantTable } from '@/lib/api';
import { activeLines, addToTable, kitchenMoves, modifierNames, orderCounts } from '@/lib/order';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button } from '@/ui/components';
import { CartDrawer } from '@/ui/cart-drawer';
import { MenuBrowser } from '@/ui/menu-browser';
import { ProductSheet, type ProductChoice } from '@/ui/product-sheet';
import { errorKind, ErrorState, LoadingState } from '@/ui/states';
import { colors, font, space } from '@/ui/theme';

const REFRESH_MS = 15_000;

/**
 * One table. Tapping a dish adds it to the cart at once (like the kh-pos web POS); holding it
 * opens options and a note. The cart button opens a drawer with the order and Send to kitchen.
 */
export default function TableScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const { warehouseId, currency } = useBranch();

  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  /** Taps queued but not yet saved, per variant: shown at once on the badges. */
  const [queued, setQueued] = useState<Map<string, number>>(new Map());
  const posInfoCache = useRef<{ posInfo?: PosInfo }>({});
  const addQueue = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    try {
      setTable(await api.table(id));
      setLoadError(null);
    } catch (e) {
      setLoadError(e);
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const h = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(h);
    }, [load]),
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

  /** Adds one portion. Taps are saved one after another so none is lost or doubled. */
  function quickAdd(p: MenuProduct, choice: ProductChoice = { qty: 1, options: [], note: '' }) {
    bump(p.variantId, choice.qty);
    const job = addQueue.current.then(async () => {
      try {
        const fresh = await api.table(id); // latest order: another phone may have changed it
        await addToTable(
          api,
          { table: fresh, warehouseId, product: p, qty: choice.qty, options: choice.options, note: choice.note },
          () => Crypto.randomUUID(),
          posInfoCache.current,
        );
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

  /** Runs a cart change against kh-pos, then reloads the table from the server. */
  async function run(action: () => Promise<void>): Promise<boolean> {
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
    if (orderId) void run(() => api.setPendingQty(orderId, line.orderDetailId, qty));
  }

  function remove(line: OrderLine) {
    const orderId = table?.order?.orderId;
    if (orderId) void run(() => api.removeLine(orderId, line.orderDetailId));
  }

  async function send() {
    await addQueue.current; // include taps still being saved
    const fresh = await api.table(id).catch(() => table);
    const order = fresh?.order;
    const moves = kitchenMoves(order);
    if (!order || moves.length === 0) return;
    const ok = await run(() => api.sendToKitchen(order.orderId, moves));
    if (ok) Alert.alert(t('order.sent'));
  }

  if (!table) {
    return (
      <SafeAreaView style={styles.safe}>
        {loadError ? <ErrorState error={loadError} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const cartCount = counts.portions + queuedTotal;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.tableName} numberOfLines={1}>
            {table.table_name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {table.order ? t('order.invoice', { no: table.order.invoiceNo }) : t(`tableStatus.${table.status}`)}
          </Text>
        </View>
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
        warehouseId={warehouseId}
        currency={currency}
        onSelect={(p) => void quickAdd(p)}
        onLongSelect={setProduct}
        inCart={inCart}
        onProducts={setProducts}
      />

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
        tableName={table.table_name}
        order={table.order}
        names={names}
        currency={currency}
        busy={busy || queuedTotal > 0}
        onClose={() => setCartOpen(false)}
        onSetPending={setPending}
        onRemove={remove}
        onSend={() => void send()}
      />
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
