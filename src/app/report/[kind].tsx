import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rangeFor, type DateRange } from '@/lib/dates';
import { averageOrder, discountTypes, eodEntries, eodHtml, eodLines, eodQuery, eodText, topCustomers, totalDiscounts, type EodLabels, type EodReport } from '@/lib/end-of-day';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import {
  busiestHours,
  dateQuery,
  EXPIRY_ORDER,
  expiryDashboard,
  expiryTotals,
  filterExpiry,
  type ExpiryFilter,
  hourLabel,
  profitByDay,
  REPORT_HAS_DATES,
  salesByDay,
  totalSales,
  WEEKDAYS,
  type ExpiryReport,
  type HotHourRow,
  type Metric,
  type ReportKind,
  type SaleLine,
  type SoldItem,
} from '@/lib/reports';
import { itemLines, itemsQuery, itemsSummary } from '@/lib/sale-items';
import { guestCsv, guestQuery, guestSummary, guestTable, recordCount, type GuestItem } from '@/lib/guest-report';
import { stockCells, stockCsv, stockQuery, type StockLine } from '@/lib/stock-report';
import { chartItems, chartCaption, type SaleRow } from '@/lib/sale-report';
import { cinemaCsv, cinemaExportName, cinemaQuery, clockOf, dayShort, defaultMovieFilter, hasMovieFilter, movieEntries, type CinemaReport, type MovieFilter, type SortBy } from '@/lib/cinema-report';
import { useSession } from '@/lib/session';
import { actualAmount, amountDiff, itemName, logRows, printLogAmount, qtyDiff, voidCsv, voidGroups, voidQuery, voidSummary, whoText, type VoidItem } from '@/lib/void-report';
import { useBranch } from '@/lib/use-branch';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { BarList } from '@/ui/bar-list';
import { SaleReportView } from '@/ui/reports/sale-report';
import { DateRangeBar } from '@/ui/date-range-bar';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * One report like its kh-pos web page, for a day or a range of days (or the situation now for
 * stock and expiry). Reports are read from kh-pos; the last loaded copy shows when it can't be reached.
 */
export default function ReportScreen() {
  const { t } = useTranslation();
  const { kind } = useLocalSearchParams<{ kind: ReportKind }>();
  const [range, setRange] = useState<DateRange | null>(() => rangeFor('today'));
  const hasDates = REPORT_HAS_DATES[kind] ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t(`reports.${kind}`)} />
      {hasDates ? <DateRangeBar initial="today" onChange={(r) => setRange(r)} /> : null}
      {hasDates && !range ? <EmptyState title={t('reports.pickDates')} /> : <Body kind={kind} range={range} />}
    </SafeAreaView>
  );
}

function Body({ kind, range }: { kind: ReportKind; range: DateRange | null }) {
  const { t } = useTranslation();
  switch (kind) {
    case 'dashboard':
      return <Dashboard range={range!} />;
    case 'sale-report':
      return <SaleReportView range={range!} full />;
    case 'end-of-day':
      return <EndOfDay range={range!} />;
    case 'sale-breakdown':
      return <SaleReportView range={range!} full={false} />;
    case 'sale-item-report':
      return <SoldItems range={range!} />;
    case 'void-order':
      return <Voids range={range!} />;
    case 'guest-number':
      return <Guests range={range!} />;
    case 'stock-report':
      return <Stock range={range!} />;
    case 'expiry':
      return <Expiry />;
    case 'sale-product':
      return <SaleProduct range={range!} />;
    case 'cinema-showtime-sale':
      return <CinemaSales range={range!} />;
    default:
      return <EmptyState title={t('reports.unknown')} />;
  }
}

/** Calls a report endpoint and returns its `result`. */
function useReport<T>(name: string, path: string) {
  const { api } = useSession();
  const fetcher = useCallback(async () => (await api.call<{ result?: T }>('GET', path)).result as T, [api, path]);
  return useCachedLoad<T>('report', `${name}:${path}`, fetcher);
}

