import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildLines, defaultChoices, rewardLabel, type PromotionCandidate, type PromotionLine, type PromotionSlot, type SummaryLabels } from '@/lib/promotion-set';
import { cardPrice } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { Button } from './components';
import { colors, font, radius, space } from './theme';

/**
 * Asks which product to use for the slots of a promotion set that have more than one option
 * ("1 x any meat"), like the web picker. A slot with one option is shown as fixed.
 */
export function PromotionPicker({
  title,
  slots,
  labels,
  currency,
  imageFor,
  onCancel,
  onAdd,
}: {
  title: string;
  slots: PromotionSlot[];
  labels: SummaryLabels;
  currency: CurrencyCode;
  imageFor: (c: PromotionCandidate) => string | null;
  onCancel: () => void;
  onAdd: (lines: PromotionLine[]) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<(PromotionCandidate | undefined)[]>(() => defaultChoices(slots));
  const lines = buildLines(slots, chosen);

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{t('promo.pickerTitle', { title })}</Text>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.hint}>{t('promo.pickerHint')}</Text>
            {slots.map((slot, index) => {
              const fixed = slot.candidates.length === 1;
              const reward = rewardLabel(slot.item, labels);
              return (
                <View key={slot.item.id} style={styles.slot}>
                  <Text style={styles.slotTitle}>
                    {t(fixed ? 'promo.slotFixed' : 'promo.slotChoose', { qty: slot.item.qty, name: fixed ? slot.candidates[0]!.productTitle : slot.item.matchTitle || '' })}
                    {reward ? `  · ${reward}` : ''}
                  </Text>
                  {!fixed ? (
                    <View style={styles.grid}>
                      {slot.candidates.map((c) => {
                        const selected = chosen[index]?.variantId === c.variantId;
                        const img = imageFor(c);
                        return (
                          <Pressable
                            key={c.variantId}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => setChosen((prev) => prev.map((p, i) => (i === index ? c : p)))}
                            style={[styles.candidate, selected && styles.candidateOn]}
                          >
                            {img ? <Image source={{ uri: img }} style={styles.image} /> : <View style={[styles.image, styles.noImage]} />}
                            <View style={styles.flex}>
                              <Text style={styles.name} numberOfLines={2}>
                                {c.productTitle}
                              </Text>
                              <Text style={styles.price}>{formatMoney(cardPrice(c).price, currency)}</Text>
                            </View>
                            {selected ? <Text style={styles.check}>✓</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.cancel')} variant="outline" onPress={onCancel} style={styles.flex} />
          <Button title={t('promo.addSet')} disabled={!lines} onPress={() => lines && onAdd(lines)} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.page },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  body: { padding: space.md, gap: space.lg },
  hint: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  slot: { gap: space.sm },
  slotTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  grid: { gap: space.sm },
  candidate: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card },
  candidateOn: { borderColor: colors.primary, backgroundColor: colors.secondary },
  image: { width: 48, height: 48, borderRadius: radius.sm },
  noImage: { backgroundColor: colors.muted },
  name: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  price: { fontSize: font.small, color: colors.mutedForeground },
  check: { fontSize: font.title, color: colors.primary },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
