import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './components';
import { SyncBadge } from './sync-status';
import { colors, font, space } from './theme';

/** The top bar of a module screen: back, title, extra buttons, and the Online/Offline pill. */
export function ScreenHeader({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={onBack ?? (() => router.back())} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right}
      <SyncBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
});
