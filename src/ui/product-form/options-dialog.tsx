import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { canGenerate, MAX_OPTIONS, optionProblems, type OptionForm } from '@/lib/product-form';
import { Button, Card, Chip, Input } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * "Configure Product Options": up to three options (Size, Color, ...), each with values, from which
 * the variants are generated. For a product that already exists the options cannot be added or removed
 * and its existing values stay (their variants exist); new values can be added.
 */
export function OptionsDialog({ start, existing, onClose, onGenerate }: { start: OptionForm[]; existing: boolean; onClose: () => void; onGenerate: (options: OptionForm[]) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<OptionForm[]>(start);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const problems = optionProblems(options);
  const has = (i: number, kind: string) => problems.some((p) => p.index === i && p.kind === kind);

  const patch = (i: number, p: Partial<OptionForm>) => setOptions((os) => os.map((o, k) => (k === i ? { ...o, ...p } : o)));

  function addValue(i: number) {
    const v = (draft[i] ?? '').trim();
    if (!v || options[i]!.values.some((x) => x.value === v)) {
      setDraft((d) => ({ ...d, [i]: '' }));
      return;
    }
    patch(i, { values: [...options[i]!.values, { id: Crypto.randomUUID(), value: v }] });
    setDraft((d) => ({ ...d, [i]: '' }));
  }

  /** A value typed but not yet added still counts when generating, as on the web. */
  function generate() {
    const withDraft = options.map((o, i) => {
      const v = (draft[i] ?? '').trim();
      return v && !o.values.some((x) => x.value === v) ? { ...o, values: [...o.values, { id: Crypto.randomUUID(), value: v }] } : o;
    });
    onGenerate(withDraft);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{t('pform.configureOptions')}</Text>
            <Text style={styles.muted}>{t('pform.optionsHint')}</Text>
            {options.map((o, i) => (
              <Card key={o.id || i} style={{ ...styles.card, ...(has(i, 'name') || has(i, 'duplicate') || has(i, 'values') ? styles.bad : {}) }}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{t('pform.optionN', { n: i + 1 })}</Text>
                  {!existing && options.length > 1 ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => setOptions((os) => os.filter((_, k) => k !== i))} /> : null}
                </View>
                <Input value={o.name} onChangeText={(v) => patch(i, { name: v })} placeholder={t('pform.optionName')} accessibilityLabel={t('pform.optionName')} />
                {has(i, 'name') ? <Text style={styles.error}>{t('pform.optionNameRequired')}</Text> : null}
                {has(i, 'duplicate') ? <Text style={styles.error}>{t('pform.optionNameDuplicate', { name: o.name })}</Text> : null}
                <Text style={styles.label}>{t('pform.values')}</Text>
                <View style={styles.chips}>
                  {o.values.map((v) => (
                    <Chip key={v.id} label={v.locked ? v.value : `${v.value}  ✕`} selected onPress={() => (v.locked ? undefined : patch(i, { values: o.values.filter((x) => x.id !== v.id) }))} />
                  ))}
                </View>
                <View style={styles.row}>
                  <Input style={styles.flex} value={draft[i] ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, [i]: v }))} onSubmitEditing={() => addValue(i)} returnKeyType="done" placeholder={t('pform.addValue')} accessibilityLabel={t('pform.addValue')} />
                  <Button title={t('common.add')} variant="outline" size="sm" onPress={() => addValue(i)} />
                </View>
                {has(i, 'values') && !(draft[i] ?? '').trim() ? <Text style={styles.error}>{t('pform.valuesRequired')}</Text> : null}
              </Card>
            ))}
            {!existing && options.length < MAX_OPTIONS ? <Button title={`+ ${t('pform.addOption')}`} variant="outline" onPress={() => setOptions((os) => [...os, { id: Crypto.randomUUID(), name: '', values: [] }])} /> : null}
            <Text style={styles.muted}>{!existing && options.length < MAX_OPTIONS ? t('pform.upToThree') : ''}</Text>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('common.cancel')} variant="outline" onPress={onClose} style={styles.flex} />
            <Button title={t('pform.generate')} disabled={!canGenerate(options.map((o, i) => ({ ...o, values: (draft[i] ?? '').trim() ? [...o.values, { id: 'draft', value: draft[i]! }] : o.values })))} onPress={generate} style={styles.flex} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  bad: { borderWidth: 1, borderColor: colors.destructive },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
