import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HallRow } from '@/lib/cinema';
import { fetchAllPages } from '@/lib/catalog';
import { dayText } from '@/lib/dates';
import { emptyRow, manualBody, totalTickets, validateManual, type ManualProblem, type ManualRow } from '@/lib/manual-tickets';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Manual ticket upload like the kh-pos web page: for tickets sold outside the system, record how
 * many were sold per movie, hall, day and show time. kh-pos makes a finished, paid order for them.
 * It cannot be undone from here, so it is confirmed first. Needs the server.
 */
export default function ManualTicketsScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ManualRow[]>(() => [emptyRow(dayText(new Date()))]);
  const [halls, setHalls] = useState<HallRow[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [problem, setProblem] = useState<{ index: number; problem: ManualProblem } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    data.cachedRead('cinema-halls', 'all', () => fetchAllPages<HallRow>(async (o, l) => (await api.call<{ result: { data: HallRow[]; total: number } }>('GET', `/api/cinema/hall?limit=${l}&offset=${o}`)).result)).then((r) => setHalls(r.data), () => undefined);
  }, [data, api]);

  const setRow = (i: number, patch: Partial<ManualRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  function upload() {
    const bad = validateManual(rows);
    setProblem(bad);
    if (bad) return;
    Alert.alert(t('manual.confirm', { count: totalTickets(rows) }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('manual.upload'),
        onPress: () =>
          guard(async () => {
            setBusy(true);
            try {
              await api.call('POST', '/api/cinema/ticket-order/manual', manualBody(rows));
              Alert.alert(t('manual.done'));
              setRows([emptyRow(dayText(new Date()))]);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          }),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.manualTickets')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {rows.map((r, i) => (
            <Card key={i} style={styles.card}>
              <Button title={r.movieName || t('cinema.pickMovie')} variant="outline" onPress={() => setPicking(i)} />
              <View style={styles.chips}>
                {halls.map((h) => (
                  <Chip key={h.id} label={h.name} selected={r.hallId === h.id} onPress={() => setRow(i, { hallId: h.id })} />
                ))}
              </View>
              <Input value={r.day} onChangeText={(v) => setRow(i, { day: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('cinema.day')} />
              <NumberField label={t('cinema.price')} value={r.basePrice} decimal onChange={(v) => setRow(i, { basePrice: v })} />
              {r.shows.map((s, k) => (
                <View key={k} style={styles.row}>
                  <Input style={styles.flex} value={s.time} onChangeText={(v) => setRow(i, { shows: r.shows.map((x, j) => (j === k ? { ...x, time: v } : x)) })} placeholder="HH:mm" autoCapitalize="none" accessibilityLabel={t('manual.time')} />
                  <View style={styles.flex}>
                    <NumberField label={t('manual.tickets')} value={s.tickets} onChange={(v) => setRow(i, { shows: r.shows.map((x, j) => (j === k ? { ...x, tickets: v } : x)) })} />
                  </View>
                  {r.shows.length > 1 ? <Button title="✕" variant="ghost" size="sm" onPress={() => setRow(i, { shows: r.shows.filter((_, j) => j !== k) })} /> : null}
                </View>
              ))}
              <Button title={`+ ${t('manual.addShow')}`} variant="outline" size="sm" onPress={() => setRow(i, { shows: [...r.shows, { time: '', tickets: 0 }] })} />
              {problem && problem.index === i ? <Text style={styles.error}>{t(`manual.error_${problem.problem}`)}</Text> : null}
              {rows.length > 1 ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => setRows((rs) => rs.filter((_, k) => k !== i))} /> : null}
            </Card>
          ))}
          {problem && problem.index < 0 ? <Text style={styles.error}>{t('manual.error_rows')}</Text> : null}
          <Button title={`+ ${t('manual.addMovie')}`} variant="outline" onPress={() => setRows((rs) => [...rs, emptyRow(rs.at(-1)?.day ?? dayText(new Date()))])} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title={`${t('manual.upload')} (${totalTickets(rows)})`} loading={busy} onPress={upload} />
      </View>
      {picking !== null ? (
        <VariantPicker
          api={api}
          onClose={() => setPicking(null)}
          onPick={(v) => {
            setRow(picking, { movieId: v.variantId, movieName: v.name, basePrice: rows[picking]?.basePrice || v.price });
            setPicking(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  error: { fontSize: font.small, color: colors.destructive },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
