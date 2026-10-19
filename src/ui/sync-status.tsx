import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeCommand } from '@/lib/offline/describe';
import { storeInfo } from '@/lib/offline/store';
import { useOffline } from '@/lib/offline/provider';
import { clock } from '@/lib/time';
import { Button } from './components';
import { colors, font, radius, space } from './theme';

/**
 * The Online / Offline pill: how many changes are waiting, and whether any failed. Tap it for the
 * sync list (see SyncSheet).
 */
export function SyncBadge() {
  const { t } = useTranslation();
  const { state } = useOffline();
  const [open, setOpen] = useState(false);

  const tone = state.failed > 0 ? 'bad' : !state.online ? 'offline' : state.pending > 0 || state.syncing ? 'busy' : 'ok';
  const label = state.syncing
    ? t('offline.syncing')
    : state.failed > 0
      ? t('offline.failedCount', { count: state.failed })
      : !state.online
        ? state.pending > 0
          ? `${t('offline.offline')} · ${t('offline.waiting', { count: state.pending })}`
          : t('offline.offline')
        : state.pending > 0
          ? t('offline.waiting', { count: state.pending })
          : t('offline.online');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('offline.title')}: ${label}`}
        style={({ pressed }) => [styles.pill, pillTones[tone].box, pressed && styles.pressed]}
      >
        <View style={[styles.dot, { backgroundColor: pillTones[tone].dot }]} />
        <Text style={[styles.pillText, { color: pillTones[tone].text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <SyncSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const pillTones = {
  ok: { box: { backgroundColor: colors.successBg }, dot: colors.success, text: colors.success },
  busy: { box: { backgroundColor: colors.infoBg }, dot: colors.info, text: colors.info },
  offline: { box: { backgroundColor: colors.warningBg }, dot: colors.warning, text: colors.warning },
  bad: { box: { backgroundColor: '#fee2e2' }, dot: colors.destructive, text: colors.destructive },
} as const;

/** "Offline. Showing what was saved at 14:05." line for screens showing saved data. */
export function StaleBanner({ savedAt }: { savedAt: number | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{savedAt ? t('offline.staleBanner', { time: clock(new Date(savedAt)) }) : t('offline.staleBannerNoTime')}</Text>
    </View>
  );
}

/** Sync status, "Sync now", and the changes waiting or failed (retry / discard). */
export function SyncSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state, engine, data, syncNow } = useOffline();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof data.savedSummary>> | null>(null);

  // Table names for the list, from the saved table list.
  useEffect(() => {
    if (!visible) return;
    void data.cachedTables().then((tables) => setNames(new Map(tables.map((x) => [x.id, x.table_name]))));
    void data.savedSummary().then(setSaved);
  }, [visible, data, state.commands.length, state.lastSyncedAt]);

  async function sync() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }

  function confirmDiscard(id: string) {
    Alert.alert(t('offline.discardConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('offline.discard'), style: 'destructive', onPress: () => void engine.discard(id) },
    ]);
  }

  const failed = state.commands.filter((c) => c.status === 'failed');
  const pending = state.commands.filter((c) => c.status === 'pending');
  const row = (c: (typeof state.commands)[number]) => {
    const d = describeCommand(c);
    return (
      <View key={c.id} style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>{t(d.key, Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('customize.') ? t(v) : v])))}</Text>
          <Text style={styles.rowMeta}>
            {t('offline.tableLabel', { name: names.get(c.tableId) ?? '…' })} · {clock(new Date(c.createdAt))}
          </Text>
          {c.status === 'failed' ? <Text style={styles.rowError}>{t('offline.failedHint', { reason: c.error ?? '?' })}</Text> : null}
        </View>
        {c.status === 'failed' ? (
          <View style={styles.rowActions}>
            <Button title={t('offline.retry')} size="sm" variant="outline" onPress={() => void engine.retry(c.id)} />
            <Button title={t('offline.discard')} size="sm" variant="ghost" onPress={() => confirmDiscard(c.id)} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('offline.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('offline.title')}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('offline.close')}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <Text style={[styles.status, { color: state.online ? colors.success : colors.warning }]}>
            {state.online ? t('offline.statusOnline') : t('offline.statusOffline')}
          </Text>
          <Text style={styles.rowMeta}>
            {state.lastSyncedAt ? t('offline.lastSynced', { time: clock(new Date(state.lastSyncedAt)) }) : t('offline.neverSynced')}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {failed.length > 0 ? (
              <>
                <Text style={styles.section}>{t('offline.failedTitle')}</Text>
                {failed.map(row)}
              </>
            ) : null}
            {pending.length > 0 ? (
              <>
                <Text style={styles.section}>{t('offline.pendingTitle')}</Text>
                {pending.map(row)}
              </>
            ) : null}
            {failed.length === 0 && pending.length === 0 ? <Text style={styles.rowMeta}>{t('offline.nothing')}</Text> : null}
            <Text style={[styles.rowMeta, styles.note]}>{t('offline.onlyOnline')}</Text>

            <Text style={styles.section}>{t('offline.savedTitle')}</Text>
            <Text style={[styles.rowMeta, storeInfo.kind === 'memory' && styles.rowError]}>
              {storeInfo.kind === 'sqlite' ? t('offline.storageSqlite') : t('offline.storageMemory', { error: storeInfo.error ?? '?' })}
            </Text>
            <Text style={styles.rowMeta}>
              {saved && saved.tables > 0
                ? t('offline.savedTables', { count: saved.tables, time: saved.tablesAt ? clock(new Date(saved.tablesAt)) : '' })
                : `${t('tables.title')}: ${t('offline.savedNone')}`}
            </Text>
            <Text style={styles.rowMeta}>
              {saved && saved.menuItems > 0
                ? t('offline.savedMenu', { count: saved.menuItems, time: saved.menuAt ? clock(new Date(saved.menuAt)) : '' })
                : `${t('offline.menuLabel')}: ${t('offline.savedNone')}`}
            </Text>
            <Text style={styles.rowMeta}>{t('offline.savedHint')}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <Button title={t('offline.syncNow')} loading={syncing || state.syncing} onPress={() => void sync()} style={styles.flex} />
            {failed.length > 1 ? <Button title={t('offline.retryAll')} variant="outline" onPress={() => void engine.retryAll()} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, maxWidth: 190 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  banner: { backgroundColor: colors.warningBg, paddingHorizontal: space.md, paddingVertical: 6 },
  bannerText: { fontSize: 12, color: colors.warning, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.sm, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  close: { fontSize: 18, color: colors.mutedForeground, padding: 4 },
  status: { fontSize: font.body, lineHeight: font.lineHeight },
  list: { flexGrow: 0 },
  listContent: { gap: space.sm, paddingVertical: space.sm },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, marginTop: space.sm, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  rowTitle: { fontSize: font.body, color: colors.foreground, lineHeight: font.lineHeight },
  rowMeta: { fontSize: 12, color: colors.mutedForeground, lineHeight: 18 },
  rowError: { fontSize: 12, color: colors.destructive, marginTop: 2, lineHeight: 18 },
  rowActions: { gap: 4, alignItems: 'flex-end' },
  note: { marginTop: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
