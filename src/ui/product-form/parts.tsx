import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/ui/text';
import { Card, Field } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/** A titled card, like the web form's sections. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

/** A label with a switch on the right. */
export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/**
 * A number box that can be empty (null): what is typed stays as typed, and a clean number (or null)
 * is reported. It follows the value when that is changed from elsewhere (for example "set price for all").
 */
export function NumInput({ label, value, onChange, decimal = true, placeholder }: { label: string; value: number | null; onChange: (n: number | null) => void; decimal?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    // follow outside changes only when they differ from what the text already says
    const typed = text.trim() === '' ? null : Number(text.replace(/,/g, ''));
    if (typed !== value && !(typed === null && value === null)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(value === null ? '' : String(value));
    }
    // only when the value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field
      label={label}
      value={text}
      placeholder={placeholder}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      onChangeText={(v) => {
        setText(v);
        const clean = v.replace(/,/g, '').trim();
        if (clean === '') onChange(null);
        else {
          const n = Number(clean);
          onChange(Number.isFinite(n) ? n : null);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  section: { padding: space.md, gap: space.md, borderRadius: radius.lg },
  sectionTitle: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  toggleLabel: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
});
