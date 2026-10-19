import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { compositeQuery, type CompositeOption } from '@/lib/production';
import { Card, Input } from '../components';
import { ErrorState } from '../states';
import { colors, font, radius, space } from '../theme';

const PAGE = 20;

/** The web's product search on the Production form: only composed products (those with a recipe), for this branch. */
export function CompositePicker({ api, warehouseId, onPick, onClose }: { api: KhPosApi; warehouseId: string; onPick: (v: CompositeOption) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
        const r = await api.call<{ result?: CompositeOption[] }>('GET', `/api/product/search-product?${compositeQuery(search, warehouseId, offset, PAGE)}`);
        if (id !== run.current) return;
        const got = r.result ?? [];
        setRows((prev) => (offset === 0 ? got : [...prev, ...got]));
        setMore(got.length >= PAGE);
        setError(null);
      } catch (e) {
        if (id === run.current) setError(e);
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [api, warehouseId],
  );

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
            ListEmptyComponent={loading ? null : <Text style={styles.muted}>{t('production.noComposite')}</Text>}
            ListFooterComponent={loading ? <ActivityIndicator style={styles.spin} color={colors.primary} /> : null}
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
