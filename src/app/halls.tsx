import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { BRUSHES, DEFAULT_FEATURES, designOf, emptyHall, filled, HALL_STATUSES, hallBody, keyOf, MAX_COLUMNS, MAX_ROWS, paint, resize, seatCount, usableCount, validateHall, type Brush, type HallDesign, type HallInfo } from '@/lib/hall-design';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Cinema halls like the kh-pos "Hall seat" page: size the room and paint each seat (standard, VIP,
 * couple pair, wheelchair, blocked). Editing keeps every seat's id, so tickets already sold still
 * point at their seats; the hall's features and zones are kept as they were. Saving needs the server.
 */
export default function HallsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [halls, setHalls] = useState<HallInfo[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ info: HallInfo | null; design: HallDesign } | null>(null);
  const [brush, setBrush] = useState<Brush>('standard');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('cinema-halls-full', 'all', () => fetchAllPages<HallInfo>(async (o, l) => (await api.call<{ result: { data: HallInfo[]; total: number } }>('GET', `/api/cinema/hall?limit=${l}&offset=${o}`)).result));
      setHalls(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, version]);

  const newId = () => Crypto.randomUUID();
  const d = editing?.design;
  const set = (patch: Partial<HallDesign>) => setEditing((e) => (e ? { ...e, design: { ...e.design, ...patch } } : e));
  const setSize = (rows: number, columns: number) => setEditing((e) => (e ? { ...e, design: { ...e.design, rows, columns, seats: resize(e.design.seats, rows, columns) } } : e));

  function startNew() {
    setProblem(null);
    const base = emptyHall();
    setEditing({ info: null, design: { ...base, seats: filled(base.rows, base.columns, newId) } });
  }

  function save() {
    const e = editing!;
    const bad = validateHall(e.design);
    setProblem(bad);
    if (bad) return;
    const body = hallBody(e.design, e.info ? e.info.features : DEFAULT_FEATURES, e.info?.parts ?? [], e.info?.id);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.info ? 'PUT' : 'POST', '/api/cinema/hall', body);
        setEditing(null);
        setVersion((v) => v + 1);
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(h: HallInfo) {
    Alert.alert(t('admin.deleteConfirm', { name: h.name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/cinema/hall', { id: h.id });
              setEditing(null);
              setVersion((v) => v + 1);
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const cell = d ? Math.max(24, Math.min(40, Math.floor((width - 2 * space.md - 28) / Math.max(1, d.columns)))) : 32;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.halls')} right={can(user, 'hall-seat', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={startNew} /> : undefined} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {halls === null ? (
        error ? <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} /> : <LoadingState />
      ) : (
        <FlatList
          data={halls}
          keyExtractor={(h) => h.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('halls.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading}>
                  {item.number}. {item.name}
                </Text>
                <Badge tone={item.status === 'active' ? 'success' : item.status === 'maintenance' ? 'warning' : 'outline'} text={t(`halls.status_${item.status}`)} />
              </View>
              <Text style={styles.muted}>{t('halls.summary', { rows: item.rows, columns: item.columns, seats: item.seats.length })}</Text>
              {can(user, 'hall-seat', 'update') ? (
                <Button
                  title={t('admin.edit')}
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setProblem(null);
                    setEditing({ info: item, design: designOf(item) });
                  }}
                />
              ) : null}
            </Card>
          )}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {d ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Input value={d.name} onChangeText={(v) => set({ name: v })} placeholder={t('halls.name')} accessibilityLabel={t('halls.name')} />
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <NumberField label={t('halls.number')} value={d.number} onChange={(v) => set({ number: v })} />
                  </View>
                  <View style={styles.flex}>
                    <NumberField label={t('halls.rows', { max: MAX_ROWS })} value={d.rows} onChange={(v) => setSize(Math.min(Math.max(0, v), MAX_ROWS), d.columns)} />
                  </View>
                  <View style={styles.flex}>
                    <NumberField label={t('halls.columns', { max: MAX_COLUMNS })} value={d.columns} onChange={(v) => setSize(d.rows, Math.min(Math.max(0, v), MAX_COLUMNS))} />
                  </View>
                </View>
                <View style={styles.chips}>
                  {HALL_STATUSES.map((s) => (
                    <Chip key={s} label={t(`halls.status_${s}`)} selected={d.status === s} onPress={() => set({ status: s })} />
                  ))}
                </View>

                <Text style={styles.section}>{t('halls.brush')}</Text>
                <View style={styles.chips}>
                  {BRUSHES.map((b) => (
                    <Chip key={b} label={t(`halls.brush_${b}`)} selected={brush === b} onPress={() => setBrush(b)} />
                  ))}
                </View>
                <Button title={t('halls.fillAll')} variant="outline" size="sm" onPress={() => set({ seats: filled(d.rows, d.columns, newId) })} />

                <View style={styles.screenBar}>
                  <Text style={styles.muted}>{t('sale.screen')}</Text>
                </View>
                <ScrollView horizontal contentContainerStyle={styles.grid}>
                  <View>
                    {Array.from({ length: d.rows }, (_, r) => (
                      <View key={r} style={styles.seatRow}>
                        <Text style={styles.rowLabel}>{String.fromCharCode(65 + r)}</Text>
                        {Array.from({ length: d.columns }, (_, c) => {
                          const seat = d.seats[keyOf(r + 1, c + 1)];
                          return (
                            <Pressable
                              key={c}
                              onPress={() => set({ seats: paint(d.seats, d.rows, d.columns, r + 1, c + 1, brush, newId) })}
                              accessibilityRole="button"
                              style={[styles.seat, { width: cell, height: cell }, !seat && styles.seatEmpty, seat?.type === 'vip' && styles.vip, seat?.type === 'couple' && styles.couple, seat?.type === 'wheelchair' && styles.wheelchair, seat?.type === 'blocked' && styles.blocked]}
                            >
                              <Text style={styles.seatText}>{seat ? (seat.type === 'standard' ? c + 1 : seat.type[0]!.toUpperCase()) : ''}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={styles.muted}>{t('halls.counts', { seats: seatCount(d.seats), usable: usableCount(d.seats) })}</Text>
                {problem ? <Text style={styles.error}>{t(`halls.error_${problem}`)}</Text> : null}
                {editing?.info && can(user, 'hall-seat', 'delete') ? <Button title={t('admin.delete')} variant="outline" onPress={() => remove(editing.info!)} /> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  error: { fontSize: font.small, color: colors.destructive },
  form: { padding: space.md, gap: space.sm },
  screenBar: { alignSelf: 'stretch', height: 22, borderRadius: radius.md, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingVertical: space.sm },
  seatRow: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { width: 20, fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textAlign: 'center' },
  seat: { margin: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  seatEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', opacity: 0.5 },
  vip: { borderColor: colors.warning },
  couple: { borderColor: colors.info },
  wheelchair: { borderStyle: 'dashed', borderColor: colors.primary },
  blocked: { backgroundColor: colors.muted, opacity: 0.5 },
  seatText: { fontSize: 11, color: colors.foreground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
