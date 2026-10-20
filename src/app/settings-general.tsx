import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import type { SettingRow } from '@/lib/settings-admin';
import { canEditSetting, generateCategories, getSettingConfig, settingsForCategory, validateSetting } from '@/lib/settings-general';
import { useSettingRows } from '@/lib/use-setting-rows';
import { Badge, Button, Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { renderEditor } from '@/ui/settings/editors';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/** One setting row: its editor, and a Save for that row alone (like the web). */
function SettingEditor({ row, isMain, onSaved }: { row: SettingRow; isMain: boolean; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const guard = useOnlineOnly();
  const config = getSettingConfig(row.option ?? '', row.value ?? '');
  const [value, setValue] = useState(row.value ?? '');
  const [busy, setBusy] = useState(false);
  const mayEdit = can(user, 'setting', 'update') && canEditSetting(row, isMain);
  const editor = renderEditor(config.type, { value, onChange: setValue, disabled: !mayEdit, unit: config.unit, placeholder: config.placeholder });
  const changed = value !== (row.value ?? '');

  // a fresh row from the server (after a save, or a reload) replaces what is typed
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(row.value ?? '');
  }, [row.value]);

  function save() {
    const problem = validateSetting(config.type, value);
    if (problem) {
      Alert.alert(t(`sg.problem_${problem}`));
      return;
    }
    guard(() => {
      void (async () => {
        setBusy(true);
        try {
          await api.call('PUT', '/api/setting', { id: row.id, option: row.option ?? '', value });
          await onSaved();
          Alert.alert(t('sg.saved'));
        } catch (e) {
          Alert.alert(t('sg.saveFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(false);
        }
      })();
    });
  }

  return (
    <Card style={styles.editorCard}>
      <View style={styles.scopeRow}>
        <Badge tone={row.warehouse ? 'info' : 'default'} text={row.warehouse ? t('sg.thisBranch') : t('sg.allBranches')} />
        {!mayEdit ? <Text style={styles.muted}>{t(row.warehouse ? 'sg.noPermission' : 'sg.mainOnly')}</Text> : null}
      </View>
      {editor ?? <Button title={t('acc.open')} variant="outline" onPress={() => router.push('/accessibility' as never)} />}
      {editor && mayEdit ? <Button title={t('sg.save')} onPress={save} loading={busy} disabled={!changed} /> : null}
    </Card>
  );
}

/**
 * Settings → General, like the web: every setting option is a category (restaurant / cinema sections only
 * for that POS type, currency and exchange rate on the main branch), each with its editor and its own Save.
 */
export default function SettingsGeneral() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { rows, stale, error, reload } = useSettingRows();
  const [selected, setSelected] = useState<string | null>(null);
  const isMain = (user?.warehouse as { isMain?: boolean } | null | undefined)?.isMain !== false;
  const isDev = !!(user as { isDev?: boolean } | null)?.isDev;

  const categories = useMemo(() => (rows ? generateCategories(rows, isDev || isMain) : []), [rows, isDev, isMain]);
  const category = categories.find((c) => c.id === selected);
  const forCategory = rows ? settingsForCategory(rows, category) : [];

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <ScreenHeader title={category ? category.label : t('sg.tile_general')} onBack={category ? () => setSelected(null) : undefined} />
      {stale !== false ? <StaleBanner savedAt={stale} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void reload()} /> : <LoadingState />
      ) : categories.length === 0 ? (
        <EmptyState title={t('sg.noSettings')} description={t('sg.noSettingsHint')} />
      ) : category ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.muted}>{getSettingConfig(category.option, forCategory[0]?.value ?? '').description}</Text>
            {forCategory.length === 0 ? <EmptyState title={t('sg.noSettings')} /> : null}
            {forCategory.map((row) => (
              <SettingEditor key={row.id} row={row} isMain={isMain} onSaved={reload} />
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.muted}>{t('sg.pickCategory')}</Text>
          {categories.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => setSelected(c.id)} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{c.label}</Text>
                <Text style={styles.muted} numberOfLines={1}>{getSettingConfig(c.option).description}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  body: { padding: space.lg, gap: space.md },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  chevron: { fontSize: 24, color: colors.mutedForeground },
  editorCard: { gap: space.md, padding: space.lg },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
