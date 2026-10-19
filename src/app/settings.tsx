import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { systemType } from '@/lib/settings-general';
import { hubTiles, type HubKey } from '@/lib/settings-hub';
import { useSettingRows } from '@/lib/use-setting-rows';
import { Badge } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const ROUTES: Partial<Record<HubKey, string>> = { general: '/settings-general' };

/**
 * The web Settings dialog (Profile → Settings): a tile for each section the role may open —
 * General, Users, Delivery (restaurant POS) and Payment Method (main branch).
 */
export default function SettingsHub() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { rows, stale, error, reload } = useSettingRows();
  const isMain = (user?.warehouse as { isMain?: boolean } | null | undefined)?.isMain !== false;
  const tiles = rows ? hubTiles(user, systemType(rows), isMain) : [];

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <ScreenHeader title={t('sg.settings')} />
      {stale !== false ? <StaleBanner savedAt={stale} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void reload()} /> : <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.lead}>{t('sg.chooseSection')}</Text>
          {tiles.length === 0 ? <Text style={styles.muted}>{t('sg.noAccess')}</Text> : null}
          {tiles.map((tile) => {
            const route = ROUTES[tile.key];
            return (
              <Pressable
                key={tile.key}
                accessibilityRole="button"
                disabled={!route}
                onPress={() => route && router.push(route as never)}
                style={[styles.tile, !route && styles.tileOff]}
              >
                <View style={styles.tileText}>
                  <Text style={styles.tileTitle}>{t(`sg.tile_${tile.key}`)}</Text>
                  <Text style={styles.muted}>{t(`sg.tile_${tile.key}_desc`)}</Text>
                </View>
                {route ? <Text style={styles.chevron}>›</Text> : <Badge tone="default" text={t('sg.comingNext')} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  body: { padding: space.lg, gap: space.md },
  lead: { fontSize: font.body, color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  tileOff: { opacity: 0.6 },
  tileText: { flex: 1, gap: 2 },
  tileTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  chevron: { fontSize: 24, color: colors.mutedForeground },
});
