import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { ACTIONS, parsePermissions, RESOURCES, roleBody, setAll, toggleAction, validateRole, type Permissions, type RoleRow } from '@/lib/roles';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/** Add or edit a role: its name and, per part of the system, what it may read, create, update and delete. */
export default function RoleScreen() {
  const { t } = useTranslation();
  const { id, isNew } = useLocalSearchParams<{ id: string; isNew?: string }>();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();

  const [ready, setReady] = useState(!!isNew);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Permissions>({});
  const [filter, setFilter] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    data.cachedRead('roles-full', 'all', async () => (await api.call<RoleRow[]>('GET', '/api/user/role')) as unknown as RoleRow[]).then(
      (r) => {
        const row = r.data.find((x) => x.id === id);
        if (!row) {
          setError(new Error('not found'));
          return;
        }
        setName(row.role);
        setPerms(parsePermissions(row.permissions));
        setReady(true);
      },
      (e) => setError(e),
    );
  }, [data, api, id, isNew]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.roles')} />
        {error ? <ErrorState error={error} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const canSave = can(user, 'accessibility', isNew ? 'create' : 'update');
  const canDelete = !isNew && can(user, 'accessibility', 'delete');
  const shown = RESOURCES.filter((r) => !filter.trim() || r.includes(filter.trim().toLowerCase()) || t(`roles.res_${r}`, { defaultValue: r }).toLowerCase().includes(filter.trim().toLowerCase()));

  function save() {
    const bad = validateRole(name, perms);
    setProblem(bad);
    if (bad) return;
    guard(async () => {
      setBusy(true);
      try {
        await api.call(isNew ? 'POST' : 'PUT', '/api/user/role', roleBody(name, perms, isNew ? undefined : id));
        router.back();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={isNew ? t('roles.new') : name} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Input value={name} onChangeText={setName} placeholder={t('roles.name')} maxLength={50} accessibilityLabel={t('roles.name')} />
            {problem ? <Text style={styles.error}>{t(`roles.error_${problem}`)}</Text> : null}
          </Card>
          <Input value={filter} onChangeText={setFilter} placeholder={t('admin.search')} autoCapitalize="none" accessibilityLabel={t('admin.search')} />
          {shown.map((r) => {
            const list = perms[r] ?? [];
            return (
              <Card key={r} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{t(`roles.res_${r}`, { defaultValue: r })}</Text>
                  <Chip label={t('roles.all')} selected={list.length === ACTIONS.length} onPress={() => setPerms((p) => setAll(p, r, list.length !== ACTIONS.length))} />
                </View>
                <View style={styles.chips}>
                  {ACTIONS.map((a) => (
                    <Chip key={a} label={t(`roles.action_${a}`)} selected={list.includes(a)} onPress={() => setPerms((p) => toggleAction(p, r, a, !list.includes(a)))} />
                  ))}
                </View>
              </Card>
            );
          })}
          {canDelete ? (
            <Button
              title={t('admin.delete')}
              variant="outline"
              onPress={() =>
                Alert.alert(t('admin.deleteConfirm', { name }), undefined, [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('admin.delete'), style: 'destructive', onPress: () => guard(async () => { try { await api.call('DELETE', '/api/user/role', { id: [id] }); router.back(); } catch (e) { Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined); } }) },
                ])
              }
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {canSave ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.cancel')} variant="outline" onPress={() => router.back()} style={styles.flex} />
          <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  error: { fontSize: font.small, color: colors.destructive },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
