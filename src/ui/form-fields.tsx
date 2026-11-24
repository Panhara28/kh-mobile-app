import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { Button, Chip, Field } from './components';
import { colors, font, space } from './theme';

/** Pick one of a few options (chips); with no options at all it is a plain text box. */
export function OptionField({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  if (options.length === 0) return <Field label={label} value={value} onChangeText={onChange} error={error} />;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A list of short words (features, tags): type one, add it, tap to remove. */
export function TagsField({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.tagRow}>
        <Field label="" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" accessibilityLabel={label} />
        <Button title={t('common.add')} variant="outline" size="sm" onPress={add} />
      </View>
      <View style={styles.chips2}>
        {values.map((v) => (
          <Chip key={v} label={`${v}  ✕`} selected onPress={() => onChange(values.filter((x) => x !== v))} />
        ))}
      </View>
    </View>
  );
}

/** A number box that keeps what is typed as text and reports a clean number. */
export function NumberField({ label, value, onChange, decimal }: { label: string; value: number; onChange: (n: number) => void; decimal?: boolean }) {
  const [text, setText] = useState(String(value));
  return (
    <Field
      label={label}
      value={text}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      onChangeText={(v) => {
        setText(v);
        onChange(Number(v.replace(/,/g, '')) || 0);
      }}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  chips: { gap: 6 },
  chips2: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  error: { fontSize: font.small, color: colors.destructive },
});
