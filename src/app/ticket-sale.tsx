import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CheckoutPayment, PaymentMethod } from '@/lib/api';
import { movieName } from '@/lib/cinema';
import { dayText, parseDay } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { methodNames, receiptFromDetail, type Receipt } from '@/lib/receipt';
import { useSession } from '@/lib/session';
import { canSell, isFree, seatGrid, seatLabel, seatPrice, takenSeats, ticketCode, ticketLine, ticketsTotal, toggleSeat, type SaleShowtime } from '@/lib/ticket-sale';
import { useBranch } from '@/lib/use-branch';
import { useShift } from '@/lib/use-shift';
import { Badge, Button, Card, Input } from '@/ui/components';
import { CheckoutSheet } from '@/ui/checkout-sheet';
import { ReceiptSheet } from '@/ui/receipt-sheet';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

type Row = SaleShowtime & { variant?: { name?: string | null; basicProduct?: { title?: string | null } | null }[] | null };

/**
 * Sell cinema tickets: choose the day's showtime, tap seats on the hall map (a couple seat brings
 * its partner), then charge. The sale is opened in kh-pos as an order whose movie line carries the
 * seat reservations (pending until paid, then confirmed), paid with the shared payment screen.
 * It needs kh-pos, because the seats taken and the invoice number come from it.
 */
