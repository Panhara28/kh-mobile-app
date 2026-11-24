import { createContext, useContext, useEffect, useState, type ReactNode, type Ref, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Text, TextInput } from '@/ui/text';
import { clampInt } from '@/lib/number';
import { colors, font, radius, shadow, space } from './theme';

/** True inside the blue header bar: buttons there use their light look so they stay readable. */
export const OnBrand = createContext(false);

/** shadcn Button: default (BongIT blue), outline, secondary, destructive, ghost. */
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
  testID,
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
  /** A fixed name for automated phone tests (see e2e/), the same in every language. */
  testID?: string;
}) {
  const inactive = disabled || loading;
  const v = (useContext(OnBrand) ? brandVariants : variants)[variant];
  return (
    <Pressable
      testID={testID}
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

/** The same buttons on the blue header (see OnBrand). */
const brandVariants = {
  default: { bg: '#ffffff', fg: colors.brandFrom, border: '#ffffff' },
  outline: { bg: 'rgba(255,255,255,0.16)', fg: '#ffffff', border: 'rgba(255,255,255,0.4)' },
  secondary: { bg: 'rgba(255,255,255,0.16)', fg: '#ffffff', border: 'rgba(255,255,255,0.16)' },
  destructive: variants.destructive,
  ghost: { bg: 'transparent', fg: '#ffffff', border: 'transparent' },
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

export function Input(props: TextInputProps & { ref?: Ref<ComponentRef<typeof TextInput>> }) {
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
}: TextInputProps & { label: string; error?: string; right?: ReactNode; ref?: Ref<ComponentRef<typeof TextInput>> }) {
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

/** − qty + (web: cart-item-qty). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  disabled,
  decreaseLabel = '−',
  increaseLabel = '+',
  editable,
  autoFocus,
  onSubmit,
  valueLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  /** The number can also be tapped and typed (faster for big numbers, e.g. 25 guests). */
  editable?: boolean;
  autoFocus?: boolean;
  /** Keyboard "done" on the typed number. */
  onSubmit?: () => void;
  valueLabel?: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        disabled={disabled || value <= min}
        onPress={() => onChange(value - 1)}
        hitSlop={6}
        style={[styles.stepperButton, (disabled || value <= min) && styles.stepperDisabled]}
      >
        <Text style={styles.stepperSign}>−</Text>
      </Pressable>
      {editable ? (
        <NumberInput
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={onChange}
          onSubmit={onSubmit}
          accessibilityLabel={valueLabel}
        />
      ) : (
        <Text style={styles.stepperValue}>{value}</Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        disabled={disabled || value >= max}
        onPress={() => onChange(value + 1)}
        hitSlop={6}
        style={[styles.stepperButton, (disabled || value >= max) && styles.stepperDisabled]}
      >
        <Text style={styles.stepperSign}>+</Text>
      </Pressable>
    </View>
  );
}

/** A whole number typed with the number pad; out-of-range values snap back when leaving the field. */
function NumberInput({
  value,
  min,
  max,
  disabled,
  autoFocus,
  onChange,
  onSubmit,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (v: number) => void;
  onSubmit?: () => void;
  accessibilityLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // Follow the +/− buttons and server updates, but not while the user is typing.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = clampInt(text, min, max, value);
    setText(String(n));
    if (n !== value) onChange(n);
  };

  return (
    <TextInput
      value={text}
      onChangeText={(v) => {
        const digits = v.replace(/[^0-9]/g, '').slice(0, 4);
        setText(digits);
        if (digits) onChange(clampInt(digits, min, max, value));
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onSubmitEditing={() => {
        commit();
        onSubmit?.();
      }}
      keyboardType="number-pad"
      returnKeyType="done"
      selectTextOnFocus
      autoFocus={autoFocus}
      editable={!disabled}
      accessibilityLabel={accessibilityLabel}
      style={styles.numberInput}
    />
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  numberInput: {
    minWidth: 52,
    height: 38,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: font.title,
    fontWeight: '700',
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stepperDisabled: { opacity: 0.4 },
  stepperSign: { fontSize: 18, fontWeight: '600', color: colors.foreground, lineHeight: 20 },
  stepperValue: { minWidth: 24, textAlign: 'center', fontSize: font.body, fontWeight: '600', color: colors.foreground },
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
