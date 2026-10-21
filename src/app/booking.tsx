import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bookingBody, bookingQuery, emptyBooking, isExpense, summaryNumbers, validateBooking, type AccountRow, type AccountType, type BookingForm, type BookingRow, type BookingSummary } from '@/lib/accounting';
import { fetchAllPages } from '@/lib/catalog';
import { rangeFor, type DateRange } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { DateRangeBar } from '@/ui/date-range-bar';
import { NumberField } from '@/ui/form-fields';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

const PAGE = 30;
type Loaded = { data: BookingRow[]; summary: BookingSummary | null };

/** Bookings like the kh-pos web page: revenue and expense entries for the branch, with totals for the period. */
export default function BookingScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const writer = useRecordWriter();
  const { currency } = useBranch();
  const [range, setRange] = useState<DateRange | null>(() => rangeFor('month'));
  const [type, setType] = useState<AccountType | ''>('');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [adding, setAdding] = useState<BookingForm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(
    async (offset: number) => {
      const qs = bookingQuery({ limit: PAGE, offset, range, type: type || undefined });
      try {
        const r = await data.cachedRead('bookings', qs, async () => (await api.call<{ result?: Loaded }>('GET', `/api/accounting/booking?${qs}`)).result ?? { data: [], summary: null });
        setRows((prev) => (offset === 0 ? r.data.data : [...prev, ...r.data.data]));
        if (offset === 0) setSummary(r.data.summary);
        setDone(r.data.data.length < PAGE);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      } catch (e) {
        setError(e);
      }
    },
    [data, api, range, type],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await load(0);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  useEffect(() => {
    data.cachedRead('chart-of-accounts-ref', 'all', () => fetchAllPages<AccountRow>(async (o, l) => (await api.call<{ result: { data: AccountRow[]; total: number } }>('GET', `/api/accounting/chart-of-account?limit=${l}&offset=${o}`)).result)).then((r) => setAccounts(r.data), () => undefined);
  }, [data, api]);

  function save() {
    const f = adding!;
    const bad = validateBooking(f);
    setProblem(bad);
    if (bad) return;
    void (async () => {
      setBusy(true);
      try {
        // sent at once, or kept on the phone and sent once when kh-pos can be reached (kh-pos can answer "no" inside a 200)
        const how = await writer({ entity: 'booking', op: 'create', recordId: `new:${Date.now()}`, method: 'POST', path: '/api/accounting/booking', body: bookingBody(f), mustBeTrue: 'success', once: true, label: f.bookingName.trim() || t('more.booking') });
        if (how === 'queued') Alert.alert(t('offline.savedOffline'));
        setAdding(null);
        setVersion((v) => v + 1);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  function remove(b: BookingRow) {
    Alert.alert(t('admin.deleteConfirm', { name: b.description }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const how = await writer({ entity: 'booking', op: 'delete', recordId: b.id, method: 'DELETE', path: '/api/accounting/booking', body: { id: b.id }, label: b.description });
              if (how === 'queued') Alert.alert(t('offline.savedOffline'));
              setVersion((v) => v + 1);
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          })(),
      },
    ]);
  }

  const sum = summaryNumbers(summary);
  const money = (v: number) => formatMoney(v, currency);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.booking')} right={can(user, 'accounting', 'create') ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => { setProblem(null); setAdding(emptyBooking()); }} /> : undefined} />
      <DateRangeBar initial="month" onChange={(r) => setRange(r)} />
      <View style={styles.chips}>
        <Chip label={t('orders.all')} selected={type === ''} onPress={() => setType('')} />
        <Chip label={t('accounting.type_revenue')} selected={type === 'revenue'} onPress={() => setType('revenue')} />
        <Chip label={t('accounting.type_expense')} selected={type === 'expense'} onPress={() => setType('expense')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}

      {adding ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Card style={styles.form}>
            <Input value={adding.bookingName} onChangeText={(v) => setAdding({ ...adding, bookingName: v })} placeholder={t('accounting.bookingName')} accessibilityLabel={t('accounting.bookingName')} />
            <View style={styles.chips}>
              {accounts.map((a) => (
                <Chip key={a.id} label={`${a.accountName} · ${t(`accounting.type_${a.accountType}`)}`} selected={adding.accountId === a.id} onPress={() => setAdding({ ...adding, accountId: a.id })} />
              ))}
            </View>
            <NumberField label={t('accounting.amount')} value={adding.amount} decimal onChange={(v) => setAdding({ ...adding, amount: v })} />
            {problem ? <Text style={styles.error}>{t(`accounting.error_${problem}`)}</Text> : null}
            <View style={styles.row}>
              <Button title={t('common.cancel')} variant="outline" onPress={() => setAdding(null)} style={styles.flex} />
              <Button title={t('customize.save')} loading={busy} onPress={save} style={styles.flex} />
            </View>
          </Card>
        </KeyboardAvoidingView>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : error && rows.length === 0 ? (
        <ErrorState error={error} onRetry={() => setVersion((v) => v + 1)} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (!done) void load(rows.length);
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>{t('accounting.type_revenue')}</Text>
                <Text style={[styles.value, { color: colors.success }]}>{money(sum.revenue)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t('accounting.type_expense')}</Text>
                <Text style={[styles.value, { color: colors.destructive }]}>{money(sum.expense)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.heading}>{t('accounting.net')}</Text>
                <Text style={styles.heading}>{money(sum.net)}</Text>
              </View>
            </Card>
          }
          ListEmptyComponent={<EmptyState title={t('accounting.empty')} />}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading} numberOfLines={2}>
                  {item.description}
                </Text>
                <Text style={[styles.value, { color: isExpense(item) ? colors.destructive : colors.success }]}>{money(item.amount)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.muted}>{[item.account?.accountName, item.createdAt?.slice(0, 16)].filter(Boolean).join(' · ')}</Text>
                {item.account?.accountType ? <Badge tone={item.account.accountType === 'revenue' ? 'success' : 'warning'} text={t(`accounting.type_${item.account.accountType}`)} /> : null}
              </View>
              {can(user, 'accounting', 'delete') ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(item)} /> : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: space.md },
  form: { margin: space.md, marginBottom: 0, padding: space.md, gap: space.sm, borderRadius: radius.lg },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.body, fontWeight: '700' },
  muted: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  error: { fontSize: font.small, color: colors.destructive },
});