export default function TicketSaleScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { warehouseId, currency, exchangeRate } = useBranch();
  const { shift, reload: reloadShift } = useShift();

  const [day, setDay] = useState(() => dayText(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<{ orderId: string; slotId: string; total: number } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [version, setVersion] = useState(0);

  const valid = !!parseDay(day);

  const load = useCallback(async () => {
    if (!valid) return;
    try {
      // always read live: the seats taken must be current, never a saved copy
      const r = await api.call<{ result?: { data: Row[] } }>('GET', `/api/cinema/showtime?limit=100&offset=0&showDate=${day}`);
      setRows((r.result?.data ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api, day, valid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  useFocusEffect(
    useCallback(() => {
      data.paymentMethods().then((r) => setMethods(r.data), () => undefined);
      void reloadShift();
    }, [data, reloadShift]),
  );

  const shiftDay = (by: number) => {
    const d = parseDay(day) ?? new Date();
    d.setDate(d.getDate() + by);
    setDay(dayText(d));
  };

  function charge() {
    if (!open) return;
    if (!shift) {
      Alert.alert(t('checkout.noShift'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('checkout.openShift'), onPress: () => router.push('/shift') },
      ]);
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        const fresh = (await api.call<{ result?: { data: Row[] } }>('GET', `/api/cinema/showtime?limit=100&offset=0&showDate=${open.showDate.slice(0, 10)}`)).result?.data.find((s) => s.showtimeId === open.showtimeId);
        const taken = takenSeats(fresh ?? open);
        if (selected.some((id) => taken.has(id))) {
          Alert.alert(t('sale.taken'));
          if (fresh) setOpen(fresh);
          setSelected((s) => s.filter((id) => !taken.has(id)));
          return;
        }
        const line = ticketLine(open, selected, () => Crypto.randomUUID(), () => ticketCode(() => Math.random()));
        if (!line) return;
        const info = await api.posInfo(warehouseId);
        const invoiceNo = await api.nextInvoiceNumber();
        const orderId = (await api.call<{ result?: string }>('POST', '/api/pos/order', { warehouseId, slotId: info.posSlotId, customerId: info.posCustomerId, invoiceNo, items: [line] })).result;
        if (!orderId) throw new Error('No order id returned');
        setPay({ orderId, slotId: info.posSlotId, total: ticketsTotal(selected, open) });
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  /** Backing out of payment removes the opened order, which frees the seats again. */
  async function cancelPay() {
    const p = pay;
    setPay(null);
    if (p) await api.deleteOrder(p.orderId).catch(() => undefined);
  }

  async function complete(payments: CheckoutPayment[]) {
    const p = pay;
    if (!p) return;
    setBusy(true);
    try {
      await api.checkout(p.orderId, { slotId: p.slotId, payments });
      setPay(null);
      setOpen(null);
      setSelected([]);
      setVersion((v) => v + 1);
      try {
        setReceipt(receiptFromDetail(await api.orderDetail(p.orderId), { names: new Map(), methods: methodNames(methods), exchangeRate, currency }));
      } catch {
        Alert.alert(t('retail.paid'));
      }
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const seats = open?.hall?.seats ?? [];
  const taken = open ? takenSeats(open) : new Set<string>();
  const grid = seatGrid(seats);
  const maxCols = Math.max(1, ...grid.map((r) => r.cells.length));
  const cell = Math.max(26, Math.min(44, Math.floor((width - 2 * space.md - 28) / maxCols)));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.ticketSale')} />
      <View style={styles.dayBar}>
        <Button title="‹" variant="outline" size="sm" onPress={() => shiftDay(-1)} />
        <Input style={styles.flex} value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('cinema.day')} />
        <Button title="›" variant="outline" size="sm" onPress={() => shiftDay(1)} />
      </View>
      {!valid ? (
        <EmptyState title={t('reports.pickDates')} />
      ) : loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.showtimeId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('cinema.empty')} />}
          renderItem={({ item }) => {
            const left = (item.hall?.seats?.filter((s) => isFree(s, takenSeats(item))).length ?? 0);
            return (
              <Pressable
                disabled={!canSell(item)}
                onPress={() => {
                  setSelected([]);
                  setOpen(item);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && styles.pressed, !canSell(item) && styles.dim]}
              >
                <Card style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.heading} numberOfLines={2}>
                      {movieName(item)}
                    </Text>
                    <Badge tone={canSell(item) ? 'success' : 'outline'} text={t(`cinema.status_${item.status}`)} />
                  </View>
                  <Text style={styles.time}>{item.startTime.slice(11, 16)}</Text>
                  <Text style={styles.muted}>{[item.hall?.name, t('sale.seatsLeft', { count: left }), formatMoney(item.basePrice, currency)].filter(Boolean).join(' · ')}</Text>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={styles.safe}>
          {open ? (
            <>
              <View style={styles.modalHead}>
                <View style={styles.flex}>
                  <Text style={styles.heading}>{movieName(open)}</Text>
                  <Text style={styles.muted}>{[open.hall?.name, open.startTime.slice(11, 16)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Button title={t('common.close')} variant="ghost" size="sm" onPress={() => setOpen(null)} />
              </View>
              <ScrollView style={styles.flex} contentContainerStyle={styles.map}>
                <View style={styles.screenBar}>
                  <Text style={styles.screenText}>{t('sale.screen')}</Text>
                </View>
                <ScrollView horizontal contentContainerStyle={styles.grid}>
                  <View>
                    {grid.map((r) => (
                      <View key={r.row} style={styles.seatRow}>
                        <Text style={styles.rowLabel}>{r.row}</Text>
                        {r.cells.map((s, i) =>
                          s ? (
                            <Pressable
                              key={s.id}
                              disabled={!isFree(s, taken)}
                              onPress={() => setSelected((sel) => toggleSeat(sel, s.id, seats, taken))}
                              accessibilityRole="button"
                              accessibilityLabel={seatLabel(s)}
                              style={[styles.seat, { width: cell, height: cell }, s.type === 'vip' && styles.vip, s.type === 'couple' && styles.couple, s.type === 'wheelchair' && styles.wheelchair, !isFree(s, taken) && styles.seatTaken, selected.includes(s.id) && styles.seatSelected]}
                            >
                              <Text style={[styles.seatText, selected.includes(s.id) && styles.seatTextSelected]}>{s.column}</Text>
                            </Pressable>
                          ) : (
                            <View key={`gap${i}`} style={{ width: cell, height: cell }} />
                          ),
                        )}
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.legend}>{t('sale.legend')}</Text>
                {selected.map((id) => {
                  const seat = seats.find((s) => s.id === id);
                  return seat ? (
                    <View key={id} style={styles.row}>
                      <Text style={styles.label}>
                        {seatLabel(seat)} · {seat.type}
                      </Text>
                      <Text style={styles.value}>{formatMoney(seatPrice(open, seat), currency)}</Text>
                    </View>
                  ) : null;
                })}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={`${t('retail.charge')} ${formatMoney(ticketsTotal(selected, open), currency)}`} disabled={selected.length === 0} loading={busy} onPress={charge} />
              </View>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>

      {pay ? <CheckoutSheet total={pay.total} currency={currency} exchangeRate={exchangeRate} methods={methods} busy={busy} onClose={() => void cancelPay()} onComplete={(p) => void complete(p)} /> : null}
      <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  time: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.5 },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  map: { padding: space.md, gap: space.sm },
  screenBar: { alignSelf: 'stretch', height: 22, borderRadius: radius.md, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  screenText: { fontSize: font.small, color: colors.mutedForeground },
  grid: { paddingVertical: space.sm },
  seatRow: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { width: 20, fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textAlign: 'center' },
  seat: { margin: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  vip: { borderColor: colors.warning },
  couple: { borderColor: colors.info },
  wheelchair: { borderStyle: 'dashed' },
  seatTaken: { backgroundColor: colors.muted, opacity: 0.4 },
  seatSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  seatText: { fontSize: 11, color: colors.foreground },
  seatTextSelected: { color: colors.primaryForeground, fontWeight: '700' },
  legend: { fontSize: font.small, color: colors.mutedForeground },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
