import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { admitBody, canAdmit, filmName, lookupQuery, seatLabel, statusTone, type ReservationRow } from '@/lib/tickets';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

/** Digital tickets like the kh-pos web page: find a customer's ticket by its code or their phone number, then admit them. Needs the server. */
export default function DigitalTicketScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const guard = useOnlineOnly();
  const { currency } = useBranch();
  const [kind, setKind] = useState<'code' | 'phone'>('code');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ReservationRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  function search() {
    const qs = lookupQuery(kind, text);
    if (!qs) return;
    guard(async () => {
      setBusy(true);
      try {
        const r = await api.call<{ result?: ReservationRow[] }>('GET', `/api/cinema/reservation/code?${qs}`);
        setRows(r.result ?? []);
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function admit(r: ReservationRow) {
    guard(async () => {
      try {
        const res = await api.call<{ success?: boolean; error?: string }>('PUT', `/api/cinema/reservation/${encodeURIComponent(r.showtimeId)}`, admitBody(r));
        if (res.success === false) throw new Error(res.error || t('errors.server'));
        Alert.alert(t('tickets.admitted', { seat: seatLabel(r) }));
        search();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.digitalTicket')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          <Chip label={t('digital.byCode')} selected={kind === 'code'} onPress={() => setKind('code')} />
          <Chip label={t('digital.byPhone')} selected={kind === 'phone'} onPress={() => setKind('phone')} />
        </View>
        <Input value={text} onChangeText={setText} placeholder={t(kind === 'code' ? 'digital.codeHint' : 'digital.phoneHint')} autoCapitalize="none" keyboardType={kind === 'phone' ? 'phone-pad' : 'default'} returnKeyType="search" onSubmitEditing={search} accessibilityLabel={t('digital.search')} />
        <Button title={t('digital.search')} loading={busy} onPress={search} />
        {rows && rows.length === 0 ? <Text style={styles.muted}>{t('digital.none')}</Text> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.heading}>{filmName(r)}</Text>
              <Badge tone={statusTone(r.status)} text={t(`tickets.status_${r.status}`)} />
            </View>
            <Text style={styles.seat}>
              {t('tickets.seat')} {seatLabel(r)}
              {r.showtime?.hall?.name ? ` · ${r.showtime.hall.name}` : ''}
              {r.showtime?.startTime ? ` · ${r.showtime.startTime.slice(0, 16)}` : ''}
            </Text>
            <Text style={styles.muted}>{[r.code, formatMoney(r.price, currency)].filter(Boolean).join(' · ')}</Text>
            {can(user, 'digital', 'update') && canAdmit(r) ? <Button title={t('tickets.admit')} size="sm" onPress={() => admit(r)} /> : null}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, gap: space.sm },
  chips: { flexDirection: 'row', gap: 6 },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  seat: { fontSize: font.body, fontWeight: '700', color: colors.primary },
  muted: { fontSize: font.small, color: colors.mutedForeground },
});
