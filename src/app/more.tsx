import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GROUP_ORDER, sortByLabel, visibleModules } from '@/lib/modules';
import { useOffline } from '@/lib/offline/provider';
import { pickSetting } from '@/lib/settings';
import type { Setting } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ModuleIcon } from '@/ui/module-icon';
import { ScreenHeader } from '@/ui/screen-header';
import { TabBar, TAB_BAR_SPACE } from '@/ui/tab-bar';
import { colors, font, radius, shadow, space } from '@/ui/theme';

/** Everything the staff member's role can open, grouped, like the kh-pos web menu. */
export default function MoreScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { data } = useOffline();
  const warehouseId = user?.currentWarehouseId ?? '';
  const [settings, setSettings] = useState<Setting[]>([]);
  useEffect(() => {
    // branch settings decide which optional modules show (saved copy when offline)
    data.settings(warehouseId).then(({ data: s }) => setSettings(s), () => undefined);
  }, [data, warehouseId]);
  const modules = visibleModules(user, (option) => pickSetting(settings, option, warehouseId));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        {sortByLabel([...GROUP_ORDER], (g) => t(`more.group_${g}`), i18n.language).map((group) => {
          const items = sortByLabel(
            modules.filter((m) => m.group === group),
            (m) => t(m.titleKey),
            i18n.language,
          );
          if (items.length === 0) return null;
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.groupTitle}>{t(`more.group_${group}`)}</Text>
              <View style={styles.grid}>
                {items.map((m) => (
                  <Pressable
                    key={m.id}
                    testID={`module-${m.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t(m.titleKey)}
                    onPress={() => router.push(m.route as Href)}
                    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  >
                    <View style={styles.icon}>
                      <ModuleIcon id={m.id} size={24} color="#0B43C7" />
                    </View>
                    <Text style={styles.tileText} numberOfLines={2}>
                      {t(m.titleKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <TabBar current="more" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
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
  content: { padding: space.md, gap: space.lg, paddingBottom: TAB_BAR_SPACE + 48 },
  group: { gap: space.sm },
  groupTitle: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '31%',
    minHeight: 92,
    padding: space.sm,
    gap: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: { opacity: 0.7 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: font.small, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
});
