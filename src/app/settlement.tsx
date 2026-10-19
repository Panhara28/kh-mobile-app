import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rangeFor, type DateRange } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { generateBody, isSettled, movieOf, owedTotals, settleBody, settlementQuery, SETTLE_FILTERS, type SettleFilter, type SettlementDetail, type SettlementRow } from '@/lib/settlement';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip } from '@/ui/components';
import { DateRangeBar } from '@/ui/date-range-bar';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 50;

/** Producer settlement like the kh-pos web page: generate what each movie owes, open one to see its showtimes, and mark it paid with a photo of the proof. */
export default function SettlementScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const { currency } = useBranch();
  const [filter, setFilter] = useState<SettleFilter>('open');
  const [range, setRange] = useState<DateRange | null>(() => rangeFor('month'));
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [open, setOpen] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const qs = settlementQuery({ filter, limit: PAGE, offset: 0 });
    try {
      const r = await data.cachedRead('settlements', qs, async () => (await api.call<{ result?: { data: SettlementRow[] } }>('GET', `/api/cinema/settlement?${qs}`)).result?.data ?? []);
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, filter]);

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

  /** Creates the settlements of ended showtimes in the period. It cannot be undone, so it is confirmed first. */
  function generate() {
    if (!range) return;
    const body = generateBody(range);
    Alert.alert(t('settlement.generateConfirm', { from: body.startDate, to: body.endDate }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settlement.generate'),
        onPress: () =>
          guard(async () => {
            setBusy(true);
            try {
              const r = await api.call<{ result?: { recordsProcessed?: number } }>('POST', '/api/cinema/settlement', body);
              Alert.alert(t('settlement.generated', { count: r.result?.recordsProcessed ?? 0 }));
              setVersion((v) => v + 1);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            } finally {
              setBusy(false);
            }
          }),
      },
    ]);
  }

  async function show(r: SettlementRow) {
    try {
      const res = await api.call<{ result?: SettlementDetail }>('GET', `/api/cinema/settlement/${encodeURIComponent(r.id)}`);
      setOpen(res.result ?? r);
    } catch {
      setOpen(r); // the summary is enough to show; the showtimes need the server
    }
  }

  /** Takes a photo (or picks one), uploads it, then marks the settlement paid with its link. */
  async function settle(r: SettlementRow, camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ base64: true, quality: 0.6, mediaTypes: ['images'] });
    const base64 = result.assets?.[0]?.base64;
    if (result.canceled || !base64) return;
    guard(async () => {
      setBusy(true);
      try {
        const up = await api.call<{ url?: string }>('POST', '/api/upload', { fileName: `${Crypto.randomUUID()}.jpg`, fileContent: base64 });
        const body = settleBody(r.id, up.url);
        if (!body) throw new Error(t('products.uploadFailed'));
        await api.call('PUT', '/api/cinema/settlement', body);
        setOpen(null);
        setVersion((v) => v + 1);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  const totals = owedTotals(rows);
  const money = (v: number) => formatMoney(v, currency);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.settlement')} />
      <View style={styles.bar}>
        <View style={styles.chips}>
          {SETTLE_FILTERS.map((f) => (
            <Chip key={f} label={t(`settlement.filter_${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
      </View>
      {can(user, 'settlement', 'create') ? (
        <>
          <DateRangeBar initial="month" onChange={(r) => setRange(r)} />
          <View style={styles.gen}>
            <Button title={t('settlement.generateFor')} variant="outline" loading={busy} onPress={generate} disabled={!range} />
          </View>
        </>
      ) : null}
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            rows.length > 0 ? (
              <Card style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('settlement.owed')}</Text>
                  <Text style={[styles.value, { color: colors.destructive }]}>{money(totals.open)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t('settlement.paid')}</Text>
                  <Text style={[styles.value, { color: colors.success }]}>{money(totals.paid)}</Text>
                </View>
              </Card>
            ) : null
          }
          ListEmptyComponent={<EmptyState title={t('settlement.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading} numberOfLines={2}>
                  {movieOf(item)}
                </Text>
                <Badge tone={isSettled(item) ? 'success' : 'warning'} text={t(isSettled(item) ? 'settlement.settled' : 'settlement.open')} />
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>{t('settlement.sales', { amount: money(item.totalAmount) })}</Text>
                <Text style={styles.value}>{money(item.shareAmount)}</Text>
              </View>
              <Text style={styles.muted}>{isSettled(item) ? `${t('settlement.settledAt')} ${item.settledAt?.slice(0, 16)}` : `${t('settlement.created')} ${item.createdAt?.slice(0, 10) ?? ''}`}</Text>
              <Button title={t('settlement.details')} variant="outline" size="sm" onPress={() => void show(item)} />
            </Card>
          )}
        />
      )}

      {open ? (
        <View style={styles.sheet}>
          <Card style={styles.card}>
            <Text style={styles.heading}>{movieOf(open)}</Text>
            <Text style={styles.muted}>{t('settlement.sales', { amount: money(open.totalAmount) })}</Text>
            <Text style={styles.heading}>{money(open.shareAmount)}</Text>
            {(open.showtimes ?? []).map((s) => (
              <Text key={s.showtimeId} style={styles.muted}>
                {s.showDate.slice(0, 10)} · {s.startTime.slice(11, 16)}
                {s.hall?.name ? ` · ${s.hall.name}` : ''}
              </Text>
            ))}
            {open.proofLink ? <Button title={t('settlement.viewProof')} variant="outline" size="sm" onPress={() => void Linking.openURL(open.proofLink!)} /> : null}
            {!isSettled(open) && can(user, 'settlement', 'update') ? (
              <View style={styles.row}>
                <Button title={t('settlement.proofCamera')} loading={busy} onPress={() => void settle(open, true)} style={styles.flex} />
                <Button title={t('settlement.proofLibrary')} variant="outline" loading={busy} onPress={() => void settle(open, false)} style={styles.flex} />
              </View>
            ) : null}
            <Button title={t('common.close')} variant="ghost" size="sm" onPress={() => setOpen(null)} />
          </Card>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  bar: { padding: space.md, backgroundColor: colors.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gen: { padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md, backgroundColor: colors.page, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
