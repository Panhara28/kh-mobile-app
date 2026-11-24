import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import type { Shift } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useSession } from '@/lib/session';
import { receiptOf, SHIFT_PAGE, shiftDateTime } from '@/lib/shift';
import { Badge, Button, Card } from '../components';
import { colors, font, radius, space } from '../theme';
import { printShift, ShiftDetail, useShiftLabels } from './shift-detail';

/**
 * "Shift Management" of the web page: the cashier's shifts (open and closed), 30 at a time. Each
 * shows status, who opened it, dates, opening / closing / actual cash, total sale with the number
 * of bills and the cash difference; View Details and Print are one tap away.
 */
export function ShiftList({ reloadKey }: { reloadKey: number }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const labels = useShiftLabels();
  const [rows, setRows] = useState<Shift[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [open, setOpen] = useState<Shift | null>(null);
  const uid = user?.id;

  const load = useCallback(
    async (offset: number) => {
      if (!uid) return;
      try {
        const r = await data.cachedRead('shifts-page', `${uid}:${offset}`, () => api.shifts({ openedBy: uid, limit: SHIFT_PAGE, offset }));
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        setTotal(Number(r.data.total) || 0);
      } finally {
        setLoaded(true);
      }
    },
    [data, api, uid],
  );

  const { online, syncVersion } = state;
  useEffect(() => {
    void load(0).catch(() => undefined);
  }, [load, online, syncVersion, reloadKey]);

  return (
    <View style={styles.box}>
      <Text style={styles.section}>{t('shift.management')}</Text>
      <Text style={styles.muted}>{t('shift.managementHint')}</Text>
      {loaded && rows.length === 0 ? (
        <Card style={styles.card}>
          <Text style={styles.heading}>{t('shift.noShifts')}</Text>
          <Text style={styles.muted}>{t('shift.noShiftsHint')}</Text>
        </Card>
      ) : null}
      {rows.map((s) => {
        const r = receiptOf(s);
        const closed = s.status === 'CLOSE';
        const diffUsd = r?.cashDiffUsd ?? 0;
        const diffKhr = r?.cashDiffKhr ?? 0;
        const color = (n: number) => (n < 0 ? colors.destructive : n > 0 ? colors.success : colors.mutedForeground);
        return (
          <Card key={s.shift_id} style={styles.card}>
            <View style={styles.row}>
              <Badge tone={closed ? 'success' : 'info'} text={s.status} />
              <Text style={styles.muted}>{s.opened_by?.fullname || '-'}</Text>
            </View>
            <Text style={styles.muted}>
              {t('shift.openedDate')}: {s.opened_at ? shiftDateTime(s.opened_at) : '-'}
            </Text>
            <Text style={styles.muted}>
              {t('shift.closedDate')}: {s.closed_at ? shiftDateTime(s.closed_at) : '-'}
            </Text>
            <Line label={t('shift.openingCash')} value={`${formatMoney(Number(s.opened_cash_usd || 0), 'USD')} · ${formatMoney(Number(s.opened_cash_khr || 0), 'KHR')}`} />
            <Line label={t('shift.closingCash')} value={Number(s.closed_cash_usd) > 0 ? `${formatMoney(Number(s.closed_cash_usd), 'USD')} · ${formatMoney(Number(s.closed_cash_khr || 0), 'KHR')}` : '--'} />
            <Line label={t('shift.actualCash')} value={Number(s.actual_cash_usd || 0) > 0 ? `${formatMoney(Number(s.actual_cash_usd), 'USD')} · ${formatMoney(Number(s.actual_cash_khr || 0), 'KHR')}` : '--'} />
            <Line label={t('shift.totalSale')} value={`${formatMoney(Number(r?.sales || 0), 'USD')} (${t('shift.qtyBills', { count: r?.orders ?? 0 })})`} />
            <Line
              label={t('shift.difference')}
              value={closed ? `${diffUsd > 0 ? '+' : ''}${formatMoney(diffUsd, 'USD')} · ${diffKhr > 0 ? '+' : ''}${formatMoney(diffKhr, 'KHR')}` : '--'}
              color={closed ? color(diffUsd || diffKhr) : undefined}
            />
            <View style={styles.row}>
              <Button title={t('shift.viewDetails')} variant="outline" size="sm" onPress={() => setOpen(s)} />
              <Button title={t('shift.print')} variant="outline" size="sm" onPress={() => void printShift(s, labels, t('receipt.printFailed'))} />
            </View>
          </Card>
        );
      })}
      {rows.length < total ? (
        <Button
          title={t('shift.loadMore')}
          variant="outline"
          loading={moreLoading}
          onPress={async () => {
            setMoreLoading(true);
            await load(rows.length).catch(() => undefined);
            setMoreLoading(false);
          }}
        />
      ) : null}
      {open ? <ShiftDetail shift={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  section: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  value: { fontSize: font.small, color: colors.foreground, textAlign: 'right', flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.mutedForeground },
});
