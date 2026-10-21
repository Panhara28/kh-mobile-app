import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { boardRows, localTotal, type BoardResult } from '@/lib/board';
import { rangeFor, type DateRange } from '@/lib/dates';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { dateQuery } from '@/lib/reports';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Card } from '@/ui/components';
import { BarList } from '@/ui/bar-list';
import { DateRangeBar } from '@/ui/date-range-bar';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** Board-member dashboard like the kh-pos web page: total sales of every branch (and integrated brand) for a period. */
export default function BoardScreen() {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange | null>(() => rangeFor('month'));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.board')} />
      <DateRangeBar initial="month" onChange={(r) => setRange(r)} />
      {range ? <Body range={range} /> : <EmptyState title={t('reports.pickDates')} />}
    </SafeAreaView>
  );
}

function Body({ range }: { range: DateRange }) {
  const open = (r: { warehouseId: string; name: string; brand: string }) => router.push({ pathname: '/board-sale', params: { warehouseId: r.warehouseId, name: r.name, brand: r.brand, start: range.start, end: range.end } } as never);
  const { t } = useTranslation();
  const { api } = useSession();
  const { currency } = useBranch();
  const q = dateQuery(range);
  const fetcher = useCallback(async () => (await api.call<{ result?: BoardResult }>('GET', `/api/report/warehouse/sale?${q}`)).result ?? {}, [api, q]);
  const load = useCachedLoad<BoardResult>('board', q, fetcher);

  if (load.value === null) return load.loading ? <LoadingState /> : load.error ? <ErrorState error={load.error} onRetry={() => void load.reload()} /> : <EmptyState title="-" />;
  const { rows, unreachable } = boardRows(load.value);
  const local = rows.filter((r) => !r.brand);
  const brands = [...new Set(rows.filter((r) => r.brand).map((r) => r.brand))];
  const bar = (list: typeof rows) => list.map((r) => ({ label: r.isMain ? `${r.name} ★` : r.name, value: r.value, key: r.key }));

  return (
    <>
      {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        {rows.length === 0 && unreachable.length === 0 ? <EmptyState title={t('board.empty')} /> : null}
        {local.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.section}>{t('board.local')}</Text>
            <BarList rows={bar(local)} format={(v) => local.find((r) => r.value === v)?.text ?? String(v)} />
            {local.map((r) => (
              <Pressable key={r.key} onPress={() => open(r)} accessibilityRole="button" style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
                <Text style={styles.openText}>{`${r.name} ›`}</Text>
              </Pressable>
            ))}
            <View style={styles.row}>
              <Text style={styles.total}>{t('board.total')}</Text>
              <Text style={styles.total}>{formatMoney(localTotal(rows), currency)}</Text>
            </View>
          </Card>
        ) : null}
        {brands.map((b) => {
          const list = rows.filter((r) => r.brand === b);
          return (
            <Card key={b} style={styles.card}>
              <Text style={styles.section}>{b}</Text>
              <BarList rows={bar(list)} tone="success" format={(v) => list.find((r) => r.value === v)?.text ?? String(v)} />
              {list.map((r) => (
                <Pressable key={r.key} onPress={() => open(r)} accessibilityRole="button" style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
                  <Text style={styles.openText}>{`${r.name} ›`}</Text>
                </Pressable>
              ))}
            </Card>
          );
        })}
        {unreachable.map((b) => (
          <Card key={b} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.section}>{b}</Text>
              <Badge tone="destructive" text={t('board.unreachable')} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  open: { paddingVertical: space.xs },
  openText: { fontSize: font.small, color: colors.primary },
  pressed: { opacity: 0.6 },
  total: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
});
