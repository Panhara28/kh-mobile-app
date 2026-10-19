import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dayText } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { emptyPoForm, formFromDetail, orderedBy, progressPercent, receivedSummary, rowActions, statusBody, statusTone, type PoDetail } from '@/lib/purchase';
import { useSession } from '@/lib/session';
import { Badge, Button, Card } from '@/ui/components';
import { PoFormScreen } from '@/ui/purchase/po-form';
import { ReceiveSheet } from '@/ui/purchase/receive-sheet';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * One purchase order like the web: "new" opens the create form, `edit=1` the edit form, otherwise the
 * details (progress, order and supplier information, notes, items with what was received, additional
 * costs and totals) with Approve, Edit, Create Receive and Delete. Everything that changes data needs the server.
 */
export default function PurchaseOrderScreen() {
  const { t } = useTranslation();
  const { id, edit, receive } = useLocalSearchParams<{ id: string; edit?: string; receive?: string }>();
  const { api, user } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const warehouseId = user?.currentWarehouseId ?? '';

  const [detail, setDetail] = useState<PoDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const creating = id === 'new';
  const opened = useRef(false);

  // "Create Receive" in the list opens the receive sheet as soon as the order is loaded
  useEffect(() => {
    if (detail && receive === '1' && !opened.current && detail.status === 'approved') {
      opened.current = true;
      setReceiving(true);
    }
  }, [detail, receive]);

  const load = useCallback(async () => {
    if (creating) return;
    try {
      const r = await data.cachedRead('po', id, async () => (await api.call<{ result: PoDetail }>('GET', `/api/purchase-order/detail/${encodeURIComponent(id)}`)).result);
      setDetail(r.data);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, id, creating]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (creating) {
    return <PoFormScreen api={api} warehouseId={warehouseId} initial={emptyPoForm(dayText(new Date()))} onSaved={() => router.back()} onCancel={() => router.back()} />;
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('more.purchaseOrders')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  if (edit === '1') {
    return <PoFormScreen api={api} warehouseId={warehouseId} initial={formFromDetail(detail)} onSaved={() => router.back()} onCancel={() => router.back()} />;
  }

  const d = detail;
  const money = (v: number | string | null | undefined) => formatMoney(v ?? 0, 'USD');
  const actions = rowActions(d.status);
  const sum = receivedSummary(d);
  const pct = progressPercent(d.received, d.totalQty);

  function approve() {
    guard(async () => {
      setBusy(true);
      try {
        await api.call('PUT', '/api/purchase-order', statusBody(d, 'approved'));
        Alert.alert(t('po.statusUpdated'));
        await load();
      } catch (e) {
        Alert.alert(t('po.statusFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove() {
    Alert.alert(t('po.deleteTitle'), t('po.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/purchase-order', { id: d.id });
              Alert.alert(t('po.deleted'));
              router.back();
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          }),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('po.details')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.big}>{d.poIncrement}</Text>
            <Badge tone={statusTone(d.status)} text={t(`po.status_${d.status}`, { defaultValue: d.status })} />
          </View>
          <Text style={styles.muted}>
            {t('po.progress')}: {d.received ?? 0} / {d.totalQty ?? 0}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('po.orderInfo')}</Text>
          <Line label={t('po.date')} value={d.createdAt ? d.createdAt.slice(0, 10) : ''} />
          <Line label={t('po.expectedDate')} value={d.expectedAt ? d.expectedAt.slice(0, 10) : 'N/A'} />
          <Line label={t('po.orderedBy')} value={orderedBy(d, user?.id)} />
          <Line label={t('po.store')} value={d.warehouse?.name ?? ''} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('po.supplierDetails')}</Text>
          <Text style={styles.heading}>{d.supplier?.name}</Text>
          {d.supplier?.contactName ? <Line label={t('suppliers.contactName')} value={d.supplier.contactName} /> : null}
          {d.supplier?.contactPhone ? <Line label={t('suppliers.contactPhone')} value={d.supplier.contactPhone} /> : null}
          {d.supplier?.contactEmail ? <Line label={t('suppliers.contactEmail')} value={d.supplier.contactEmail} /> : null}
          {d.supplier?.address ? <Line label={t('suppliers.address')} value={d.supplier.address} /> : null}
        </Card>

        {d.note ? (
          <Card style={styles.card}>
            <Text style={styles.section}>{t('po.notes')}</Text>
            <Text style={styles.body}>{d.note}</Text>
          </Card>
        ) : null}

        {d.items.map((i) => (
          <Card key={i.id} style={styles.card}>
            <View style={styles.row}>
              {i.image ? <Image source={{ uri: i.image }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]} />}
              <View style={styles.flex}>
                <Text style={styles.heading} numberOfLines={2}>{i.name}</Text>
                <Text style={styles.muted}>{i.sku}</Text>
              </View>
              <Text style={styles.qty}>
                <Text style={{ color: colors.success }}>{i.receivedQty || 0}</Text>/{i.qty || 0}
              </Text>
            </View>
            <Line label={t('po.cost')} value={money(i.purchaseCost)} />
            <Line label={t('po.amount')} value={`${money(Number(i.receivedQty) * Number(i.purchaseCost))} / ${money(i.amount)}`} />
          </Card>
        ))}

        {d.additionalCosts.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.section}>{t('po.extraCosts')}</Text>
            {d.additionalCosts.map((c) => (
              <Line key={c.id} label={c.name ?? ''} value={money(c.cost)} />
            ))}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Line label={t('po.orderTotal')} value={money(d.total)} bold />
          <Line label={t('po.totalReceived')} value={money(sum.received)} bold color={colors.success} />
          {sum.remaining > 0 ? <Line label={t('po.remaining')} value={money(sum.remaining)} color={colors.warning} /> : null}
        </Card>

        {d.status === 'draft' && can(user, 'purchase-order', 'update') ? <Button title={t('po.approveOrder')} loading={busy} onPress={approve} /> : null}
        {actions.includes('receive') && can(user, 'purchase-order', 'update') ? <Button title={t('po.createReceive')} onPress={() => setReceiving(true)} /> : null}
        {actions.includes('edit') && can(user, 'purchase-order', 'update') ? <Button title={t('admin.edit')} variant="outline" onPress={() => router.push({ pathname: '/purchase-order/[id]', params: { id: d.id, edit: '1' } })} /> : null}
        {actions.includes('delete') && can(user, 'purchase-order', 'delete') ? <Button title={t('admin.delete')} variant="outline" onPress={remove} /> : null}
      </ScrollView>
      {receiving ? (
        <ReceiveSheet
          api={api}
          warehouseId={d.warehouseId || warehouseId}
          detail={d}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            void load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Line({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  big: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.small, color: colors.foreground },
  label: { fontSize: font.small, color: colors.mutedForeground, flexShrink: 1 },
  value: { fontSize: font.small, color: colors.foreground, textAlign: 'right', flexShrink: 1 },
  bold: { fontWeight: '700', fontSize: font.body },
  qty: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.info },
  img: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
});
