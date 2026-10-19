import * as Crypto from 'expo-crypto';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { countGranted, parsePermissions, type RoleRow } from '@/lib/roles';
import { useSession } from '@/lib/session';
import { Button, Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** Roles like the kh-pos web Accessibility page: see them, open one to change what it may do, or add one. */
export default function RolesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // roles come back as a plain array
      const r = await data.cachedRead('roles-full', 'all', async () => (await api.call<RoleRow[]>('GET', '/api/user/role')) as unknown as RoleRow[]);
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.roles')} right={can(user, 'accessibility', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => router.push({ pathname: '/role/[id]', params: { id: Crypto.randomUUID(), isNew: '1' } })} /> : undefined} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('roles.empty')} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/role/[id]', params: { id: item.id } })} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{item.role}</Text>
                  <Text style={styles.muted}>{t('roles.count', { count: countGranted(parsePermissions(item.permissions)) })}</Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  pressed: { opacity: 0.7 },
});
