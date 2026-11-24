import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/text';
import { OnBrand } from './components';
import { SyncBadge } from './sync-status';
import { colors, font, radius, space } from './theme';

export const BRAND_GRADIENT = `linear-gradient(160deg, ${colors.brandFrom} 0%, ${colors.brandTo} 100%)`;

/**
 * The blue gradient bar every screen starts with. Screens sit in a SafeAreaView with the top edge, so
 * the bar reaches up under the status bar (negative margin) and the gradient fills it too.
 */
export function HeaderBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <OnBrand.Provider value>
      <View style={[styles.bar, { marginTop: -insets.top, paddingTop: insets.top + space.sm }, style]}>{children}</View>
    </OnBrand.Provider>
  );
}

/** Round white-on-blue back button. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={6}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/more')))}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <ChevronLeft size={22} color="#fff" strokeWidth={2.4} />
    </Pressable>
  );
}

/** The top bar of a module screen: back, title, extra buttons, and the Online/Offline pill. */
export function ScreenHeader({ title, right, onBack, subtitle }: { title: string; right?: ReactNode; onBack?: () => void; subtitle?: string | null }) {
  return (
    <HeaderBar>
      <View style={styles.row}>
        <BackButton onPress={onBack} />
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
        <SyncBadge />
      </View>
    </HeaderBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    backgroundColor: colors.brandFrom,
    experimental_backgroundImage: BRAND_GRADIENT,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  back: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  titles: { flex: 1, minWidth: 0 },
  title: { fontSize: font.title, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
});
