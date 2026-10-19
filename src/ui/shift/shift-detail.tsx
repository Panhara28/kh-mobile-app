import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Shift } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { cardSlips, durationText, receiptOf, shiftDateTime, shiftLines, shiftReceiptHtml, shiftReceiptText, variance, type ShiftLabels } from '@/lib/shift';
import { Badge, Button, Card } from '../components';
import { colors, font, radius, space } from '../theme';

/** The handover receipt texts, in the app language. */
export function useShiftLabels(): ShiftLabels {
  const { t } = useTranslation();
  return {
    title: t('shift.receiptTitle'),
    handover: t('shift.handoverContent'),
    opening: t('shift.openingShift'),
    closing: t('shift.closingShift'),
    actual: t('shift.actualBalance'),
    difference: t('shift.difference'),
    handoverAmount: t('shift.handoverAmount'),
    paymentMethod: t('shift.paymentMethod'),
    sales: t('shift.sales'),
    returns: t('shift.returns'),
    bills: t('shift.bills'),
    customers: t('shift.customers'),
    openedBy: t('shift.openedBy'),
    openedAt: t('shift.openedDate'),
    closedAt: t('shift.closedDate'),
  };
}

/** Print (system print dialog) or share the handover receipt of a shift. */
export async function printShift(shift: Shift, labels: ShiftLabels, failed: string) {
  const lines = shiftLines(shift, (v) => formatMoney(v, 'USD'), (v) => formatMoney(v, 'KHR'), labels);
  try {
    await Print.printAsync({ html: shiftReceiptHtml(labels.title, lines) });
  } catch (e) {
    Alert.alert(failed, e instanceof Error ? e.message : undefined);
  }
}

export async function shareShift(shift: Shift, labels: ShiftLabels) {
  const lines = shiftLines(shift, (v) => formatMoney(v, 'USD'), (v) => formatMoney(v, 'KHR'), labels);
  try {
    await Share.share({ message: shiftReceiptText(labels.title, lines) });
  } catch {
    // closed without sharing
  }
}

/** "Shift Details" of the web: information, duration, cash flow, variance, payment methods and statistics. */
export function ShiftDetail({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const labels = useShiftLabels();
  const r = receiptOf(shift);
  const isOpen = shift.status === 'OPEN';
  const v = variance(shift);
  const usd = (n: number | string | null | undefined) => formatMoney(n ?? 0, 'USD');
  const khr = (n: number | string | null | undefined) => formatMoney(n ?? 0, 'KHR');
  const methods = Object.entries(r?.amountByMethod ?? {});
  const tone = (n: number) => (n < 0 ? colors.destructive : n > 0 ? colors.warning : colors.foreground);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.row}>
            <Text style={styles.title}>{t('shift.details')}</Text>
            <Badge tone={isOpen ? 'success' : 'outline'} text={isOpen ? t('shift.active') : t('shift.closed')} />
          </View>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('shift.information')}</Text>
            <Line label={t('shift.exchangeRate')} value={`1 USD = ${Number(shift.exchange_rate || 4100).toLocaleString()} KHR`} />
            <Line label={t('shift.openedDate')} value={shiftDateTime(shift.opened_at)} />
            <Line label={t('shift.openedBy')} value={shift.opened_by?.fullname || 'N/A'} />
            {!isOpen ? (
              <>
                <Line label={t('shift.closedDate')} value={shiftDateTime(shift.closed_at)} />
                <Line label={t('shift.closedBy')} value={shift.closed_by?.fullname || 'N/A'} />
                <Line label={t('shift.duration')} value={durationText(shift.opened_at, shift.closed_at)} bold />
              </>
            ) : null}
          </Card>

          <Card style={styles.card}>
            <Text style={styles.section}>{t('shift.cashFlow')}</Text>
            <Text style={styles.muted}>{t('shift.cashFlowHint')}</Text>
            <Text style={styles.sub}>{t('shift.openingCash')}</Text>
            <Line label="USD" value={usd(shift.opened_cash_usd)} />
            <Line label="KHR" value={khr(shift.opened_cash_khr)} />
            {!isOpen ? (
              <>
                <Text style={styles.sub}>{t('shift.expectedClosing')}</Text>
                <Line label="USD" value={usd(shift.closed_cash_usd)} />
                <Line label="KHR" value={khr(shift.closed_cash_khr)} />
                <Text style={styles.sub}>{t('shift.actualClosing')}</Text>
                <Line label="USD" value={usd(shift.actual_cash_usd)} />
                <Line label="KHR" value={khr(shift.actual_cash_khr)} />
                {v.usd !== 0 || v.khr !== 0 ? (
                  <>
                    <Text style={styles.sub}>{t('shift.variance')}</Text>
                    <Line label="USD" value={`${v.usd > 0 ? '+' : ''}${usd(v.usd)}`} color={tone(v.usd)} bold />
                    <Line label="KHR" value={`${v.khr > 0 ? '+' : ''}${khr(v.khr)}`} color={tone(v.khr)} bold />
                  </>
                ) : null}
              </>
            ) : null}
          </Card>

          {r?.amountByMethod ? (
            <Card style={styles.card}>
              <Text style={styles.section}>{t('shift.paymentMethods')}</Text>
              <Text style={styles.muted}>{t('shift.totalPayments', { count: r.payments || 0 })}</Text>
              {methods.map(([m, d]) => (
                <View key={m} style={styles.method}>
                  <View style={styles.row}>
                    <Text style={styles.name}>{m}</Text>
                    {d.qty ? <Badge tone="outline" text={t('shift.transactions', { count: d.qty })} /> : null}
                  </View>
                  <Line label="USD" value={usd(d.usd)} />
                  <Line label="KHR" value={khr(d.khr)} />
                </View>
              ))}
            </Card>
          ) : null}

          {r ? (
            <Card style={styles.card}>
              <Text style={styles.section}>{t('shift.statistics')}</Text>
              <Line label={t('shift.totalSales')} value={usd(r.sales)} color={colors.success} bold />
              <Line label={t('shift.returns')} value={usd(r.amountReturned)} color={colors.destructive} bold />
              <Line label={t('shift.totalCustomers')} value={String(Number(r.totalCustomer || 0))} />
              <Line label={t('shift.avgSpending')} value={usd(r.avgCustomer)} />
              <Text style={styles.sub}>{t('shift.otherStats')}</Text>
              <Line label={t('shift.bills')} value={String(r.orders || 0)} />
              <Line label={t('shift.cardSlips')} value={String(cardSlips(r))} />
            </Card>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} variant="outline" onPress={onClose} style={styles.flex} />
          <Button title={t('shift.share')} variant="outline" onPress={() => void shareShift(shift, labels)} style={styles.flex} />
          <Button title={t('shift.print')} onPress={() => void printShift(shift, labels, t('receipt.printFailed'))} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

function Line({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  method: { gap: 2, paddingTop: space.xs },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  sub: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, marginTop: space.xs },
  name: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  label: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  value: { fontSize: font.small, color: colors.foreground, textAlign: 'right' },
  bold: { fontWeight: '700' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
