import type { ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, font, radius, shadow, space } from './theme';

/** shadcn Button: default (black), outline, secondary, destructive, ghost. */
export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'default',
  size = 'md',
  left,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  left?: ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const inactive = disabled || loading;
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        sizes[size],
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || inactive) && { opacity: 0.6 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : left}
      <Text style={[styles.buttonText, { color: v.fg }, size === 'sm' && styles.buttonTextSm]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const variants = {
  default: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
  outline: { bg: colors.background, fg: colors.foreground, border: colors.border },
  secondary: { bg: colors.secondary, fg: colors.foreground, border: colors.secondary },
  destructive: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive },
  ghost: { bg: 'transparent', fg: colors.foreground, border: 'transparent' },
} as const;

const sizes = StyleSheet.create({
  sm: { minHeight: 34, paddingHorizontal: space.md },
  md: { minHeight: 42, paddingHorizontal: space.lg },
  lg: { minHeight: 50, paddingHorizontal: space.xl },
});

/** Category chip in the menu's horizontal bar (web: Button default/outline, size sm). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  text,
  tone = 'default',
  style,
}: {
  text: string;
  tone?: 'default' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';
  style?: ViewStyle;
}) {
  const t = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const badgeTones = {
  default: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
  destructive: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive },
  outline: { bg: colors.background, fg: colors.foreground, border: colors.border },
  success: { bg: colors.successBg, fg: colors.success, border: colors.successBg },
  warning: { bg: colors.warningBg, fg: colors.warning, border: colors.warningBg },
  info: { bg: colors.infoBg, fg: colors.info, border: colors.infoBg },
} as const;

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Input(props: TextInputProps & { ref?: Ref<TextInput> }) {
  return (
    <TextInput
      placeholderTextColor={colors.mutedForeground}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

/** Label + input + error, like the web form fields (Label, Input className="mt-1"). */
export function Field({
  label,
  error,
  right,
  ...input
}: TextInputProps & { label: string; error?: string; right?: ReactNode; ref?: Ref<TextInput> }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <Input
          accessibilityLabel={label}
          {...input}
          style={[error ? styles.inputError : null, right ? styles.inputWithRight : null, input.style]}
        />
        {right ? <View style={styles.inputRight}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Sticky top bar of every screen (web: bg-card/95 border-b p-3). */
export function Header({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {left}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentSelected]}
        >
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextSelected]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  buttonText: { fontSize: font.body, fontWeight: '600', lineHeight: font.lineHeight },
  buttonTextSm: { fontSize: font.small },
  chip: {
    paddingHorizontal: space.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.small, fontWeight: '500', color: colors.foreground },
  chipTextSelected: { color: colors.primaryForeground },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: font.body,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  field: { gap: 6 },
  label: { fontSize: font.small, fontWeight: '500', color: colors.foreground },
  inputError: { borderColor: colors.destructive },
  inputWithRight: { paddingRight: 48 },
  inputRight: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  error: { fontSize: font.small, color: colors.destructive },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1, minWidth: 0 },
  headerTitle: { fontSize: font.title, fontWeight: '600', color: colors.foreground, flexShrink: 1 },
  segmented: { flexDirection: 'row', backgroundColor: colors.muted, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.sm, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.background, ...shadow.card },
  segmentText: { fontSize: font.small, color: colors.mutedForeground, fontWeight: '500' },
  segmentTextSelected: { color: colors.foreground },
});
