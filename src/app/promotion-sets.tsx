import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { promoSummary, type PromoRow } from '@/lib/promotion-sets';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** Promotion sets (combos) like the kh-pos web Discount page: see them, open one to edit, or add one. */
export default function PromotionSetsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const [rows, setRows] = useState<PromoRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('promotion-sets', 'all', () => fetchAllPages<PromoRow>(async (o, l) => (await api.call<{ result: { data: PromoRow[]; total: number } }>('GET', `/api/promotion-set?limit=${l}&offset=${o}`)).result));
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.promotionSets')} right={can(user, 'discount', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => router.push({ pathname: '/promotion-set/[id]', params: { id: Crypto.randomUUID(), isNew: '1' } } as never)} /> : undefined} />
      <View style={styles.tabs}>
        <Chip label={t('discounts.tabDiscounts')} selected={false} onPress={() => router.replace('/discounts')} />
        <Chip label={t('discounts.tabPromotionSets')} selected onPress={() => undefined} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('promo.empty')} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/promotion-set/[id]', params: { id: item.id } } as never)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{item.title}</Text>
                  <Badge tone={item.isActive ? 'success' : 'outline'} text={item.isActive ? t('promo.active') : t('promo.inactive')} />
                </View>
                <Text style={styles.muted}>{promoSummary(item)}</Text>
                {item.startAt || item.endAt ? (
                  <Text style={styles.muted}>
                    {item.startAt?.slice(0, 10) ?? '…'} → {item.endAt?.slice(0, 10) ?? '…'}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  tabs: { flexDirection: 'row', gap: 6, padding: space.md, paddingBottom: 0 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  pressed: { opacity: 0.7 },
});