function Boundary<T>({ load, children }: { load: ReturnType<typeof useCachedLoad<T>>; children: (value: T) => React.ReactNode }) {
  if (load.value === null) return load.loading ? <LoadingState /> : load.error ? <ErrorState error={load.error} onRetry={() => void load.reload()} /> : <EmptyState title="-" />;
  return (
    <>
      {load.staleAt !== false ? <StaleBanner savedAt={load.staleAt} /> : null}
      <ScrollView contentContainerStyle={styles.content}>{children(load.value)}</ScrollView>
    </>
  );
}

const Section = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <Card style={styles.card}>
    {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
    {children}
  </Card>
);

const Row = ({ label, value, bold, note }: { label: string; value: string; bold?: boolean; note?: string }) => (
  <View>
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.bold]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.value, bold && styles.bold]}>{value}</Text>
    </View>
    {note ? <Text style={styles.note}>{note}</Text> : null}
  </View>
);

const Big = ({ label, value }: { label: string; value: string }) => (
  <Card style={styles.big}>
    <Text style={styles.note}>{label}</Text>
    <Text style={styles.bigValue}>{value}</Text>
  </Card>
);

function useMoney(): (v: number | string | null | undefined) => string {
  const { currency } = useBranch();
  return (v) => formatMoney(v ?? 0, currency as CurrencyCode);
}

// ---- dashboard ----

