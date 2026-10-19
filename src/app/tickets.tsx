import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayText, parseDay } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { admitBody, canAdmit, countByStatus, filmName, matchCode, RESERVATION_STATUSES, reservationQuery, seatLabel, statusTone, type ReservationRow, type ReservationStatus } from '@/lib/tickets';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 100;

/** Cinema tickets like the kh-pos web page: reservations of a day by status, and admitting guests at the door (by button or by scanning the ticket's code). */
export default function TicketsScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { currency } = useBranch();
  const [permission, requestPermission] = useCameraPermissions();

  const [day, setDay] = useState(() => dayText(new Date()));
  const [status, setStatus] = useState<ReservationStatus | ''>('');
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [scanning, setScanning] = useState(false);
  const [version, setVersion] = useState(0);
  const lastScan = useRef({ code: '', at: 0 });

  const valid = !!parseDay(day);

  const load = useCallback(async () => {
    if (!valid) return;
    const qs = reservationQuery({ date: day, status: status || undefined, limit: PAGE, offset: 0 });
    try {
      const r = await data.cachedRead('reservations', qs, async () => (await api.call<{ result?: { data: ReservationRow[] } }>('GET', `/api/cinema/reservation?${qs}`)).result?.data ?? []);
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, day, status, valid]);

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

  /** Admits a ticket; kh-pos checks it is still confirmed. */
  function admit(r: ReservationRow) {
    guard(async () => {
      try {
        const res = await api.call<{ success?: boolean; error?: string }>('PUT', `/api/cinema/reservation/${encodeURIComponent(r.showtimeId)}`, admitBody(r));
        if (res.success === false) throw new Error(res.error || t('errors.server'));
        setVersion((v) => v + 1);
        Alert.alert(t('tickets.admitted', { seat: seatLabel(r) }));
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      }
    });
  }

  async function onCode(code: string) {
    const now = Date.now();
    if (code === lastScan.current.code && now - lastScan.current.at < 3000) return;
    lastScan.current = { code, at: now };
    let match = matchCode(rows, code);
    if (!match) {
      try {
        const qs = reservationQuery({ status: 'confirmed', limit: 500, offset: 0 });
        match = matchCode((await api.call<{ result?: { data: ReservationRow[] } }>('GET', `/api/cinema/reservation?${qs}`)).result?.data ?? [], code);
      } catch {
        match = null;
      }
    }
    if (!match) {
      Alert.alert(t('tickets.notFound'));
      return;
    }
    if (!canAdmit(match)) {
      Alert.alert(t('tickets.cannotAdmit', { status: t(`tickets.status_${match.status}`) }));
      return;
    }
    setScanning(false);
    admit(match);
  }

  async function openScanner() {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(t('retail.cameraDenied'));
        return;
      }
    }
    setScanning(true);
  }

  const counts = countByStatus(rows);
  const mayAdmit = can(user, 'ticket', 'update');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.tickets')} right={mayAdmit ? <Button title={t('retail.scan')} size="sm" onPress={() => void openScanner()} /> : undefined} />
      <View style={styles.bar}>
        <Input value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('cinema.day')} />
        <View style={styles.chips}>
          <Chip label={t('orders.all')} selected={status === ''} onPress={() => setStatus('')} />
          {RESERVATION_STATUSES.map((s) => (
            <Chip key={s} label={`${t(`tickets.status_${s}`)}${status === '' ? ` ${counts[s]}` : ''}`} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
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
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('tickets.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading} numberOfLines={2}>
                  {filmName(item)}
                </Text>
                <Badge tone={statusTone(item.status)} text={t(`tickets.status_${item.status}`)} />
              </View>
              <Text style={styles.seat}>
                {t('tickets.seat')} {seatLabel(item)}
                {item.showtime?.hall?.name ? ` · ${item.showtime.hall.name}` : ''}
                {item.showtime?.startTime ? ` · ${item.showtime.startTime.slice(11, 16)}` : ''}
              </Text>
              <Text style={styles.muted}>{[item.code, formatMoney(item.price, currency)].filter(Boolean).join(' · ')}</Text>
              {mayAdmit && canAdmit(item) ? <Button title={t('tickets.admit')} size="sm" onPress={() => admit(item)} /> : null}
            </Card>
          )}
        />
      )}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanner}>
          <CameraView style={styles.flex} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }} onBarcodeScanned={(r) => void onCode(r.data)} />
          <View style={[styles.scanFooter, { paddingBottom: insets.bottom + space.md }]}>
            <Text style={styles.scanText}>{t('tickets.scanHint')}</Text>
            <Button title={t('retail.done')} onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  bar: { gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  seat: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  scanner: { flex: 1, backgroundColor: '#000' },
  scanFooter: { gap: space.sm, padding: space.md, backgroundColor: colors.card },
  scanText: { fontSize: font.body, color: colors.foreground, textAlign: 'center' },
});
