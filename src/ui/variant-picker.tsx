import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import type { ProductListItem } from '@/lib/products';
import { Card, Input } from './components';
import { ErrorState } from './states';
import { colors, font, radius, space } from './theme';

export interface PickedVariant {
  variantId: string;
  productId: string;
  /** "Product (Variant)" */
  name: string;
  price: number;
  cost: number;
  barcode: string;
}

/** Search the products and pick one variant (for purchase orders, stock transfers, ...). */
export function VariantPicker({ api, onPick, onClose }: { api: KhPosApi; onPick: (v: PickedVariant) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<PickedVariant[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const h = setTimeout(() => {
      const q = new URLSearchParams({ limit: '30', offset: '0' });
      if (text.trim()) q.set('searchTitle', text.trim());
      api
        .call<{ result?: { data: (Omit<ProductListItem, 'productVariants'> & { productVariants?: { id: string; name: string; price: number | null; barcode?: string | null; purchasePrice?: number | null }[] })[] } }>('GET', `/api/product-v2?${q.toString()}`)
        .then((r) => {
          if (cancelled) return;
          setError(null);
          setRows(
            (r.result?.data ?? []).flatMap((p) =>
              (p.productVariants ?? []).map((v) => ({
                variantId: v.id,
                productId: p.id,
                name: v.name && v.name !== 'ns' ? `${p.title} (${v.name})` : p.title,
                price: Number(v.price) || 0,
                cost: Number(v.purchasePrice) || 0,
                barcode: v.barcode ?? '',
              })),
            ),
          );
        })
        .catch((e) => !cancelled && setError(e));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [api, text]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Input value={text} onChangeText={setText} placeholder={t('products.search')} autoFocus autoCorrect={false} style={styles.search} accessibilityLabel={t('products.search')} />
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        {error ? (
          <ErrorState error={error} />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(v) => v.variantId}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.md }]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.muted}>{t('products.empty')}</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
                <Card style={styles.card}>
                  <Text style={styles.heading} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.muted}>
                    {formatMoney(item.price, 'USD')}
                    {item.barcode ? ` · ${item.barcode}` : ''}
                  </Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  search: { flex: 1 },
  close: { fontSize: 20, color: colors.mutedForeground, padding: 4 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 2, borderRadius: radius.lg },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
