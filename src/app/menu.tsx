import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Category, MenuProduct } from '@/lib/api';
import { cardPrice, initials, menuCategories, splitTitle } from '@/lib/menu';
import { formatMoney, toCurrencyCode, type CurrencyCode } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Input } from '@/ui/components';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE_SIZE = 20;

/**
 * The branch menu for staff, laid out like the kh-pos web menu: header, search, category
 * chips and a two-column grid of product cards.
 */
export default function MenuScreen() {
  const { t } = useTranslation();
  const { api, user, logout } = useSession();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
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

  // Debounce the search box like the web menu.
  useEffect(() => {
    const h = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(h);
  }, [search]);

  // Categories and the branch currency.
  useEffect(() => {
    if (!warehouseId) return;
    api.categories(warehouseId).then((c) => setCategories(menuCategories(c)), () => setCategories([]));
    api
      .settings(warehouseId)
      .then((s) => setCurrency(toCurrencyCode(s.find((x) => x.option === 'CURRENCY')?.value)))
      .catch(() => undefined);
  }, [api, warehouseId]);

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

  function confirmLogout() {
    Alert.alert(t('session.logoutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const chips = useMemo(() => [{ id: '', title: t('menu.all') }, ...categories], [categories, t]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.branch} numberOfLines={1}>
            {user?.warehouse?.name ?? t('common.appName')}
          </Text>
          <Text style={styles.staff} numberOfLines={1}>
            {[user?.fullname || user?.username, user?.role?.role].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Button title={t('common.logout')} variant="outline" size="sm" onPress={confirmLogout} />
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={t('menu.search')}
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
          accessibilityLabel={t('menu.search')}
        />
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
          contentContainerStyle={items.length ? styles.grid : styles.gridEmpty}
          renderItem={({ item }) => <ProductCard product={item} currency={currency} imageUrl={api.imageUrl(item.images?.[0]?.url)} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              title={t('menu.empty')}
              description={query.trim() ? t('menu.emptySearch', { query: query.trim() }) : undefined}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={colors.primary} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

function ProductCard({ product, currency, imageUrl }: { product: MenuProduct; currency: CurrencyCode; imageUrl: string | null }) {
  const { name, variant } = splitTitle(product.productTitle);
  const { price, original } = cardPrice(product);
  return (
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
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  branch: { fontSize: font.title, fontWeight: '600', color: colors.foreground },
  staff: { fontSize: font.small, color: colors.mutedForeground, marginTop: 2 },
  searchBar: {
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    justifyContent: 'center',
  },
  searchIcon: { position: 'absolute', left: space.md + 12, zIndex: 1, fontSize: 18, color: colors.mutedForeground },
  searchInput: { paddingLeft: 36, borderRadius: radius.lg },
  chipsBar: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chips: { gap: 6, paddingHorizontal: space.md, paddingVertical: space.sm },
  grid: { padding: space.sm, paddingBottom: space.xl * 2, gap: space.sm },
  gridEmpty: { flexGrow: 1 },
  row: { gap: space.sm },
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
