import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { dayText, rangeFor, type DateRange, type RangePreset } from '@/lib/dates';
import { Chip, Input } from './components';
import { colors, font, space } from './theme';

const PRESETS: RangePreset[] = ['today', 'yesterday', 'week', 'month', 'custom'];

/**
 * Today / Yesterday / 7 days / 30 days / a typed range. Calls `onChange` with whole-day dates in
 * the format kh-pos filters use, or null while a typed range isn't a valid one.
 */
export function DateRangeBar({ initial = 'today', onChange }: { initial?: RangePreset; onChange: (range: DateRange | null, preset: RangePreset) => void }) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [from, setFrom] = useState(() => dayText(new Date()));
  const [to, setTo] = useState(() => dayText(new Date()));

  function choose(p: RangePreset) {
    setPreset(p);
    onChange(rangeFor(p, new Date(), { from, to }), p);
  }

  function typed(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    onChange(rangeFor('custom', new Date(), { from: nextFrom, to: nextTo }), 'custom');
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PRESETS.map((p) => (
          <Chip key={p} label={t(`range.${p}`)} selected={preset === p} onPress={() => choose(p)} />
        ))}
      </ScrollView>
      {preset === 'custom' ? (
        <View style={styles.custom}>
          <Input value={from} onChangeText={(v) => typed(v, to)} placeholder="YYYY-MM-DD" autoCapitalize="none" style={styles.date} accessibilityLabel={t('range.from')} />
          <Text style={styles.dash}>→</Text>
          <Input value={to} onChangeText={(v) => typed(from, v)} placeholder="YYYY-MM-DD" autoCapitalize="none" style={styles.date} accessibilityLabel={t('range.to')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: space.sm, gap: space.sm },
  chips: { gap: 6, paddingHorizontal: space.md },
  custom: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  date: { flex: 1 },
  dash: { fontSize: font.body, color: colors.mutedForeground },
});
