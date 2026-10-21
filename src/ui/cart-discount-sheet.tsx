import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TableOrder } from '@/lib/api';
import { buildCartDiscount, cartLines, checkCartDiscount, currentCartDiscount, previewCartDiscount, removeAllDiscounts, type CartDiscountType } from '@/lib/cart-discount';
import { splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { Button, Card, Field, Segmented } from './components';
import { colors, font, radius, space } from './theme';

export type CartDiscountRow = { orderDetailId: string; amount: number; discountType: CartDiscountType };

/**
 * "Discount Cart" like the kh-pos web sheet: a percentage or an amount for the whole order, with
 * lines that can be left out and a preview of the new total. An amount is shared across the chosen
 * lines in proportion to their price.
 */
export function CartDiscountSheet({ order, currency, busy, onClose, onApply }: { order: TableOrder; currency: CurrencyCode; busy: boolean; onClose: () => void; onApply: (rows: CartDiscountRow[]) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lines = cartLines(order);
  const current = currentCartDiscount(order);
  const [type, setType] = useState<CartDiscountType>(current?.type ?? 'PERCENTAGE');
  const [text, setText] = useState(current ? String(current.value) : '');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const value = Number(text.replace(/,/g, '')) || 0;
  const preview = previewCartDiscount(lines, excluded, type, value);
  const money = (v: number) => formatMoney(v, currency);
  const anyManual = lines.some((l) => l.hasManual);

  function apply() {
    const check = checkCartDiscount(lines, excluded, type, value);
    if (check !== 'ok') {
      setProblem(check);
      return;
    }
    onApply(buildCartDiscount(lines, excluded, type, value));
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('cartDiscount.title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.card}>
              <Segmented
                options={[
                  { value: 'PERCENTAGE', label: t('discounts.percentage') },
                  { value: 'AMOUNT', label: t('discounts.amount') },
                ]}
                value={type}
                onChange={(v) => {
                  setType(v);
                  setProblem(null);
                }}
              />
              <Field
                label={type === 'PERCENTAGE' ? t('cartDiscount.percent') : t('cartDiscount.money')}
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setProblem(null);
                }}
                keyboardType="decimal-pad"
                selectTextOnFocus
                error={problem ? t(`cartDiscount.error_${problem}`) : undefined}
              />
            </Card>

            <Text style={styles.section}>{t('cartDiscount.lines')}</Text>
            {lines.map((l) => {
              const on = !excluded.has(l.orderDetailId);
              const row = preview?.rows.find((r) => r.orderDetailId === l.orderDetailId);
              return (
                <Card key={l.orderDetailId} style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Text style={styles.heading} numberOfLines={2}>
                        {l.qty} × {splitTitle(l.title).name}
                      </Text>
                      <Text style={styles.muted}>
                        {money(l.netBase)}
                        {row ? ` → ${money(row.final)} (−${money(row.manual)})` : ''}
                      </Text>
                    </View>
                    <Switch
                      value={on}
                      onValueChange={(v) => {
                        setExcluded((s) => {
                          const next = new Set(s);
                          if (v) next.delete(l.orderDetailId);
                          else next.add(l.orderDetailId);
                          return next;
                        });
                        setProblem(null);
                      }}
                    />
                  </View>
                </Card>
              );
            })}
            {preview ? (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('cartDiscount.off')}</Text>
                  <Text style={styles.value}>−{money(preview.totalManual)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('receipt.total')}</Text>
                  <Text style={styles.value}>{money(preview.finalTotal)}</Text>
                </View>
              </Card>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {anyManual ? <Button title={t('cartDiscount.removeAll')} variant="outline" loading={busy} onPress={() => onApply(removeAllDiscounts(lines))} style={styles.flex} /> : null}
          <Button title={t('cartDiscount.apply')} loading={busy} onPress={apply} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  close: { fontSize: 20, color: colors.mutedForeground, padding: 4 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