function Dashboard({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const money = useMoney();
  const q = dateQuery(range);
  const { api } = useSession();
  const fetcher = useCallback(async () => {
    const get = async <T,>(path: string) => (await api.call<{ result?: T }>('GET', `${path}?${q}`)).result as T;
    const [sales, metrics, hours] = await Promise.all([get<SaleLine[]>('/api/report/sale'), get<Metric[]>('/api/report/metrics').catch(() => [] as Metric[]), get<HotHourRow[]>('/api/report/hot-hour').catch(() => [] as HotHourRow[])]);
    return { sales, metrics, hours };
  }, [api, q]);
  const load = useCachedLoad('report', `dashboard:${q}`, fetcher);
  return (
    <Boundary load={load}>
      {({ sales, metrics, hours }) => {
        const days = salesByDay(sales);
        const profit = profitByDay(metrics);
        const profitTotal = Math.round(profit.reduce((a, d) => a + d.profit, 0) * 100) / 100;
        const costTotal = Math.round(profit.reduce((a, d) => a + d.cost, 0) * 100) / 100;
        const best = busiestHours(hours);
        return (
          <>
            <View style={styles.bigRow}>
              <Big label={t('reports.sales')} value={money(totalSales(sales))} />
              <Big label={t('reports.profit')} value={money(profitTotal)} />
            </View>
            <View style={styles.bigRow}>
              <Big label={t('reports.items')} value={String(Math.round(sales.reduce((a, l) => a + (Number(l.qty) || 0), 0)))} />
              <Big label={t('reports.cost')} value={money(costTotal)} />
            </View>
            {days.length > 0 ? (
              <Section title={t('reports.byDay')}>
                <BarList rows={days.map((d) => ({ label: d.date, value: d.amount, note: t('reports.itemsCount', { count: d.qty }) }))} format={money} />
              </Section>
            ) : (
              <EmptyState title={t('reports.empty')} />
            )}
            {best.length > 0 ? (
              <Section title={t('reports.busiest')}>
                <BarList tone="warning" rows={best.map((h) => ({ label: `${t(`reports.day_${WEEKDAYS[h.week_of_day] ?? 'mon'}`)} ${hourLabel(h.hore_of_week)}`, value: h.total_amount, note: t('reports.itemsCount', { count: h.total_qty }) }))} format={money} />
              </Section>
            ) : null}
          </>
        );
      }}
    </Boundary>
  );
}

// ---- end of day ----

function EndOfDay({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const money = useMoney();
  const load = useReport<EodReport>('eod', `/api/report/end-of-day?${eodQuery(range, user?.currentWarehouseId ?? '')}`);
  const labels: EodLabels = {
    title: t('reports.eodTitle'),
    totalSales: t('reports.totalSales'),
    transactions: t('reports.transactions'),
    average: t('reports.avgOrder'),
    discounts: t('reports.totalDiscounts'),
    payments: t('reports.paymentMethods'),
    served: t('reports.serviceTypes'),
    categories: t('reports.categoryPerformance'),
    discountsApplied: t('reports.discountsApplied'),
    customers: t('reports.customerSummary'),
  };
  const block = (title: string, rows: { key?: string; label: string; qty: number; amount: number }[], hint: 'methods' | 'types' | 'categories' | 'discount types') => (
    <Section title={`${title} · ${t(`reports.count_${hint.replace(' ', '_')}`, { count: rows.length })}`}>
      {rows.length === 0 ? <Text style={styles.note}>{t('reports.noDataFor', { title: title.toLowerCase() })}</Text> : rows.map((r) => <Row key={r.key ?? r.label} label={r.label} value={money(r.amount)} note={t('reports.transactionsCount', { count: r.qty })} />)}
    </Section>
  );
  return (
    <Boundary load={load}>
      {(r) => {
        const lines = eodLines(r, money, labels);
        const top = topCustomers(r.customerSummary);
        const discounts = discountTypes(r.discountSummary);
        return (
          <>
            <View style={styles.bigRow}>
              <Big label={labels.totalSales} value={money(r.totalSale)} />
              <Big label={labels.transactions} value={String(r.transactionCount)} />
            </View>
            <View style={styles.bigRow}>
              <Big label={labels.average} value={money(averageOrder(r))} />
              <Big label={labels.discounts} value={money(totalDiscounts(r.discountSummary))} />
            </View>
            <View style={styles.chips}>
              <Button title={t('reports.print')} variant="outline" size="sm" onPress={() => void Print.printAsync({ html: eodHtml(labels.title, lines) }).catch(() => undefined)} />
              <Button title={t('reports.export')} variant="outline" size="sm" onPress={() => void Share.share({ message: eodText(labels.title, lines) }).catch(() => undefined)} />
            </View>
            {block(labels.payments, eodEntries(r.paymentSummary), 'methods')}
            {block(labels.served, eodEntries(r.servedSummary), 'types')}
            {block(labels.categories, eodEntries(r.categorySummary), 'categories')}
            {Object.keys(r.discountSummary ?? {}).length > 0 ? block(labels.discountsApplied, discounts, 'discount types') : null}
            <Section title={`${labels.customers} · ${top.total}`}>
              {top.rows.map((c) => (
                <Row key={c.name} label={c.name} value={money(c.amount)} note={t('reports.ordersCount', { count: c.qty })} />
              ))}
              {top.total > 10 ? <Text style={styles.note}>{t('reports.topCustomers', { total: top.total })}</Text> : null}
            </Section>
            <Section title={t('reports.reportSummary')}>
              <Row label={t('reports.totalRevenue')} value={money(r.totalSale)} bold />
              <Row label={t('reports.totalOrders')} value={String(r.transactionCount)} bold />
              <Row label={t('reports.averageOrder')} value={money(averageOrder(r))} bold />
            </Section>
          </>
        );
      }}
    </Boundary>
  );
}

// ---- sold items ----

function SoldItems({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const money = useMoney();
  const load = useReport<SoldItem[]>('items', `/api/report/sale/receipt?${itemsQuery(range)}`);
  return (
    <Boundary load={load}>
      {(items) => {
        const sum = itemsSummary(items);
        const lines = itemLines(items, money, t('reports.grandTotal'));
        return items.length === 0 ? (
          <EmptyState title={t('reports.noDataRange')} />
        ) : (
          <>
            <View style={styles.bigRow}>
              <Big label={t('reports.totalItems')} value={sum.totalItems.toLocaleString()} />
              <Big label={t('reports.totalQtySold')} value={sum.totalQty.toLocaleString()} />
            </View>
            <Big label={t('reports.totalRevenue')} value={money(sum.totalRevenue)} />
            <View style={styles.chips}>
              <Button title={t('reports.print')} variant="outline" size="sm" onPress={() => void Print.printAsync({ html: eodHtml(t('reports.itemTitle'), lines) }).catch(() => undefined)} />
              <Button title={t('reports.export')} variant="outline" size="sm" onPress={() => void Share.share({ message: eodText(t('reports.itemTitle'), lines) }).catch(() => undefined)} />
            </View>
            <Section title={`${t('reports.itemBreakdown')} · ${t('reports.itemCount', { count: items.length })}`}>
              {items.map((it, i) => (
                <Row key={i} label={`${i + 1}. ${it.description}`} value={money(it.total_amount)} note={`${t('reports.qtyShort')} ${Number(it.qty).toLocaleString()}`} />
              ))}
              <Row label={t('reports.grandTotal')} value={money(sum.totalRevenue)} note={`${t('reports.qtyShort')} ${sum.totalQty.toLocaleString()}`} bold />
            </Section>
          </>
        );
      }}
    </Boundary>
  );
}

// ---- void and abnormal ----

function Voids({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [open, setOpen] = useState<string[]>([]);
  const [log, setLog] = useState<VoidItem | null>(null);
  const load = useReport<VoidItem[]>('void', `/api/report/order/void?${voidQuery(range)}`);
  return (
    <Boundary load={load}>
      {(rows) => {
        if (rows.length === 0) return <EmptyState title={t('reports.noVoids')} />;
        const sum = voidSummary(rows);
        return (
          <>
            <View style={styles.bigRow}>
              <Big label={t('reports.totalIssues')} value={String(sum.issues)} />
              <Big label={t('reports.voidedOrders')} value={String(sum.voidedOrders)} />
            </View>
            <View style={styles.bigRow}>
              <Big label={t('reports.abnormalOrders')} value={String(sum.abnormal)} />
              <Big label={t('reports.priceDiscrepancy')} value={money(sum.priceDiscrepancy)} />
            </View>
            <View style={styles.chips}>
              <Button title={t('reports.export')} variant="outline" size="sm" onPress={() => void Share.share({ title: 'Void-Order-Report', message: voidCsv(rows) }).catch(() => undefined)} />
            </View>
            <Section title={`${t('reports.voidDetails')} · ${t('reports.issuesCount', { count: rows.length })}`}>
              {voidGroups(rows).map((g) => {
                const isOpen = open.includes(g.orderId);
                return (
                  <View key={g.orderId} style={styles.group}>
                    <Pressable onPress={() => setOpen((o) => (isOpen ? o.filter((x) => x !== g.orderId) : [...o, g.orderId]))} accessibilityRole="button">
                      <View style={styles.row}>
                        <Text style={[styles.label, styles.bold]}>
                          {isOpen ? '▾' : '▸'} {g.invoice}
                        </Text>
                        <Badge tone={g.status === 'VOIDED' ? 'destructive' : 'warning'} text={g.status} />
                      </View>
                      <Text style={styles.note}>{t('reports.itemsPrinted', { count: g.items.length, printed: g.printedAt ? g.printedAt : t('reports.notPrinted') })}</Text>
                      <Text style={styles.note}>
                        {t('reports.totalLabel')}: {money(g.actual)}
                        {g.discrepancy > 0 ? ` · ${t('reports.discrepancy')}: ${money(g.discrepancy)}` : ''}
                      </Text>
                    </Pressable>
                    {isOpen
                      ? g.items.map((i, k) => (
                          <View key={`${i.orderDetailId}-${k}`} style={styles.sub}>
                            <Text style={styles.label}>{itemName(i)}</Text>
                            <Text style={styles.note}>
                              {i.status === 'VOIDED' ? t('reports.orderBy') : t('reports.checkoutBy')}: {whoText(i)}
                            </Text>
                            <Text style={styles.note}>
                              {t('reports.qtyDiscrepancy')}: {t('reports.printLog')} {i.qtyFromPrintLog ?? 'N/A'} · {t('reports.actual')} {i.actualQty}
                              {qtyDiff(i) > 0 ? ` · ${t('reports.diff')} ${qtyDiff(i)}` : ''}
                            </Text>
                            <Text style={styles.note}>
                              {t('reports.amountDiscrepancy')}: {t('reports.printLog')} {money(printLogAmount(i))} · {t('reports.actual')} {money(actualAmount(i))}
                              {amountDiff(i) > 0 ? ` · ${t('reports.diff')} ${money(amountDiff(i))}` : ''}
                            </Text>
                            <Button title={t('reports.viewLog')} variant="outline" size="sm" onPress={() => setLog(i)} />
                          </View>
                        ))
                      : null}
                  </View>
                );
              })}
            </Section>
            <Modal visible={!!log} animationType="slide" onRequestClose={() => setLog(null)}>
              <SafeAreaView style={styles.safe}>
                <ScrollView contentContainerStyle={styles.content}>
                  <Text style={styles.sectionTitle}>{t('reports.voidLog')}</Text>
                  {logRows(log?.content).length === 0 ? <Text style={styles.note}>{t('reports.noContent')}</Text> : null}
                  {logRows(log?.content).map((r) => (
                    <Row key={r.n} label={`${r.n}. ${r.field}`} value={r.value} note={r.type} />
                  ))}
                  <Button title={t('common.close')} variant="outline" onPress={() => setLog(null)} />
                </ScrollView>
              </SafeAreaView>
            </Modal>
          </>
        );
      }}
    </Boundary>
  );
}

// ---- guests ----

function Guests({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string[]>([]);
  const load = useReport<GuestItem[]>('guest', `/api/report/order/guest?${guestQuery(range)}`);
  return (
    <Boundary load={load}>
      {(items) => {
        if (items.length === 0) return <EmptyState title={t('reports.noGuests')} />;
        const sum = guestSummary(items);
        const table = guestTable(items);
        return (
          <>
            <View style={styles.bigRow}>
              <Big label={t('reports.totalGuests')} value={sum.total.toLocaleString()} />
              <Big label={t('reports.dailyAverage')} value={sum.average.toLocaleString()} />
            </View>
            <Big label={`${t('reports.peakHour')} · ${t('reports.guestsCount', { count: sum.peakGuests })}`} value={sum.peakHour} />
            <View style={styles.chips}>
              <Button title={t('reports.export')} variant="outline" size="sm" onPress={() => void Share.share({ title: 'Guest-Number-Report', message: guestCsv(items) }).catch(() => undefined)} />
            </View>
            <Section title={`${t('reports.guestDetails')} · ${t('reports.records', { count: recordCount(items, open) })}`}>
              <Text style={styles.note}>{t('reports.guestHint')}</Text>
              {table.total ? <Row label={`${t('reports.grandTotal')} · ${table.total.date}`} value={table.total.guests.toLocaleString()} bold /> : null}
              {table.days.map((d) => {
                const isOpen = open.includes(d.date);
                return (
                  <View key={d.date}>
                    <Pressable onPress={() => setOpen((o) => (isOpen ? o.filter((x) => x !== d.date) : [...o, d.date]))} accessibilityRole="button">
                      <Row label={`${d.hours.length > 0 ? (isOpen ? '▾ ' : '▸ ') : ''}${t('reports.dailyTotal')} · ${d.date}`} value={d.guests.toLocaleString()} bold />
                    </Pressable>
                    {isOpen ? d.hours.map((h, i) => <Row key={i} label={`   ${h.hour}`} value={h.guests.toLocaleString()} />) : null}
                  </View>
                );
              })}
            </Section>
          </>
        );
      }}
    </Boundary>
  );
}

// ---- stock ----

function Stock({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const money = useMoney();
  const [cats, setCats] = useState<{ id: string; title: string }[]>([]);
  const [catIds, setCatIds] = useState<string[]>([]);
  const [shown, setShown] = useState(200);
  const wid = user?.currentWarehouseId ?? '';
  useEffect(() => {
    api.call<{ result?: { data: { id: string; title: string }[] } }>('GET', '/api/category?limit=100&offset=0').then((r) => setCats(r.result?.data ?? []), () => undefined);
  }, [api]);
  const load = useReport<StockLine[]>('stock', `/api/report/stock?${stockQuery({ range, warehouseIds: wid ? [wid] : [], categoryIds: catIds, productId: '' })}`);
  return (
    <Boundary load={load}>
      {(rows) => (
        <>
          <Section title={t('reports.categories')}>
            <View style={styles.chips}>
              {cats.map((c) => (
                <Chip key={c.id} label={c.title} selected={catIds.includes(c.id)} onPress={() => setCatIds((l) => (l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id]))} />
              ))}
            </View>
          </Section>
          <View style={styles.chips}>
            <Button title={t('reports.export')} variant="outline" size="sm" disabled={rows.length === 0} onPress={() => void Share.share({ title: 'Stock-Report', message: stockCsv(rows) }).catch(() => undefined)} />
          </View>
          {rows.length === 0 ? (
            <EmptyState title={t('reports.noData')} />
          ) : (
            <Section title={`${t('reports.detailed')} · ${t('reports.records', { count: rows.length })}`}>
              {rows.slice(0, shown).map((r, i) => {
                const c = stockCells(r);
                const head = r.type !== 'detail';
                const name = r.name || (r.type === 'total' ? 'GRAND TOTAL' : '-');
                return (
                  <Row
                    key={i}
                    label={`${r.product_code ? `${r.product_code} · ` : ''}${name}`}
                    value={`${c.qty.toLocaleString()} · ${money(c.totalCost)}`}
                    bold={head}
                    note={c.cost === null ? `${t('reports.col_total')} ${money(c.totalPrice)}` : `${t('reports.cost')} ${money(c.cost)} · ${t('reports.price')} ${money(c.price ?? 0)} · ${t('reports.col_total')} ${money(c.totalPrice)}`}
                  />
                );
              })}
              {rows.length > shown ? <Button title={t('reports.showMore', { shown, total: rows.length })} variant="outline" size="sm" onPress={() => setShown((x) => x + 200)} /> : null}
            </Section>
          )}
        </>
      )}
    </Boundary>
  );
}

// ---- expiry ----

const expiryTone = { expired: 'destructive', urgent: 'destructive', critical: 'warning', warning: 'warning', ok: 'success' } as const;

function Expiry() {
  const { t } = useTranslation();
  const money = useMoney();
  const [f, setF] = useState<ExpiryFilter>({ search: '', status: 'all', slotId: '', categoryId: '' });
  const [shown, setShown] = useState(100);
  const load = useReport<ExpiryReport>('expiry', '/api/reports/expiry');
  return (
    <Boundary load={load}>
      {(r) => {
        const list = filterExpiry(r.productList ?? [], f);
        const plain = !f.search && f.status === 'all' && !f.slotId && !f.categoryId;
        const dash = plain && (r.dashboard ?? []).length > 0 ? (r.dashboard ?? []) : expiryDashboard(list);
        const totals = expiryTotals(dash);
        return (
          <>
            <View style={styles.bigRow}>
              <Big label={t('reports.totalItems')} value={String(totals.items)} />
              <Big label={t('reports.totalValue')} value={money(totals.value)} />
            </View>
            <View style={styles.chips}>
              {EXPIRY_ORDER.filter((s) => s !== 'ok').map((s) => {
                const d = dash.find((x) => x.status === s);
                return <Badge key={s} tone={expiryTone[s]} text={`${t(`reports.expiry_${s}`)} ${d?.uniqueProductCount ?? 0} · ${money(d?.value ?? 0)}`} />;
              })}
            </View>
            <Input
              value={f.search}
              onChangeText={(v) => {
                setF({ ...f, search: v });
                setShown(100);
              }}
              placeholder={t('reports.expirySearch')}
              autoCorrect={false}
              accessibilityLabel={t('reports.expirySearch')}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label={t('reports.allProducts')} selected={f.status === 'all'} onPress={() => setF({ ...f, status: 'all' })} />
              {EXPIRY_ORDER.map((s) => (
                <Chip key={s} label={t(`reports.expiry_${s}`)} selected={f.status === s} onPress={() => setF({ ...f, status: s })} />
              ))}
            </ScrollView>
            {(r.slots ?? []).length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip label={t('reports.allSlots')} selected={f.slotId === ''} onPress={() => setF({ ...f, slotId: '' })} />
                {(r.slots ?? []).map((s) => (
                  <Chip key={s.id} label={s.name} selected={f.slotId === s.id} onPress={() => setF({ ...f, slotId: s.id })} />
                ))}
              </ScrollView>
            ) : null}
            {(r.categories ?? []).length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip label={t('reports.allCategories')} selected={f.categoryId === ''} onPress={() => setF({ ...f, categoryId: '' })} />
                {(r.categories ?? []).map((c) => (
                  <Chip key={c.id} label={c.title ?? c.name ?? c.id} selected={f.categoryId === c.id} onPress={() => setF({ ...f, categoryId: c.id })} />
                ))}
              </ScrollView>
            ) : null}
            {list.length === 0 ? (
              <EmptyState title={t('reports.noExpiry')} />
            ) : (
              list.slice(0, shown).map((i, k) => (
                <Card key={k} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={[styles.heading, styles.flex]} numberOfLines={2}>
                      {i.variant?.basicProduct?.title ?? ''}
                      {i.variant?.name ? ` (${i.variant.name})` : ''}
                    </Text>
                    <Badge tone={expiryTone[i.status]} text={t(`reports.expiry_${i.status}`)} />
                  </View>
                  <Text style={styles.note}>
                    {i.slot?.name ? `${i.slot.name} · ` : ''}
                    {String(i.expiryDate).slice(0, 10)} · {t('reports.daysLeft', { count: i.daysLeft })}
                  </Text>
                  <Text style={styles.label}>
                    {t('reports.stockQty')}: {i.quantity} · {money(i.value)}
                  </Text>
                </Card>
              ))
            )}
            {list.length > shown ? <Button title={t('reports.showMore', { shown, total: list.length })} variant="outline" size="sm" onPress={() => setShown((x) => x + 100)} /> : null}
          </>
        );
      }}
    </Boundary>
  );
}

// ---- sale product (the product chart of the web) ----

function SaleProduct({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const money = useMoney();
  const [view, setView] = useState<'revenue' | 'qty'>('revenue');
  const q = new URLSearchParams({ startDate: range.start.slice(0, 10), endDate: range.end.slice(0, 10), warehouseId: user?.currentWarehouseId ?? '', groupBy: 'product' }).toString();
  const load = useReport<SaleRow[]>('sale-product', `/api/report/sale-by-category?${q}`);
  return (
    <Boundary load={load}>
      {(rows) => {
        const items = chartItems(rows, view);
        const total = items.reduce((a, i) => a + i.value, 0);
        return (
          <>
            <View style={styles.chips}>
              <Chip label={t('reports.revenue')} selected={view === 'revenue'} onPress={() => setView('revenue')} />
              <Chip label={t('reports.quantity')} selected={view === 'qty'} onPress={() => setView('qty')} />
            </View>
            <Big label={view === 'revenue' ? t('reports.totalSalesWord') : t('reports.totalQuantityWord')} value={view === 'revenue' ? money(total) : t('reports.units', { count: total })} />
            {items.length === 0 ? (
              <EmptyState title={t('reports.noData')} />
            ) : (
              <Section title={t('reports.bestSelling')}>
                <BarList rows={items.map((i) => ({ label: i.fullName, value: i.value }))} format={(v) => (view === 'revenue' ? money(v) : v.toLocaleString())} />
                <Text style={styles.note}>{chartCaption(items.length, view)}</Text>
              </Section>
            )}
          </>
        );
      }}
    </Boundary>
  );
}

// ---- cinema sales ----

function CinemaSales({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const { user, api } = useSession();
  const money = useMoney();
  const [f, setF] = useState<MovieFilter>(defaultMovieFilter());
  const [open, setOpen] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const load = useReport<CinemaReport>('cinema-sales', `/api/report/cinema/showtime?${cinemaQuery(range, user?.currentWarehouseId ?? '')}`);
  const sortLabel = (s: SortBy) => t(`reports.sort_${s}`);

  function email() {
    Alert.alert(t('reports.sendEmail'), t('reports.sendEmailAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('reports.sendEmail'),
        onPress: async () => {
          setSending(true);
          try {
            await api.call('POST', '/api/reports/cinema-showtime/send-email', { date: range.start.slice(0, 10) });
            Alert.alert(t('reports.emailSent'));
          } catch {
            Alert.alert(t('reports.emailFailed'));
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  return (
    <Boundary load={load}>
      {(r) => {
        const movies = movieEntries(r, f);
        const g = r.grand;
        return (
          <>
            <Input value={f.search} onChangeText={(v) => setF({ ...f, search: v })} placeholder={t('reports.searchMovie')} autoCorrect={false} accessibilityLabel={t('reports.searchMovie')} />
            <View style={styles.bigRow}>
              <View style={styles.flexOne}>
                <Input value={f.minTickets} onChangeText={(v) => setF({ ...f, minTickets: v })} placeholder={t('reports.minTickets')} keyboardType="number-pad" accessibilityLabel={t('reports.minTickets')} />
              </View>
              <View style={styles.flexOne}>
                <Input value={f.minAmount} onChangeText={(v) => setF({ ...f, minAmount: v })} placeholder={t('reports.minAmount')} keyboardType="decimal-pad" accessibilityLabel={t('reports.minAmount')} />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(['showtime', 'tickets', 'amount'] as SortBy[]).map((s) => (
                <Chip key={s} label={sortLabel(s)} selected={f.sortBy === s} onPress={() => setF({ ...f, sortBy: s })} />
              ))}
              <Chip label={f.order === 'asc' ? t('reports.ascending') : t('reports.descending')} selected onPress={() => setF({ ...f, order: f.order === 'asc' ? 'desc' : 'asc' })} />
              {hasMovieFilter(f) ? <Chip label={t('reports.clearFilters')} selected={false} onPress={() => setF(defaultMovieFilter())} /> : null}
            </ScrollView>
            <View style={styles.chips}>
              <Button title={t('reports.export')} variant="outline" size="sm" disabled={movies.length === 0} onPress={() => void Share.share({ title: cinemaExportName(range.start, range.end), message: cinemaCsv(r, movies) }).catch(() => undefined)} />
              <Button title={t('reports.sendEmail')} variant="outline" size="sm" loading={sending} onPress={email} />
            </View>
            {g ? (
              <>
                <View style={styles.bigRow}>
                  <Big label={t('reports.ticketsQty')} value={String(g.qty)} />
                  <Big label={t('reports.finalAmount')} value={money(g.amount)} />
                </View>
                <View style={styles.bigRow}>
                  <Big label={t('reports.totalPrice')} value={money(g.totalPrice)} />
                  <Big label={t('reports.discount')} value={money(g.discount)} />
                </View>
                <Big label={t('reports.modifier')} value={money(g.modifier)} />
              </>
            ) : null}
            {movies.length === 0 ? (
              <EmptyState title={t('reports.noData')} />
            ) : (
              <Section title={t('reports.salesByMovie', { count: movies.length })}>
                {movies.map(([title, m]) => {
                  const isOpen = open.includes(title);
                  return (
                    <View key={title} style={styles.group}>
                      <Pressable onPress={() => setOpen((o) => (isOpen ? o.filter((x) => x !== title) : [...o, title]))} accessibilityRole="button">
                        <Row label={`${isOpen ? '▾' : '▸'} ${title}`} value={money(m.totals.amount)} bold note={`${t('reports.ticketsQty')} ${m.totals.qty} · ${t('reports.showtimeCount', { count: m.showtimes.length })} · ${t('reports.totalPrice')} ${money(m.totals.totalPrice)} · ${t('reports.discount')} ${money(m.totals.discount)}`} />
                      </Pressable>
                      {isOpen
                        ? m.showtimes.map((s, i) => (
                            <Row key={i} label={`${dayShort(s.showDate)}  ${clockOf(s.startTime)}–${clockOf(s.endTime)}`} value={money(s.amount)} note={`${t('reports.ticketsQty')} ${s.qty} · ${t('reports.totalPrice')} ${money(s.totalPrice)} · ${t('reports.modifier')} ${money(s.modifier)} · ${t('reports.discount')} ${money(s.discount)}`} />
                          ))
                        : null}
                    </View>
                  );
                })}
              </Section>
            )}
          </>
        );
      }}
    </Boundary>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: 6 },
  flexOne: { flex: 1 },
  group: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sub: { gap: 2, paddingLeft: space.md, paddingVertical: 6 },
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  big: { flex: 1, padding: space.md, gap: 2, borderRadius: radius.lg },
  bigRow: { flexDirection: 'row', gap: space.sm },
  bigValue: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  sectionTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { flexShrink: 1, fontSize: font.small, color: colors.foreground },
  value: { fontSize: font.small, fontWeight: '700', color: colors.foreground },
  bold: { fontWeight: '700' },
  note: { fontSize: 12, color: colors.mutedForeground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
