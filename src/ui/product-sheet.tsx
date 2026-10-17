import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MenuProduct, ModifierItem } from '@/lib/api';
import { splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { modifierPrice, unitPrice } from '@/lib/order';
import { Button, Input, Stepper } from './components';
import { colors, font, radius, space } from './theme';

export interface ProductChoice {
  qty: number;
  options: ModifierItem[];
  note: string;
}

/** Bottom sheet to choose quantity, options and a note before adding an item (web: product-details-sheet). */
export function ProductSheet({
  product,
  currency,
  busy,
  onClose,
  onAdd,
}: {
  product: MenuProduct | null;
  currency: CurrencyCode;
  busy: boolean;
  onClose: () => void;
  onAdd: (choice: ProductChoice) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  // Fresh choices for every product opened.
  useEffect(() => {
    setQty(1);
    setSelected(new Set());
    setNote('');
  }, [product?.variantId]);

  if (!product) return null;
  const { name, variant } = splitTitle(product.productTitle);
  const groups = (product.modifiers ?? []).filter((g) => (g.items ?? []).length > 0);
  const options = groups.flatMap((g) => g.items ?? []).filter((i) => selected.has(i.id));
  const each = unitPrice(product) + options.reduce((a, o) => a + modifierPrice(o), 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.back')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.titleRow}>
              <View style={styles.flex}>
                <Text style={styles.name}>{name}</Text>
                {variant ? <Text style={styles.variant}>{variant}</Text> : null}
              </View>
              <Text style={styles.price}>{formatMoney(unitPrice(product), currency)}</Text>
            </View>

            {groups.map((g) => (
              <View key={g.modifierId} style={styles.section}>
                <Text style={styles.sectionTitle}>{g.title}</Text>
                <View style={styles.options}>
                  {(g.items ?? []).map((item) => {
                    const on = selected.has(item.id);
                    const extra = modifierPrice(item);
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        onPress={() => toggle(item.id)}
                        style={[styles.option, on && styles.optionOn]}
                      >
                        <Text style={[styles.optionText, on && styles.optionTextOn]}>
                          {item.name}
                          {extra > 0 ? ` +${formatMoney(extra, currency)}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('product.note')}</Text>
              <Input value={note} onChangeText={setNote} placeholder={t('product.notePlaceholder')} maxLength={200} />
            </View>

            <View style={[styles.section, styles.qtyRow]}>
              <Text style={styles.sectionTitle}>{t('product.quantity')}</Text>
              <Stepper value={qty} onChange={setQty} min={1} editable valueLabel={t('product.quantity')} />
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Button
              title={t('product.add', { total: formatMoney(each * qty, currency) })}
              size="lg"
              loading={busy}
              onPress={() => onAdd({ qty, options, note })}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg * 1.5,
    borderTopRightRadius: radius.lg * 1.5,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: space.sm },
  content: { padding: space.lg, gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  name: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, lineHeight: 30 },
  variant: { fontSize: font.body, color: colors.mutedForeground },
  price: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { gap: space.sm },
  sectionTitle: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: font.small, color: colors.foreground },
  optionTextOn: { color: colors.primaryForeground },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm },
});
