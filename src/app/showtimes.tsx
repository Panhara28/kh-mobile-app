import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { emptyShowtime, movieName, SHOWTIME_STATUSES, seatsLabel, showtimeBody, showtimeForm, showtimeQuery, statusTone, timeSpan, validateShowtime, type HallRow, type ShowtimeForm, type ShowtimeRow, type TemplateRow } from '@/lib/cinema';
import { fetchAllPages } from '@/lib/catalog';
import { dayText, parseDay } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 50;

/** Cinema showtimes like the kh-pos web page: the day's films by hall and time, with add, edit and delete. */
export default function ShowtimesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { currency } = useBranch();

  const [day, setDay] = useState(() => dayText(new Date()));
  const [rows, setRows] = useState<ShowtimeRow[]>([]);
  const [halls, setHalls] = useState<HallRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [editing, setEditing] = useState<{ row: ShowtimeRow | null; form: ShowtimeForm } | null>(null);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const valid = !!parseDay(day);

  const load = useCallback(async () => {
    if (!valid) return;
    const qs = showtimeQuery({ day, limit: PAGE, offset: 0 });
    try {
      const r = await data.cachedRead('showtimes', qs, async () => (await api.call<{ result?: { data: ShowtimeRow[] } }>('GET', `/api/cinema/showtime?${qs}`)).result?.data ?? []);
      setRows([...r.data].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, day, valid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  useEffect(() => {
    data.cachedRead('cinema-halls', 'all', () => fetchAllPages<HallRow>(async (o, l) => (await api.call<{ result: { data: HallRow[]; total: number } }>('GET', `/api/cinema/hall?limit=${l}&offset=${o}`)).result)).then((r) => setHalls(r.data), () => undefined);
    data.cachedRead('cinema-templates', 'all', async () => (await api.call<{ result?: TemplateRow[] }>('GET', '/api/cinema/pricing-template')).result ?? []).then((r) => setTemplates(r.data), () => undefined);
  }, [data, api]);

  const shift = (by: number) => {
    const d = parseDay(day) ?? new Date();
    d.setDate(d.getDate() + by);
    setDay(dayText(d));
  };

  function save() {
    const e = editing!;
    const bad = validateShowtime(e.form);
    setProblem(bad);
    if (bad) return;
    const hall = halls.find((h) => h.id === e.form.hallId);
    if (!hall) return;
    const body = showtimeBody(e.form, hall, e.row ?? undefined);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.row ? 'PUT' : 'POST', '/api/cinema/showtime', body);
        setEditing(null);
        setVersion((v) => v + 1);
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(s: ShowtimeRow) {
    Alert.alert(t('admin.deleteConfirm', { name: movieName(s) }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/cinema/showtime', { id: s.showtimeId });
              setEditing(null);
              setVersion((v) => v + 1);
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const f = editing?.form;
  const set = <K extends keyof ShowtimeForm>(k: K, v: ShowtimeForm[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.showtimes')} right={can(user, 'showtime', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => { setProblem(null); setEditing({ row: null, form: emptyShowtime(valid ? day : dayText(new Date())) }); }} /> : undefined} />
      <View style={styles.dayBar}>
        <Button title="‹" variant="outline" size="sm" onPress={() => shift(-1)} />
        <Input style={styles.flex} value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('cinema.day')} />
        <Button title="›" variant="outline" size="sm" onPress={() => shift(1)} />
        <Button title={t('range.today')} variant="outline" size="sm" onPress={() => setDay(dayText(new Date()))} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {!valid ? (
        <EmptyState title={t('reports.pickDates')} />
      ) : loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.showtimeId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('cinema.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading} numberOfLines={2}>
                  {movieName(item)}
                </Text>
                <Badge tone={statusTone(item.status)} text={t(`cinema.status_${item.status}`)} />
              </View>
              <Text style={styles.time}>{timeSpan(item)}</Text>
              <Text style={styles.muted}>{[item.hall?.name, `${t('cinema.seats')} ${seatsLabel(item)}`, formatMoney(item.basePrice, currency)].filter(Boolean).join(' · ')}</Text>
              {can(user, 'showtime', 'update') ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setProblem(null); setEditing({ row: item, form: showtimeForm(item) }); }} /> : null}
            </Card>
          )}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {f ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{editing?.row ? t('admin.edit') : t('cinema.new')}</Text>
                <Button title={f.movieName || t('cinema.pickMovie')} variant="outline" onPress={() => setPicking(true)} />
                <Text style={styles.section}>{t('cinema.hall')}</Text>
                <View style={styles.chips}>
                  {halls
                    .filter((h) => h.status === 'active' || h.id === f.hallId)
                    .map((h) => (
                      <Chip key={h.id} label={`${h.name} (${h.totalSeats})`} selected={f.hallId === h.id} onPress={() => set('hallId', h.id)} />
                    ))}
                </View>
                <Input value={f.showDate} onChangeText={(v) => set('showDate', v)} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('cinema.day')} />
                <View style={styles.row}>
                  <Input style={styles.flex} value={f.start} onChangeText={(v) => set('start', v)} placeholder={`${t('promo.from')} HH:mm`} autoCapitalize="none" accessibilityLabel={t('promo.from')} />
                  <Input style={styles.flex} value={f.end} onChangeText={(v) => set('end', v)} placeholder={`${t('promo.to')} HH:mm`} autoCapitalize="none" accessibilityLabel={t('promo.to')} />
                </View>
                <NumberField label={t('cinema.price')} value={f.basePrice} decimal onChange={(v) => set('basePrice', v)} />
                <Text style={styles.section}>{t('cinema.statusLabel')}</Text>
                <View style={styles.chips}>
                  {SHOWTIME_STATUSES.map((s) => (
                    <Chip key={s} label={t(`cinema.status_${s}`)} selected={f.status === s} onPress={() => set('status', s)} />
                  ))}
                </View>
                {templates.length > 0 ? (
                  <>
                    <Text style={styles.section}>{t('cinema.template')}</Text>
                    <View style={styles.chips}>
                      <Chip label={t('cinema.noTemplate')} selected={f.priceTemplateId === ''} onPress={() => set('priceTemplateId', '')} />
                      {templates.map((tp) => (
                        <Chip key={tp.template_id} label={tp.template_name} selected={f.priceTemplateId === tp.template_id} onPress={() => set('priceTemplateId', tp.template_id)} />
                      ))}
                    </View>
                  </>
                ) : null}
                {problem ? <Text style={styles.error}>{t(`cinema.error_${problem}`)}</Text> : null}
                {editing?.row && can(user, 'showtime', 'delete') ? <Button title={t('admin.delete')} variant="outline" onPress={() => remove(editing.row!)} /> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
          {picking ? (
            <VariantPicker
              api={api}
              onClose={() => setPicking(false)}
              onPick={(v) => {
                setEditing((e) => (e ? { ...e, form: { ...e.form, movieId: v.variantId, movieName: v.name, basePrice: e.form.basePrice || v.price } } : e));
                setPicking(false);
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  time: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  error: { fontSize: font.small, color: colors.destructive },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
