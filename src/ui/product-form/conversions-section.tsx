import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { addConversion, conversionComplete, conversionsAvailable, conversionsLeft, fromChoices, patchConversion, removeConversion, toChoices, type ProductFormData } from '@/lib/product-form';
import { Button, Card, Chip } from '@/ui/components';
import { NumInput } from './parts';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * "Variant Conversions": when a variant runs out, kh-pos breaks a larger unit into smaller ones.
 * Each row is From (variant) · rate · To (variant); a pair can be used once (either direction) and
 * the rate is at least 2. Shown only when the product has two or more variants.
 */
export function ConversionsSection({ form, onChange }: { form: ProductFormData; onChange: (f: ProductFormData) => void }) {
  const { t } = useTranslation();
  if (!conversionsAvailable(form)) return null;
  const left = conversionsLeft(form);

  return (
    <View style={styles.box}>
      {form.conversions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('pform.noConversions')}</Text>
          <Text style={styles.muted}>{t('pform.conversionsHint')}</Text>
        </View>
      ) : (
        <Text style={styles.note}>{t('pform.conversionsAuto')}</Text>
      )}

      {form.conversions.map((c, i) => (
        <Card key={i} style={{ ...styles.card, ...(conversionComplete(c) ? styles.complete : {}) }}>
          <Text style={styles.label}>{t('pform.from')}</Text>
          <View style={styles.chips}>
            {fromChoices(form, i).map((v) => (
              <Chip key={v.id} label={v.name} selected={c.fromVariantId === v.id} onPress={() => onChange(patchConversion(form, i, { fromVariantId: v.id, toVariantId: c.toVariantId === v.id ? '' : c.toVariantId }))} />
            ))}
          </View>
          <NumInput label={t('pform.rate')} value={c.conversionRate} decimal={false} onChange={(n) => onChange(patchConversion(form, i, { conversionRate: n ?? 0 }))} />
          <Text style={styles.label}>{t('pform.to')}</Text>
          <View style={styles.chips}>
            {toChoices(form, i).map((v) => (
              <Chip key={v.id} label={v.name} selected={c.toVariantId === v.id} onPress={() => onChange(patchConversion(form, i, { toVariantId: v.id }))} />
            ))}
            {!c.fromVariantId ? <Text style={styles.muted}>{t('pform.chooseFromFirst')}</Text> : null}
          </View>
          {c.conversionRate < 2 ? <Text style={styles.warn}>{t('pform.rateMin')}</Text> : null}
          <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => onChange(removeConversion(form, i))} />
        </Card>
      ))}

      {left > 0 ? <Button title={form.conversions.length === 0 ? t('pform.addConversion') : t('pform.addAnother')} variant="outline" onPress={() => onChange(addConversion(form))} /> : form.conversions.length > 0 ? <Text style={styles.note}>{t('pform.allConversions')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  complete: { borderColor: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  empty: { alignItems: 'center', padding: space.md, gap: 4 },
  emptyTitle: { fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  note: { fontSize: font.small, color: colors.primary },
  warn: { fontSize: font.small, color: colors.warning },
});
