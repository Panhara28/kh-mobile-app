import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import type { DateRange } from '@/lib/dates';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import type { BranchRow } from '@/lib/org';
import type { CompositeOption } from '@/lib/production';
import { activeFilterCount, chartCaption, chartItems, exportCsv, exportName, fmt, saleQuery, showOrderedAt, toggleId, type ChartValue, type GroupBy, type SaleFilters, type SaleRow } from '@/lib/sale-report';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { BarList } from '../bar-list';
import { Badge, Button, Card, Chip } from '../components';
import { CompositePicker } from '../production/composite-picker';
import { EmptyState, ErrorState, LoadingState } from '../states';
import { StaleBanner } from '../sync-status';
import { colors, font, radius, space } from '../theme';

interface Named {
  id: string;
  name: string;
}

const COLS = [
  { key: 'code', w: 110 },
  { key: 'name', w: 190 },
  { key: 'at', w: 130 },
  { key: 'qty', w: 80 },
  { key: 'supply', w: 100 },
  { key: 'total', w: 100 },
  { key: 'mod', w: 90 },
  { key: 'disc', w: 90 },
  { key: 'rev', w: 100 },
  { key: 'profit', w: 100 },
] as const;

/**
 * The web Sale Report (full: filters by branch, user, category and product, group by product or
 * time, list or chart by revenue / quantity / profit) and the Sale Breakdown page (date range and
 * group by product only). Both list the sales by category with supply price, modifier, discount,
 * revenue and profit; Export shares the rows as a CSV.
 */
