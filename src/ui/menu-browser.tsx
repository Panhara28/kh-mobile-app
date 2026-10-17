import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category, KhPosApi, MenuProduct } from '@/lib/api';
import { cardPrice, initials, menuCategories, splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { Card, Chip, Input } from './components';
import { EmptyState, ErrorState, LoadingState } from './states';
import { colors, font, radius, space } from './theme';

const PAGE_SIZE = 20;

/**
 * The branch menu like the kh-pos web menu: search, category chips and a two-column grid.
 * Tapping a product calls `onSelect`; holding it calls `onLongSelect`.
 */
export function MenuBrowser({
  api,
  warehouseId,
  currency,
  onSelect,
  onLongSelect,
  inCart,
  onProducts,
  bottomInset = 0,
}: {
  api: KhPosApi;
  warehouseId: string;
  currency: CurrencyCode;
  onSelect: (product: MenuProduct) => void;
  onLongSelect?: (product: MenuProduct) => void;
  /** Portions of each variant already in the cart, shown as a badge on its card. */
  inCart?: Map<string, number>;
  /** Every product loaded so far (used to name modifier options on order lines). */
  onProducts?: (products: MenuProduct[]) => void;
  /** Space to keep free at the bottom. */
  bottomInset?: number;
}) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MenuProduct[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const h = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    if (!warehouseId) return;
    api.categories(warehouseId).then((c) => setCategories(menuCategories(c)), () => setCategories([]));
  }, [api, warehouseId]);

  useEffect(() => {
    onProducts?.(items);
  }, [items, onProducts]);

  const loadPage = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      const page = await api.menu({ warehouse: warehouseId, search: query, categoryId, limit: PAGE_SIZE, offset });
      if (id !== requestId.current) return; // a newer search or category won
      setItems((prev) => {
        if (offset === 0) return page;
        const seen = new Set(prev.map((p) => p.variantId));
        return [...prev, ...page.filter((p) => !seen.has(p.variantId))];
      });
      setHasMore(page.length === PAGE_SIZE);
    },
    [api, warehouseId, query, categoryId],
  );

  const reload = useCallback(async () => {
    setError(null);
    try {
      await loadPage(0);
      setStatus('ready');
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }, [loadPage]);

  useEffect(() => {
    setStatus('loading');
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!hasMore || loadingMore || status !== 'ready') return;
    setLoadingMore(true);
    try {
      await loadPage(items.length);
    } catch {
      // keep what is shown; scrolling again retries
    } finally {
      setLoadingMore(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  const chips = useMemo(() => [{ id: '', title: t('menu.all') }, ...categories], [categories, t]);

  return (
    <View style={styles.flex}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Input
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setQuery(search)}
          placeholder={t('menu.search')}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
          accessibilityLabel={t('menu.search')}
        />
        {search ? (
          <Pressable
            onPress={() => {
              setSearch('');
              setQuery('');
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('menu.clear')}
            style={styles.clear}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
        {query.trim() || search !== query ? (
          <Text style={styles.searchStatus} accessibilityLiveRegion="polite">
            {search !== query || status === 'loading'
              ? t('menu.searching')
              : t('menu.results', { count: items.length, query: query.trim() })}
          </Text>
        ) : null}
      </View>

      <View style={styles.chipsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.id || 'all'} label={c.title} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      </View>

      {status === 'loading' ? (
        <LoadingState />
      ) : status === 'error' ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.variantId}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[items.length ? styles.grid : styles.gridEmpty, { paddingBottom: space.xl + bottomInset }]}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              currency={currency}
              imageUrl={api.imageUrl(item.images?.[0]?.url)}
              count={inCart?.get(item.variantId) ?? 0}
              onPress={() => onSelect(item)}
              onLongPress={onLongSelect ? () => onLongSelect(item) : undefined}
            />
          )}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState title={t('menu.empty')} description={query.trim() ? t('menu.emptySearch', { query: query.trim() }) : undefined} />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
        />
      )}
    </View>
  );
}

function ProductCard({
  product,
  currency,
  imageUrl,
  count,
  onPress,
  onLongPress,
}: {
  product: MenuProduct;
  currency: CurrencyCode;
  imageUrl: string | null;
  count: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const { name, variant } = splitTitle(product.productTitle);
  const { price, original } = cardPrice(product);
  return (
    <Pressable
      style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${formatMoney(price, currency)}${count ? `, ${count}` : ''}`}
      accessibilityHint={onLongPress ? t('cart.hint') : undefined}
    >
      {count > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
      <Card style={styles.card}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>{initials(name)}</Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {variant ? (
            <Text style={styles.variant} numberOfLines={1}>
              {variant}
            </Text>
          ) : null}
          <View style={styles.priceRow}>
            <Text style={[styles.price, original != null && styles.priceDiscounted]}>{formatMoney(price, currency)}</Text>
            {original != null ? <Text style={styles.original}>{formatMoney(original, currency)}</Text> : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchBar: {
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: space.md + 12, top: space.md + 10, zIndex: 1, fontSize: 18, color: colors.mutedForeground },
  searchInput: { paddingLeft: 36, paddingRight: 40, borderRadius: radius.lg },
  clear: { position: 'absolute', right: space.md + 10, top: space.md, height: 42, justifyContent: 'center', zIndex: 1 },
  clearText: { fontSize: 16, color: colors.mutedForeground },
  searchStatus: { fontSize: 12, color: colors.mutedForeground, marginTop: 6 },
  chipsBar: { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { gap: 6, paddingHorizontal: space.md, paddingVertical: space.sm },
  grid: { padding: space.sm, gap: space.sm },
  gridEmpty: { flexGrow: 1 },
  row: { gap: space.sm },
  cardWrap: { flex: 1 },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    elevation: 3,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: colors.primaryForeground, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  card: { flex: 1 },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.muted },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 28, fontWeight: '700', color: colors.mutedForeground },
  cardBody: { padding: space.sm, gap: 2 },
  name: { fontSize: font.body, fontWeight: '600', color: colors.foreground, lineHeight: font.lineHeight },
  variant: { fontSize: 12, color: colors.mutedForeground },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  price: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  priceDiscounted: { color: colors.success },
  original: { fontSize: 12, color: colors.mutedForeground, textDecorationLine: 'line-through' },
  more: { marginVertical: space.lg },
});
