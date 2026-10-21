import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ModifierItem, OrderDetailResult, OrderLine, PaymentMethod } from '@/lib/api';
import { can } from '@/lib/line';
import { splitTitle } from '@/lib/menu';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { buildReturns, refundFor, returnableQty, returnedQty, statusTone } from '@/lib/orders';
import { lineExtras } from '@/lib/order';
import { methodNames, receiptFromDetail, type Receipt } from '@/lib/receipt';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Field, Stepper } from '@/ui/components';
import { ReceiptSheet } from '@/ui/receipt-sheet';
import { ScreenHeader } from '@/ui/screen-header';
import { errorKind, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const sumOf = (xs: (string | number | undefined)[]) => xs.reduce<number>((a, b) => a + (Number(b) || 0), 0);

/** Names of the options on a finished order's lines, from the dish data kh-pos sends with them. */
function optionNames(lines: OrderLine[]): Map<string, ModifierItem> {
  const map = new Map<string, ModifierItem>();
  for (const l of lines) for (const g of l.productVariant?.basicProduct?.modifiers ?? []) for (const i of g.items ?? []) map.set(i.id, i);
  return map;
}

/**
 * One order like the kh-pos Order Details: lines with options, returns and discounts, totals and
 * payments. Receipt (share or print), return portions, reverse a paid order to a draft, delete an
 * unpaid one. Returning, reversing and deleting need the server (they move money and stock).
 */
export default function OrderDetailScreen() {
  const { t } = useTranslation();
  const { id, receipt: openReceipt } = useLocalSearchParams<{ id: string; receipt?: string }>();
  const { api, user } = useSession();
  const { data } = useOffline();
  const { currency, exchangeRate } = useBranch();
  const writer = useRecordWriter();

  const [detail, setDetail] = useState<OrderDetailResult | null>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [error, setError] = useState<unknown>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [chosen, setChosen] = useState<Record<string, { qty: number; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('order', id, () => api.orderDetail(id));
      setDetail(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
    data.paymentMethods().then((r) => setMethods(r.data), () => undefined);
  }, [data, api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const names = useMemo(() => optionNames(detail?.orderDetail ?? []), [detail]);

  // Opened from the order list's "Print Receipt": show the receipt once the order has loaded.
  const receiptShown = useRef(false);
  useEffect(() => {
    if (detail && openReceipt === '1' && !receiptShown.current) {
      receiptShown.current = true;
      setReceipt(receiptFromDetail(detail, { names, methods: methodNames(methods), exchangeRate, currency }));
    }
  }, [detail, openReceipt, names, methods, exchangeRate, currency]);

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('orders.detail')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const info = detail.orderInfo;
  const lines = detail.orderDetail.filter((l) => Number(l.qty) > 0 || returnedQty(l) > 0);
  const discount = sumOf(lines.map((l) => l.discountAmount));
  const subtotal = lines.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0) + (Number(l.modiferAmount) || 0), 0);
  const total = subtotal - discount;
  const received = sumOf(detail.payments.map((p) => p.amountUsd ?? p.amount));
  const change = received <= 0 ? 0 : received - total;
  const completed = info.orderStatus === 'COMPLETED';
  const draft = info.orderStatus === 'DRAFT';
  const money = (v: number | string) => formatMoney(v, currency);
  const returns = buildReturns(info.orderId, lines, chosen);

  async function reload() {
    setChosen({});
    await load();
  }

  function confirmReturn() {
    if (returns.length === 0) return;
    const refund = returns.reduce((a, r) => a + r.refundAmount, 0);
    Alert.alert(t('orders.returnConfirm', { amount: money(refund) }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.return'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(true);
            try {
              // sent at once, or kept on the phone and sent once when kh-pos can be reached (it pays money back)
              const how = await writer({ entity: 'order-return', op: 'action', recordId: `return:${info.orderId}:${returns.map((r) => `${r.orderItemId}x${r.quantity}`).join(',')}`, method: 'POST', path: '/api/pos/return', body: returns, once: true, label: `${t('orders.return')} #${info.invoiceNo}` });
              Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('orders.returned', { count: returns.length }));
              await reload();
            } catch (e) {
              Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          })(),
      },
    ]);
  }

  function confirmUndo() {
    Alert.alert(t('orders.undoTitle', { no: info.invoiceNo }), t('orders.undoWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.undo'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(true);
            try {
              const how = await writer({ entity: 'order', op: 'action', recordId: `undo:${info.orderId}`, method: 'PUT', path: `/api/pos/order/${encodeURIComponent(info.orderId)}/undo-from-complete-to-draft`, body: {}, once: true, label: `${t('orders.undo')} #${info.invoiceNo}` });
              Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('orders.undone'));
              if (how === 'done' && info.tableNumber) router.replace({ pathname: '/table/[id]', params: { id: info.tableNumber } });
              else await reload();
            } catch (e) {
              Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          })(),
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(t('orders.deleteTitle', { no: info.invoiceNo }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('orders.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(true);
            try {
              const how = await writer({ entity: 'order', op: 'action', recordId: `delete:${info.orderId}`, method: 'DELETE', path: `/api/pos/order/${encodeURIComponent(info.orderId)}`, once: true, label: `${t('orders.delete')} #${info.invoiceNo}` });
              if (how === 'queued') Alert.alert(t('offline.savedOffline'));
              router.back();
            } catch (e) {
              Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error ? e.message : undefined);
              setBusy(false);
            }
          })(),
      },
    ]);
  }

  const showReceipt = () => setReceipt(receiptFromDetail(detail, { names, methods: methodNames(methods), exchangeRate, currency }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={`${t('orders.detail')} #${info.invoiceNo}`} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.heading}>#{info.invoiceNo}</Text>
            <Badge tone={statusTone(info.orderStatus ?? '')} text={t(`orders.status_${info.orderStatus}`, { defaultValue: info.orderStatus ?? '' })} />
          </View>
          {info.tableName ? <Text style={styles.muted}>{t('receipt.table')}: {info.tableName}</Text> : null}
          <Text style={styles.muted}>
            {t('orders.createdBy')}: {info.createdBy?.fullname || info.createdBy?.username || '-'} · {info.createdAt}
          </Text>
          {detail.payments[0] ? (
            <Text style={styles.muted}>
              {t('orders.checkoutBy')}: {(detail.payments[0] as { createdBy?: { fullname?: string } }).createdBy?.fullname ?? '-'} · {info.paidAt ?? ''}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <Button title={t('orders.receipt')} variant="outline" size="sm" onPress={showReceipt} style={styles.flex} />
            {draft && info.tableNumber ? <Button title={t('orders.openOrder')} size="sm" onPress={() => router.push({ pathname: '/table/[id]', params: { id: info.tableNumber! } })} style={styles.flex} /> : null}
          </View>
        </Card>

        {lines.map((l) => {
          const { name, variant } = splitTitle(l.title);
          const { options, note } = lineExtras(l, names);
          const left = returnableQty(l);
          const pick = chosen[l.orderDetailId];
          return (
            <Card key={l.orderDetailId} style={styles.card}>
              <View style={styles.row}>
                <Text style={[styles.heading, styles.flex]}>
                  {l.qty} × {name}
                  {variant ? ` (${variant})` : ''}
                </Text>
                <Text style={styles.heading}>{money(l.totalAmount)}</Text>
              </View>
              <Text style={styles.muted}>
                {money(l.price)}
                {Number(l.discountAmount) > 0 ? ` · ${t('receipt.discount')} -${money(l.discountAmount ?? 0)}` : ''}
              </Text>
              {options.length || note ? <Text style={styles.muted}>{[...options, note ? `"${note}"` : null].filter(Boolean).join(', ')}</Text> : null}
              {(l.orderReturns ?? []).map((r, i) => (
                <Text key={i} style={styles.returned}>
                  ↩ {t('orders.returnedLine', { qty: r.quantity, amount: money(r.refundAmount ?? 0) })}
                  {r.reason ? ` · ${r.reason}` : ''}
                </Text>
              ))}
              {completed && left > 0 && can(user, 'order', 'update') ? (
                pick ? (
                  <View style={styles.returnBox}>
                    <View style={styles.row}>
                      <Stepper value={pick.qty} min={1} max={left} onChange={(q) => setChosen((c) => ({ ...c, [l.orderDetailId]: { ...pick, qty: q } }))} editable valueLabel={t('orders.return')} />
                      <Text style={styles.muted}>{t('orders.refund', { amount: money(refundFor(l, pick.qty)) })}</Text>
                    </View>
                    <Field label={t('orders.reason')} value={pick.reason} onChangeText={(v) => setChosen((c) => ({ ...c, [l.orderDetailId]: { ...pick, reason: v } }))} />
                    <Button
                      title={t('common.cancel')}
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        setChosen((c) => {
                          const { [l.orderDetailId]: _removed, ...rest } = c;
                          return rest;
                        })
                      }
                    />
                  </View>
                ) : (
                  <Button title={t('orders.return')} variant="outline" size="sm" onPress={() => setChosen((c) => ({ ...c, [l.orderDetailId]: { qty: left, reason: '' } }))} />
                )
              ) : null}
            </Card>
          );
        })}

        <Card style={styles.card}>
          <Line label={t('orders.subtotal')} value={money(subtotal)} />
          <Line label={t('receipt.discount')} value={money(discount)} />
          <Line label={t('receipt.total')} value={money(total)} bold />
          {detail.payments.length > 0 ? (
            <>
              <Text style={[styles.heading, styles.gap]}>{t('orders.payments')}</Text>
              {detail.payments.map((p, i) => (
                <Line key={i} label={`${methodNames(methods).get(p.paymentMethod) ?? p.paymentMethod} (${p.currency})`} value={formatMoney(p.amount, p.currency)} />
              ))}
              <Line label={t('checkout.received')} value={money(received)} bold />
              <Line label={t('receipt.change')} value={money(change)} bold />
            </>
          ) : null}
        </Card>

        {returns.length > 0 ? <Button title={t('orders.returnSelected', { count: returns.length })} variant="destructive" loading={busy} onPress={confirmReturn} /> : null}
        {completed ? <Button title={t('orders.undo')} variant="outline" loading={busy} onPress={confirmUndo} /> : null}
        {draft && can(user, 'order', 'delete') ? <Button title={t('orders.delete')} variant="outline" loading={busy} onPress={confirmDelete} /> : null}
      </ScrollView>
      <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.label, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  returned: { fontSize: font.small, color: colors.destructive },
  label: { fontSize: font.body, color: colors.foreground },
  bold: { fontWeight: '700' },
  gap: { marginTop: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  returnBox: { gap: space.sm, marginTop: space.xs },
});
