import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MenuProduct, OrderLine, PosInfo, RestaurantTable } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { addToTable, kitchenMoves, modifierNames, orderCounts } from '@/lib/order';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button } from '@/ui/components';
import { MenuBrowser } from '@/ui/menu-browser';
import { OrderSheet } from '@/ui/order-sheet';
import { ProductSheet, type ProductChoice } from '@/ui/product-sheet';
import { errorKind, ErrorState, LoadingState } from '@/ui/states';
import { colors, font, space } from '@/ui/theme';

const REFRESH_MS = 15_000;
const BAR_HEIGHT = 72;

/** One table: the menu to add items, and the table's order with Send to kitchen. */
export default function TableScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const { warehouseId, currency } = useBranch();
  const insets = useSafeAreaInsets();

  const [table, setTable] = useState<RestaurantTable | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const posInfoCache = useRef<{ posInfo?: PosInfo }>({});

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

  /** Runs a change against kh-pos, then reloads the table from the server. */
  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error && e.message !== errorKind(e) ? e.message : undefined);
      return false;
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function add(choice: ProductChoice) {
    if (!table || !product) return;
    const fresh = await api.table(table.id).catch(() => table); // latest order, in case another phone changed it
    const ok = await run(() =>
      addToTable(
        api,
        { table: fresh, warehouseId, product, qty: choice.qty, options: choice.options, note: choice.note },
        () => Crypto.randomUUID(),
        posInfoCache.current,
      ),
    );
    if (ok) setProduct(null);
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
    const order = table?.order;
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.tableName} numberOfLines={1}>
            {table.table_name}
          </Text>
          {table.order ? <Text style={styles.invoice}>{t('order.invoice', { no: table.order.invoiceNo })}</Text> : null}
        </View>
        <Badge text={t(`tableStatus.${table.status}`)} tone={table.status === 'order_taken' ? 'default' : 'outline'} />
      </View>

      <MenuBrowser
        api={api}
        warehouseId={warehouseId}
        currency={currency}
        onSelect={setProduct}
        onProducts={setProducts}
        bottomInset={counts.lines > 0 ? BAR_HEIGHT : 0}
      />

      {counts.lines > 0 ? (
        <Pressable
          onPress={() => setOrderOpen(true)}
          accessibilityRole="button"
          style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}
        >
          <View style={styles.flex}>
            <Text style={styles.barTitle}>{t('order.view', { count: counts.portions })}</Text>
            {counts.pending > 0 ? <Text style={styles.barPending}>{t('tables.toSend', { count: counts.pending })}</Text> : null}
          </View>
          <Text style={styles.barTotal}>{formatMoney(table.order?.totalAmount ?? 0, currency)}</Text>
        </Pressable>
      ) : null}

      <ProductSheet product={product} currency={currency} busy={busy} onClose={() => setProduct(null)} onAdd={(c) => void add(c)} />
      <OrderSheet
        visible={orderOpen}
        tableName={table.table_name}
        order={table.order}
        names={names}
        currency={currency}
        busy={busy}
        onClose={() => setOrderOpen(false)}
        onSetPending={setPending}
        onRemove={remove}
        onSend={() => void send()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
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
  invoice: { fontSize: 12, color: colors.mutedForeground },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.primary,
  },
  barTitle: { fontSize: font.body, fontWeight: '700', color: colors.primaryForeground },
  barPending: { fontSize: 12, color: '#fbbf24', marginTop: 2 },
  barTotal: { fontSize: font.title, fontWeight: '700', color: colors.primaryForeground },
});
