import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GROUP_ORDER, visibleModules } from '@/lib/modules';
import { useOffline } from '@/lib/offline/provider';
import { pickSetting } from '@/lib/settings';
import type { Setting } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { SyncBadge } from '@/ui/sync-status';
import { colors, font, radius, shadow, space } from '@/ui/theme';

/** Everything the staff member's role can open, grouped, like the kh-pos web menu. */
export default function MoreScreen() {
  const { t } = useTranslation();
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
      <View style={styles.header}>
        <Button title={`‹ ${t('common.back')}`} variant="ghost" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace('/tables'))} />
        <Text style={styles.title}>{t('more.title')}</Text>
        <SyncBadge />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {GROUP_ORDER.map((group) => {
          const items = modules.filter((m) => m.group === group);
          if (items.length === 0) return null;
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.groupTitle}>{t(`more.group_${group}`)}</Text>
              <View style={styles.grid}>
                {items.map((m) => (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(m.titleKey)}
                    onPress={() => router.push(m.route as Href)}
                    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  >
                    <Text style={styles.icon}>{m.icon}</Text>
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
  content: { padding: space.md, gap: space.lg },
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
  icon: { fontSize: 26 },
  tileText: { fontSize: font.small, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
});
