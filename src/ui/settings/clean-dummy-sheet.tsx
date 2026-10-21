import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { applyCleanEnd, applyCleanEvent, CLEAN_IDLE, type CleanState } from '@/lib/clean-dummy';
import { useSession } from '@/lib/session';
import { Badge, Button } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * "Database Purge Pipeline" of the web: runs the clean-up at kh-pos and shows its progress and messages as they
 * arrive. It starts when the sheet opens (the caller asks first) and can only be closed once it has finished.
 */
export function CleanDummySheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<CleanState>(CLEAN_IDLE);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let current: CleanState = { ...CLEAN_IDLE, status: 'running' };
    setState(current);
    void api
      .cleanDummy((e) => {
        current = applyCleanEvent(current, e);
        setState(current);
      })
      .catch((e) => {
        current = { ...current, status: 'failed', message: e instanceof Error ? e.message : '', logs: [...current.logs, e instanceof Error ? e.message : ''].filter(Boolean) };
      })
      .finally(() => {
        current = applyCleanEnd(current);
        setState(current);
      });
  }, [api]);

  const running = state.status === 'running';
  const tone = state.status === 'completed' ? 'success' : state.status === 'failed' ? 'destructive' : 'info';

  return (
    <Modal visible animationType="slide" onRequestClose={() => !running && onClose()}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('sg.purgeTitle')}</Text>
          <Badge tone={tone} text={t(`sg.purge_${state.status}`)} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.hint}>{t('sg.purgeHint')}</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${state.progress}%` }]} />
          </View>
          <Text style={styles.percent}>{state.progress}%</Text>
          <View style={styles.log}>
            {state.logs.map((l, i) => (
              <Text key={i} style={styles.line}>
                {l}
              </Text>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} disabled={running} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, padding: space.lg, backgroundColor: colors.card },
  title: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
  body: { padding: space.lg, gap: space.md },
  hint: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.muted, overflow: 'hidden' },
  bar: { height: 8, backgroundColor: colors.primary },
  percent: { alignSelf: 'flex-end', fontSize: font.small, fontWeight: '700', color: colors.foreground },
  log: { gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  line: { fontSize: font.small, color: colors.foreground, fontFamily: 'monospace' },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
