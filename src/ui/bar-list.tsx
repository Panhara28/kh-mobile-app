import { StyleSheet, Text, View } from 'react-native';
import { barShare } from '@/lib/reports';
import { colors, font, radius, space } from './theme';

/** Rows with a bar the length of their value, for the report charts (no chart library needed). */
export function BarList({ rows, format, tone = 'primary' }: { rows: { label: string; value: number; note?: string }[]; format: (v: number) => string; tone?: 'primary' | 'success' | 'warning' }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View style={styles.list}>
      {rows.map((r, i) => (
        <View key={`${r.label}-${i}`} style={styles.item}>
          <View style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={styles.value}>{format(r.value)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${barShare(r.value, max) * 100}%`, backgroundColor: color }]} />
          </View>
          {r.note ? <Text style={styles.note}>{r.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  item: { gap: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  label: { flexShrink: 1, fontSize: font.small, color: colors.foreground },
  value: { fontSize: font.small, fontWeight: '700', color: colors.foreground },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.muted, overflow: 'hidden' },
  bar: { height: 8, borderRadius: radius.full },
  note: { fontSize: 11, color: colors.mutedForeground },
});
