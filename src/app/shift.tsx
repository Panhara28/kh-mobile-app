import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Shift } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRunner } from '@/lib/offline/use-runner';
import { useSession } from '@/lib/session';
import { cashDifference, expectedCash, hasDiscrepancy, receiptOf } from '@/lib/shift';
import { clock, parseKhPosTime } from '@/lib/time';
import { useBranch } from '@/lib/use-branch';
import { useShift } from '@/lib/use-shift';
import { Badge, Button, Card, Field } from '@/ui/components';
import { ShiftList } from '@/ui/shift/shift-list';
import { ErrorState, LoadingState } from '@/ui/states';
import { SyncBadge } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const when = (value: string | null | undefined) => {
  const d = parseKhPosTime(value);
  return d ? clock(d) : '';
};
const who = (u: Shift['opened_by']) => u?.fullname || u?.username || '';
const num = (text: string) => Number(text.replace(/,/g, '')) || 0;

/**
 * The cashier's shift, like the kh-pos web Shift page: open it with the cash in the till, see its
 * sales so far, count the cash to close it. Checkout needs an open shift. Opening or closing
 * with no connection is kept and sent later (see lib/offline).
 */
export default function ShiftScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { state } = useOffline();
  const { exchangeRate } = useBranch();
  const { shift, loaded, error, reload } = useShift();
  const { command, submit, busy } = useRunner();

  const [cashUsd, setCashUsd] = useState('0');
  const [cashKhr, setCashKhr] = useState('0');
  const [rate, setRate] = useState('');
  const [closing, setClosing] = useState(false);
  const [countUsd, setCountUsd] = useState('0');
  const [countKhr, setCountKhr] = useState('0');

  const { syncVersion, online } = state;
  useFocusEffect(
    useCallback(() => {
      void reload();
      // syncVersion and online are triggers: reload when changes were sent or kh-pos came back
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, syncVersion, online]),
  );

  async function open() {
    const payload = { openedCashUsd: num(cashUsd), openedCashKhr: num(cashKhr), exchangeRate: num(rate) || exchangeRate };
    const result = await submit(command('openShift', payload), async () => void (await api.openShift(payload)));
    if (result === 'queued') Alert.alert(t('shift.savedOffline'));
    await reload();
  }

  function confirmClose() {
    Alert.alert(t('shift.confirmClose'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('shift.close'), style: 'destructive', onPress: () => void close() },
    ]);
  }

  async function close() {
    const payload = { actualCashUsd: num(countUsd), actualCashKhr: num(countKhr) };
    const shiftId = shift?.shift_id ?? '';
    const result = await submit(command('closeShift', payload), async () => void (await api.closeShift({ shiftId, ...payload })));
    if (result) {
      setClosing(false);
      if (result === 'queued') Alert.alert(t('shift.savedOffline'));
    }
    await reload();
  }

  const receipt = receiptOf(shift);
  const expected = expectedCash(shift);
  const diff = cashDifference({ usd: num(countUsd), khr: num(countKhr) }, expected);
  const discrepancy = hasDiscrepancy({ usd: num(countUsd), khr: num(countKhr) }, expected);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={() => router.back()} />
        <Text style={styles.title}>{t('shift.title')}</Text>
        <SyncBadge />
      </View>

      {!loaded ? (
        error ? <ErrorState error={error} onRetry={() => void reload()} /> : <LoadingState />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {shift ? (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{t('shift.current')}</Text>
                  <Badge tone={shift.localOnly ? 'info' : 'success'} text={shift.localOnly ? t('shift.notSent') : t('shift.openBadge')} />
                </View>
                <Text style={styles.muted}>{t('shift.openedAt', { time: when(shift.opened_at), who: who(shift.opened_by) })}</Text>
                <Line label={t('shift.openingCash')} value={`${formatMoney(shift.opened_cash_usd, 'USD')} · ${formatMoney(shift.opened_cash_khr, 'KHR')}`} />
                {receipt ? (
                  <>
                    <Line label={t('shift.orders')} value={String(receipt.orders)} />
                    <Line label={t('shift.sales')} value={formatMoney(receipt.sales, 'USD')} />
                    <Line label={t('shift.payments')} value={String(receipt.payments)} />
                    {Object.entries(receipt.amountByMethod ?? {}).map(([method, v]) => (
                      <Line key={method} label={`  ${method}`} value={`${formatMoney(v.usd, 'USD')} · ${formatMoney(v.khr, 'KHR')} (${v.qty})`} />
                    ))}
                    {receipt.returns > 0 ? <Line label={t('shift.returns')} value={`${receipt.returns} · ${formatMoney(receipt.amountReturned, 'USD')}`} /> : null}
                    <Line label={t('shift.guests')} value={String(receipt.totalCustomer)} />
                  </>
                ) : null}
                <Line label={t('shift.expected')} value={`${formatMoney(expected.usd, 'USD')} · ${formatMoney(expected.khr, 'KHR')}`} bold />

                {closing ? (
                  <View style={styles.form}>
                    <Field label={t('shift.countedUsd')} value={countUsd} onChangeText={setCountUsd} keyboardType="decimal-pad" selectTextOnFocus />
                    <Field label={t('shift.countedKhr')} value={countKhr} onChangeText={setCountKhr} keyboardType="decimal-pad" selectTextOnFocus />
                    <Line label={t('shift.difference')} value={`${formatMoney(diff.usd, 'USD')} · ${formatMoney(diff.khr, 'KHR')}`} bold tone={diff.usd === 0 && diff.khr === 0 ? undefined : diff.usd < 0 || diff.khr < 0 ? 'bad' : 'warn'} />
                    {discrepancy.any ? (
                      <View style={styles.warn}>
                        <Text style={styles.warnTitle}>{t('shift.discrepancy')}</Text>
                        {discrepancy.usd ? <Text style={styles.warnText}>{t('shift.usdDifference', { amount: Math.abs(num(countUsd) - expected.usd).toFixed(2) })}</Text> : null}
                        {discrepancy.khr ? <Text style={styles.warnText}>{t('shift.khrDifference', { amount: Math.abs(num(countKhr) - expected.khr).toLocaleString() })}</Text> : null}
                      </View>
                    ) : null}
                    <View style={styles.buttons}>
                      <Button title={t('common.cancel')} variant="outline" onPress={() => setClosing(false)} style={styles.flex} />
                      <Button title={t('shift.close')} variant="destructive" loading={busy} onPress={confirmClose} style={styles.flex} />
                    </View>
                  </View>
                ) : (
                  <Button
                    title={t('shift.close')}
                    variant="outline"
                    onPress={() => {
                      setCountUsd(String(expected.usd));
                      setCountKhr(String(expected.khr));
                      setClosing(true);
                    }}
                  />
                )}
              </Card>
            ) : (
              <Card style={styles.card}>
                <Text style={styles.heading}>{t('shift.none')}</Text>
                <Text style={styles.muted}>{t('shift.noneHint')}</Text>
                <Field label={t('shift.openingUsd')} value={cashUsd} onChangeText={setCashUsd} keyboardType="decimal-pad" selectTextOnFocus />
                <Field label={t('shift.openingKhr')} value={cashKhr} onChangeText={setCashKhr} keyboardType="decimal-pad" selectTextOnFocus />
                <Field label={t('shift.rate')} value={rate || String(exchangeRate)} onChangeText={setRate} keyboardType="decimal-pad" selectTextOnFocus />
                <Button title={t('shift.open')} loading={busy} onPress={() => void open()} />
              </Card>
            )}

            <ShiftList reloadKey={syncVersion} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Line({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'bad' | 'warn' }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.bold, tone === 'bad' && { color: colors.destructive }, tone === 'warn' && { color: colors.warning }]}>{value}</Text>
    </View>
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
  title: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
  content: { padding: space.md, gap: space.md },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  history: { gap: space.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  lineLabel: { flexShrink: 1, fontSize: font.body, color: colors.foreground },
  lineValue: { fontSize: font.body, color: colors.foreground, textAlign: 'right' },
  bold: { fontWeight: '700' },
  form: { gap: space.sm, marginTop: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
  warn: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.sm, gap: 2 },
  warnTitle: { fontSize: font.small, fontWeight: '700', color: colors.warning },
  warnText: { fontSize: font.small, color: colors.warning },
});
