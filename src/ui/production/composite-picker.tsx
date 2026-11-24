import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, type KhPosApi } from '@/lib/api';
import { useOffline } from '@/lib/offline/provider';
import { compositeQuery, filterOptions, type CompositeOption } from '@/lib/production';
import { Card, Input } from '../components';
import { ErrorState } from '../states';
import { StaleBanner } from '../sync-status';
import { colors, font, radius, space } from '../theme';

const PAGE = 20;

/** The web's product search on the Production form: only composed products (those with a recipe), for this branch. */
export function CompositePicker({ api, warehouseId, onPick, onClose, compositeOnly = true, includeNotForSale = false, forReplenishment = false }: { api: KhPosApi; warehouseId: string; onPick: (v: CompositeOption) => void; onClose: () => void; compositeOnly?: boolean; includeNotForSale?: boolean; forReplenishment?: boolean }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, state } = useOffline();
  /** The list on screen comes from the copy saved on this phone (kh-pos can't be reached). */
  const [savedAt, setSavedAt] = useState<number | null | false>(false);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<CompositeOption[]>([]);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useRef(0);

  const load = useCallback(
    async (offset: number, search: string) => {
      const id = ++run.current;
      setLoading(true);
      try {
        let got: CompositeOption[];
        try {
          if (!state.online) throw new ApiError('network');
          const r = await api.getOrSaved<{ result?: CompositeOption[] }>(`/api/product/search-product?${compositeQuery(search, warehouseId, offset, PAGE, { compositeOnly, includeNotForSale, forReplenishment })}`);
          got = r.result ?? [];
          if (id === run.current) setSavedAt(false);
        } catch (e) {
          if (!(e instanceof ApiError) || e.kind !== 'network') throw e;
          // kh-pos can't be reached: search the copy of the products saved on this phone
          const catalog = await data.catalog(warehouseId, { compositeOnly, includeNotForSale, forReplenishment });
          got = filterOptions(catalog.data, search).slice(offset, offset + PAGE);
          if (id === run.current) setSavedAt(catalog.savedAt ?? Date.now());
        }
        if (id !== run.current) return;
        setRows((prev) => (offset === 0 ? got : [...prev, ...got]));
        setMore(got.length >= PAGE);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [api, data, state.online, warehouseId, compositeOnly, includeNotForSale, forReplenishment],
  );

  // save the products now, while kh-pos can be reached, so the search also works offline later
  useEffect(() => {
    if (state.online) void data.catalog(warehouseId, { compositeOnly, includeNotForSale, forReplenishment }).catch(() => undefined);
  }, [data, state.online, warehouseId, compositeOnly, includeNotForSale, forReplenishment]);

  useEffect(() => {
    const h = setTimeout(() => void load(0, text), 300);
    return () => clearTimeout(h);
  }, [load, text]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Input value={text} onChangeText={setText} placeholder={t('production.search')} autoFocus autoCorrect={false} style={styles.search} accessibilityLabel={t('production.search')} />
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        {savedAt !== false ? <StaleBanner savedAt={savedAt} /> : null}
        {error && rows.length === 0 ? (
          <ErrorState error={error} onRetry={() => void load(0, text)} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(v, i) => `${v.variantId}-${i}`}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.md }]}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (more && !loading) void load(rows.length, text);
            }}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={loading ? undefined : <Text style={styles.muted}>{t('production.noComposite')}</Text>}
            ListFooterComponent={loading ? <ActivityIndicator style={styles.spin} color={colors.primary} /> : undefined}
            renderItem={({ item }) => (
              <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
                <Card style={styles.card}>
                  {item.images?.[0]?.url ? <Image source={{ uri: item.images[0].url }} style={styles.img} resizeMode="cover" /> : <View style={[styles.img, styles.noimg]} />}
                  <View style={styles.flex}>
                    <Text style={styles.heading} numberOfLines={2}>
                      {item.productTitle}
                    </Text>
                    <Text style={styles.sub}>{[item.sku ? `SKU: ${item.sku}` : '', item.barcode ?? ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Card>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  search: { flex: 1 },
  close: { fontSize: 20, color: colors.mutedForeground, padding: 4 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg },
  img: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  sub: { fontSize: font.small, color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  spin: { marginVertical: space.lg },
  pressed: { opacity: 0.7 },
});
