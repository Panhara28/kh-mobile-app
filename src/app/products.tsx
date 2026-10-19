import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryRow } from '@/lib/catalog';
import { can } from '@/lib/line';
import { splitTitle } from '@/lib/menu';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { priceRange, type ProductListItem } from '@/lib/products';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;

/** The branch's products like the kh-pos web Product page: search, filter by category, add, edit and delete. */
export default function ProductsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const { currency } = useBranch();
  const guard = useOnlineOnly();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const request = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(h);
  }, [search]);

  const warehouse = user?.currentWarehouseId ?? '';
  useEffect(() => {
    data.categories(warehouse).then(
      (r) => setCategories(r.data as unknown as CategoryRow[]),
      () => undefined,
    );
  }, [data, warehouse, state.online]);

  const load = useCallback(
    async (offset: number) => {
      const id = ++request.current;
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (query.trim()) params.set('searchTitle', query.trim());
      if (categoryId) params.set('categoryId', categoryId);
      const qs = params.toString();
      try {
        const r = await data.cachedRead('products', qs, async () => (await api.call<{ result: { data: ProductListItem[]; total: number } }>('GET', `/api/product-v2?${qs}`)).result);
        if (id !== request.current) return;
        setItems((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data.filter((p) => !prev.some((q) => q.id === p.id))]));
        setTotal(Number(r.data.total) || 0);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        if (id === request.current) setError(e);
      }
    },
    [data, api, query, categoryId],
  );

  const { online, syncVersion } = state;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load(0);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, online, syncVersion]);

  function confirmDelete(p: ProductListItem) {
    Alert.alert(t('products.deleteConfirm', { name: p.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/product-v2', { id: p.id });
              await load(0);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          }),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.products')} right={can(user, 'product', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => router.push({ pathname: '/product-edit/[id]', params: { id: 'new' } })} /> : undefined} />
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('products.search')} autoCorrect={false} accessibilityLabel={t('products.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('menu.all')} selected={categoryId === ''} onPress={() => setCategoryId('')} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.title} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {loading ? (
        <LoadingState />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(0)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(0); setRefreshing(false); }} />}
          onEndReached={async () => {
            if (moreLoading || items.length >= total) return;
            setMoreLoading(true);
            await load(items.length);
            setMoreLoading(false);
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<EmptyState title={t('products.empty')} />}
          ListFooterComponent={moreLoading ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
          renderItem={({ item }) => {
            const range = priceRange(item.productVariants);
            const image = api.imageUrl(item.productImages?.[0]?.url);
            return (
              <Card style={styles.card}>
                <Pressable onPress={() => router.push({ pathname: '/product-edit/[id]', params: { id: item.id } })} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  {image ? <Image source={{ uri: image }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>
                      {splitTitle(item.title).name}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {(item.productCategories ?? []).map((c) => c.title).filter(Boolean).join(', ')}
                    </Text>
                    <Text style={styles.price}>
                      {range ? (range.min === range.max ? formatMoney(range.min, currency) : `${formatMoney(range.min, currency)} – ${formatMoney(range.max, currency)}`) : ''}
                      {(item.productVariants?.length ?? 0) > 1 ? ` · ${t('products.variants', { count: item.productVariants?.length })}` : ''}
                    </Text>
                  </View>
                  {item.isForSale === false ? <Badge tone="warning" text={t('products.notForSale')} /> : null}
                </Pressable>
                {can(user, 'product', 'delete') ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => confirmDelete(item)} /> : null}
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.xs, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  price: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  pressed: { opacity: 0.7 },
  more: { marginVertical: space.lg },
});
