import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { branchSaleQuery } from '@/lib/board';
import { formatMoney } from '@/lib/money';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import { breakdownSections, type SaleBreakdownRow } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** One branch's sales by category and item for the period chosen on the board dashboard (this branch, or an integrated brand's). */
export default function BoardSaleScreen() {
  const { t } = useTranslation();
  const { warehouseId, name, brand, start, end } = useLocalSearchParams<{ warehouseId: string; name: string; brand?: string; start: string; end: string }>();
  const { api } = useSession();
  const { currency } = useBranch();
  const path = branchSaleQuery({ warehouseId, brandName: brand || undefined, start, end });
  const fetcher = useCallback(async () => (await api.call<{ result?: SaleBreakdownRow[] }>('GET', path)).result ?? [], [api, path]);
  const load = useCachedLoad<SaleBreakdownRow[]>('board-sale', path, fetcher);
  const money = (v: number) => formatMoney(v, currency);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={[brand, name].filter(Boolean).join(' · ')} />
      {load.value === null ? (
        load.loading ? <LoadingState /> : load.error ? <ErrorState error={load.error} onRetry={() => void load.reload()} /> : <EmptyState title="-" />
      ) : (
        <>
          {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}
          <ScrollView contentContainerStyle={styles.content}>
            {(() => {
              const { total, sections } = breakdownSections(load.value);
              if (sections.length === 0) return <EmptyState title={t('reports.empty')} />;
              return (
                <>
                  {total ? (
                    <Card style={styles.card}>
                      <View style={styles.row}>
                        <Text style={styles.label}>{t('reports.revenue')}</Text>
                        <Text style={styles.value}>{money(total.revenue)}</Text>
                      </View>
                      <View style={styles.row}>
                        <Text style={styles.label}>{t('reports.profit')}</Text>
                        <Text style={styles.value}>{money(total.profit)}</Text>
                      </View>
                    </Card>
                  ) : null}
                  {sections.map((s, i) => (
                    <Card key={i} style={styles.card}>
                      <Text style={styles.section}>{`${s.category.name ?? ''} · ${money(s.category.revenue)}`}</Text>
                      {s.items.map((it, k) => (
                        <View key={k} style={styles.row}>
                          <Text style={styles.label} numberOfLines={2}>{`${it.totalQty} × ${it.name ?? ''}`}</Text>
                          <Text style={styles.value}>{money(it.revenue)}</Text>
                        </View>
                      ))}
                    </Card>
                  ))}
                </>
              );
            })()}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.xs, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  label: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
});