export function SaleReportView({ range, full }: { range: DateRange; full: boolean }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data } = useOffline();
  const { currency, warehouseId } = useBranch();
  const isOwner = user?.role?.role === 'OWNER';
  const money = (v: number) => formatMoney(v, currency as CurrencyCode);

  const [groupBy, setGroupBy] = useState<GroupBy>('product');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([warehouseId]);
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);
  const [mode, setMode] = useState<'list' | 'chart'>('list');
  const [view, setView] = useState<ChartValue>('revenue');
  const [showFilters, setShowFilters] = useState(false);
  const [picking, setPicking] = useState(false);
  const [users, setUsers] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [branches, setBranches] = useState<Named[]>([]);
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [reloadKey, setReloadKey] = useState(0);
  // a day of sales listed by time can have thousands of rows: show them 200 at a time (Export has all)
  const [shown, setShown] = useState(200);

  const filters: SaleFilters = useMemo(
    () => ({
      startDate: range.start.slice(0, 10),
      endDate: range.end.slice(0, 10),
      warehouseIds: full ? branchIds.filter(Boolean) : [warehouseId],
      userIds: full ? userIds : [],
      categoryIds: full ? categoryIds : [],
      productId: full ? (product?.id ?? '') : '',
      groupBy: full ? groupBy : groupBy,
    }),
    [range, full, branchIds, warehouseId, userIds, categoryIds, product, groupBy],
  );
  const qs = saleQuery(filters);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(null);
    setShown(200);
    data.cachedRead('sale-report', qs, async () => (await api.call<{ result?: SaleRow[] }>('GET', `/api/report/sale-by-category?${qs}`)).result ?? []).then(
      (r) => {
        if (cancelled) return;
        setRows(r.data);
        setStaleAt(r.stale ? r.savedAt : false);
        setError(null);
      },
      (e) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [data, api, qs, reloadKey]);

  // the filter lists are read when the filters are first opened
  useEffect(() => {
    if (!showFilters || !full || users.length > 0) return;
    const get = <T,>(path: string) => fetchAllPages<T>(async (o, l) => (await api.call<{ result: { data: T[]; total: number } }>('GET', `${path}${path.includes('?') ? '&' : '?'}limit=${Math.min(l, 100)}&offset=${o}`)).result);
    get<{ id: string; fullname?: string | null; username?: string }>('/api/user').then((r) => setUsers(r.map((u) => ({ id: u.id, name: u.fullname || u.username || u.id }))), () => undefined);
    get<{ id: string; title: string }>('/api/category').then((r) => setCategories(r.map((c) => ({ id: c.id, name: c.title }))), () => undefined);
    if (isOwner) get<BranchRow>('/api/warehouse').then((r) => setBranches(r.filter((b) => b.id).map((b) => ({ id: b.id!, name: b.name }))), () => undefined);
  }, [showFilters, full, users.length, api, isOwner]);

  const clear = useCallback(() => {
    setUserIds([]);
    setCategoryIds([]);
    setBranchIds([warehouseId]);
    setProduct(null);
    setGroupBy('product');
  }, [warehouseId]);

  async function share() {
    if (!rows || rows.length === 0) {
      Alert.alert(t('reports.noExport'));
      return;
    }
    try {
      await Share.share({ title: exportName(filters.startDate, filters.endDate), message: exportCsv(rows, filters.groupBy === 'product') });
    } catch {
      // closed without sharing
    }
  }

  const active = activeFilterCount(filters, isOwner);
  const list = rows ?? [];
  const timed = showOrderedAt(list);
  const chart = chartItems(list, view);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      <Card style={styles.card}>
        <View style={styles.row}>
          <Chip label={t('reports.groupProduct')} selected={groupBy === 'product'} onPress={() => setGroupBy(groupBy === 'product' ? 'time' : 'product')} />
          {full ? <Chip label={`${t('reports.filters')}${active > 0 ? ` (${active})` : ''}`} selected={showFilters} onPress={() => setShowFilters((s) => !s)} /> : null}
        </View>
        <View style={styles.row}>
          {full ? (
            <>
              <Chip label={t('reports.list')} selected={mode === 'list'} onPress={() => setMode('list')} />
              <Chip label={t('reports.chart')} selected={mode === 'chart'} onPress={() => setMode('chart')} />
            </>
          ) : null}
          <Button title={t('reports.refresh')} variant="outline" size="sm" onPress={() => setReloadKey((k) => k + 1)} />
          <Button title={t('reports.export')} variant="outline" size="sm" disabled={list.length === 0} onPress={() => void share()} />
        </View>
        {full && mode === 'chart' ? (
          <View style={styles.row}>
            <Chip label={t('reports.revenue')} selected={view === 'revenue'} onPress={() => setView('revenue')} />
            <Chip label={t('reports.quantity')} selected={view === 'qty'} onPress={() => setView('qty')} />
            <Chip label={t('reports.profit')} selected={view === 'profit'} onPress={() => setView('profit')} />
          </View>
        ) : null}
      </Card>

      {full && showFilters ? (
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.section}>{t('reports.reportFilters')}</Text>
            {active > 0 ? <Button title={t('reports.clearFilters')} variant="ghost" size="sm" onPress={clear} /> : null}
          </View>
          {isOwner && branches.length > 0 ? (
            <>
              <Text style={styles.label}>{t('reports.branches')}</Text>
              <View style={styles.chips}>
                {branches.map((b) => (
                  <Chip key={b.id} label={b.name} selected={branchIds.includes(b.id)} onPress={() => setBranchIds((l) => (l.length === 1 && l[0] === b.id ? l : toggleId(l, b.id)))} />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.label}>{t('reports.users')}</Text>
          <View style={styles.chips}>
            {users.map((u) => (
              <Chip key={u.id} label={u.name} selected={userIds.includes(u.id)} onPress={() => setUserIds((l) => toggleId(l, u.id))} />
            ))}
          </View>
          <Text style={styles.label}>{t('reports.categories')}</Text>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} selected={categoryIds.includes(c.id)} onPress={() => setCategoryIds((l) => toggleId(l, c.id))} />
            ))}
          </View>
          <Text style={styles.label}>{t('reports.product')}</Text>
          <View style={styles.row}>
            <Button title={product?.title ?? t('reports.anyProduct')} variant="outline" size="sm" onPress={() => setPicking(true)} />
            {product ? <Button title="✕" variant="ghost" size="sm" onPress={() => setProduct(null)} /> : null}
          </View>
        </Card>
      ) : null}

      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => setReloadKey((k) => k + 1)} /> : <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState title={t('reports.noData')} />
      ) : mode === 'chart' && full ? (
        <Card style={styles.card}>
          {chart.length === 0 ? <Text style={styles.muted}>{t('reports.noData')}</Text> : <BarList rows={chart.map((c) => ({ label: c.fullName, value: c.value }))} format={(v) => (view === 'qty' ? v.toLocaleString() : money(v))} />}
          <Text style={styles.caption}>{chartCaption(chart.length, view)}</Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.section}>{t('reports.detailed')}</Text>
            <Badge tone="outline" text={t('reports.records', { count: list.length })} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={[styles.tr, styles.head]}>
                {COLS.filter((c) => c.key !== 'at' || timed).map((c) => (
                  <Text key={c.key} style={[styles.th, { width: c.w }, !['code', 'name', 'at'].includes(c.key) && styles.right]}>
                    {t(`reports.col_${c.key}`)}
                  </Text>
                ))}
              </View>
              {list.slice(0, shown).map((r, i) => (
                <View key={i} style={[styles.tr, r.type === 'total' ? styles.totalRow : r.type === 'category' ? styles.catRow : null]}>
                  <Text style={[styles.td, { width: COLS[0].w }]}>{r.productCode || '-'}</Text>
                  <Text style={[styles.td, { width: COLS[1].w }, r.type !== 'detail' && styles.bold]}>{r.name || (r.type === 'total' ? 'GRAND TOTAL' : '-')}</Text>
                  {timed ? <Text style={[styles.td, { width: COLS[2].w }]}>{r.orderedAt || '-'}</Text> : null}
                  <Text style={[styles.td, styles.right, { width: COLS[3].w }]}>{fmt(r.totalQty)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[4].w }]}>{fmt(r.supplyPrice)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[5].w }]}>{fmt(r.totalPrice)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[6].w }]}>{fmt(r.modifier)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[7].w }]}>{fmt(r.discount)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[8].w, color: colors.success }]}>{fmt(r.revenue)}</Text>
                  <Text style={[styles.td, styles.right, { width: COLS[9].w, color: r.profit >= 0 ? colors.success : colors.destructive }]}>{fmt(r.profit)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          {list.length > shown ? <Button title={t('reports.showMore', { shown, total: list.length })} variant="outline" size="sm" onPress={() => setShown((x) => x + 200)} /> : null}
        </Card>
      )}
      {picking ? (
        <CompositePicker
          api={api}
          warehouseId={warehouseId}
          compositeOnly={false}
          includeNotForSale
          onClose={() => setPicking(false)}
          onPick={(v: CompositeOption) => {
            setPicking(false);
            setProduct({ id: v.productId ?? v.variantId, title: v.productTitle });
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  section: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  caption: { fontSize: 11, color: colors.mutedForeground, textAlign: 'center' },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 6 },
  head: { backgroundColor: colors.muted },
  th: { fontSize: 11, fontWeight: '700', color: colors.foreground, paddingHorizontal: 4 },
  td: { fontSize: 12, color: colors.foreground, paddingHorizontal: 4 },
  right: { textAlign: 'right' },
  bold: { fontWeight: '700' },
  totalRow: { backgroundColor: colors.infoBg },
  catRow: { backgroundColor: colors.muted },
});
