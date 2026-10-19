import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rangeFor, type DateRange } from '@/lib/dates';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { useCachedLoad } from '@/lib/offline/use-cached-load';
import {
  breakdownSections,
  busiestHours,
  dateQuery,
  EXPIRY_ORDER,
  expiryList,
  guestSections,
  hourLabel,
  profitByDay,
  REPORT_HAS_DATES,
  salesByDay,
  stockSections,
  summaryRows,
  topItems,
  totalSales,
  voidLoss,
  WEEKDAYS,
  type EndOfDayReport,
  type ExpiryReport,
  type ExpiryStatus,
  type GuestRow,
  type HotHourRow,
  type Metric,
  type ReportKind,
  type SaleBreakdownRow,
  type SaleLine,
  type SoldItem,
  type StockRow,
  type Summary,
  type VoidRow,
} from '@/lib/reports';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { Badge, Card, Chip } from '@/ui/components';
import { BarList } from '@/ui/bar-list';
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
      return <SalesByDay range={range!} />;
    case 'end-of-day':
      return <EndOfDay range={range!} />;
    case 'sale-breakdown':
      return <Breakdown range={range!} />;
    case 'sale-item-report':
      return <SoldItems range={range!} />;
    case 'void-order':
      return <Voids range={range!} />;
    case 'guest-number':
      return <Guests range={range!} />;
    case 'stock-report':
      return <Stock />;
    case 'expiry':
      return <Expiry />;
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

// ---- sale report ----

function SalesByDay({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const money = useMoney();
  const load = useReport<SaleLine[]>('sale', `/api/report/sale?${dateQuery(range)}`);
  return (
    <Boundary load={load}>
      {(sales) => {
        const days = salesByDay(sales);
        return days.length === 0 ? (
          <EmptyState title={t('reports.empty')} />
        ) : (
          <>
            <Big label={t('reports.sales')} value={money(totalSales(sales))} />
            <Section>
              {days.map((d) => (
                <Row key={d.date} label={d.date} value={money(d.amount)} note={t('reports.itemsCount', { count: d.qty })} />
              ))}
            </Section>
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
  const load = useReport<EndOfDayReport>('eod', `/api/report/end-of-day?${dateQuery(range)}&warehouseId=${encodeURIComponent(user?.currentWarehouseId ?? '')}`);
  const block = (title: string, s: Summary | undefined) => {
    const rows = summaryRows(s);
    return rows.length === 0 ? null : (
      <Section title={title}>
        {rows.map((r) => (
          <Row key={r.name} label={r.name} value={money(r.amount)} note={t('reports.itemsCount', { count: r.qty })} />
        ))}
      </Section>
    );
  };
  return (
    <Boundary load={load}>
      {(r) => (
        <>
          <View style={styles.bigRow}>
            <Big label={t('reports.sales')} value={money(r.totalSale)} />
            <Big label={t('reports.transactions')} value={String(r.transactionCount)} />
          </View>
          {block(t('reports.served'), r.servedSummary)}
          {block(t('reports.paymentsBy'), r.paymentSummary)}
          {block(t('reports.discounts'), r.discountSummary)}
          {block(t('reports.categories'), r.categorySummary)}
          {block(t('reports.customers'), r.customerSummary)}
        </>
      )}
    </Boundary>
  );
}

// ---- sale breakdown ----

function Breakdown({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const money = useMoney();
  const load = useReport<SaleBreakdownRow[]>('breakdown', `/api/report/sale-by-category?${dateQuery(range)}&groupBy=product&warehouseId=${encodeURIComponent(user?.currentWarehouseId ?? '')}`);
  return (
    <Boundary load={load}>
      {(rows) => {
        const { total, sections } = breakdownSections(rows);
        return sections.length === 0 ? (
          <EmptyState title={t('reports.empty')} />
        ) : (
          <>
            {total ? (
              <View style={styles.bigRow}>
                <Big label={t('reports.revenue')} value={money(total.revenue)} />
                <Big label={t('reports.profit')} value={money(total.profit)} />
              </View>
            ) : null}
            {sections.map((s, i) => (
              <Section key={i} title={`${s.category.name ?? ''} · ${money(s.category.revenue)}`}>
                {s.items.map((it, k) => (
                  <Row key={k} label={`${it.totalQty} × ${it.name ?? ''}`} value={money(it.revenue)} note={`${t('reports.profit')} ${money(it.profit)}${it.discount ? ` · ${t('receipt.discount')} ${money(it.discount)}` : ''}`} />
                ))}
              </Section>
            ))}
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
  const [by, setBy] = useState<'amount' | 'qty'>('amount');
  const load = useReport<SoldItem[]>('items', `/api/report/sale/receipt?${dateQuery(range)}`);
  return (
    <Boundary load={load}>
      {(items) => (
        <>
          <View style={styles.chips}>
            <Chip label={t('reports.byAmount')} selected={by === 'amount'} onPress={() => setBy('amount')} />
            <Chip label={t('reports.byQty')} selected={by === 'qty'} onPress={() => setBy('qty')} />
          </View>
          {items.length === 0 ? (
            <EmptyState title={t('reports.empty')} />
          ) : (
            <Section>
              <BarList rows={topItems(items, by).map((i) => ({ label: i.description, value: by === 'amount' ? i.total_amount : i.qty, note: `${i.qty} × · ${money(i.total_amount)}${i.discount_amount ? ` · ${t('receipt.discount')} ${money(i.discount_amount)}` : ''}` }))} format={(v) => (by === 'amount' ? money(v) : String(v))} />
            </Section>
          )}
        </>
      )}
    </Boundary>
  );
}

// ---- void and abnormal ----

function Voids({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const money = useMoney();
  const load = useReport<VoidRow[]>('void', `/api/report/order/void?${dateQuery(range)}`);
  return (
    <Boundary load={load}>
      {(rows) =>
        rows.length === 0 ? (
          <EmptyState title={t('reports.noVoids')} />
        ) : (
          <>
            <Big label={t('reports.lost')} value={money(voidLoss(rows))} />
            {rows.map((r) => (
              <Card key={r.orderDetailId} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.heading}>{r.invoice ? `#${r.invoice}` : t('reports.noInvoice')}</Text>
                  <Badge tone={r.status === 'VOIDED' ? 'destructive' : 'warning'} text={t(`reports.void_${r.status}`)} />
                </View>
                <Text style={styles.note}>{r.printedAt}</Text>
                <Text style={styles.label}>{t('reports.kitchenQty', { printed: r.qtyFromPrintLog, actual: r.actualQty })}</Text>
                <Text style={styles.note}>
                  {money(r.priceFromPrintLog)} → {money(r.actualPrice)}
                </Text>
              </Card>
            ))}
          </>
        )
      }
    </Boundary>
  );
}

// ---- guests ----

function Guests({ range }: { range: DateRange }) {
  const { t } = useTranslation();
  const load = useReport<GuestRow[]>('guest', `/api/report/order/guest?${dateQuery(range)}`);
  return (
    <Boundary load={load}>
      {(rows) => {
        const { total, days } = guestSections(rows);
        return days.length === 0 ? (
          <EmptyState title={t('reports.empty')} />
        ) : (
          <>
            <Big label={t('reports.guests')} value={String(total)} />
            {days.map((d) => (
              <Section key={d.date} title={`${d.date} · ${t('reports.guestsCount', { count: d.guests })}`}>
                <BarList tone="success" rows={d.hours.map((h) => ({ label: `${h.hour.padStart(2, '0')}:00`, value: h.guests }))} format={String} />
              </Section>
            ))}
          </>
        );
      }}
    </Boundary>
  );
}

// ---- stock ----

function Stock() {
  const { t } = useTranslation();
  const { user } = useSession();
  const money = useMoney();
  const load = useReport<StockRow[]>('stock', `/api/report/stock?warehouseId=${encodeURIComponent(user?.currentWarehouseId ?? '')}`);
  return (
    <Boundary load={load}>
      {(rows) => {
        const { total, sections } = stockSections(rows);
        return sections.length === 0 ? (
          <EmptyState title={t('reports.empty')} />
        ) : (
          <>
            {total ? (
              <View style={styles.bigRow}>
                <Big label={t('reports.stockQty')} value={String(total.qty)} />
                <Big label={t('reports.stockValue')} value={money(total.cost)} />
              </View>
            ) : null}
            {sections.map((s, i) => (
              <Section key={i} title={`${s.title.name} · ${s.title.qty} · ${money(s.title.cost)}`}>
                {s.items.map((it, k) => (
                  <Row key={k} label={it.name} value={String(it.qty)} note={`${t('reports.cost')} ${money(it.cost)} · ${t('reports.price')} ${money(it.price)}`} />
                ))}
              </Section>
            ))}
          </>
        );
      }}
    </Boundary>
  );
}

// ---- expiry ----

const expiryTone = { expired: 'destructive', urgent: 'destructive', critical: 'warning', warning: 'warning', ok: 'success' } as const;

function Expiry() {
  const { t } = useTranslation();
  const money = useMoney();
  const [status, setStatus] = useState<ExpiryStatus | 'all'>('all');
  const load = useReport<ExpiryReport>('expiry', '/api/reports/expiry');
  return (
    <Boundary load={load}>
      {(r) => {
        const list = expiryList(r.productList ?? [], status);
        return (
          <>
            <View style={styles.chips}>
              <Chip label={t('reports.all')} selected={status === 'all'} onPress={() => setStatus('all')} />
              {EXPIRY_ORDER.filter((s) => s !== 'ok').map((s) => {
                const d = (r.dashboard ?? []).find((x) => x.status === s);
                return <Chip key={s} label={`${t(`reports.expiry_${s}`)} ${d?.uniqueProductCount ?? 0}`} selected={status === s} onPress={() => setStatus(s)} />;
              })}
            </View>
            {list.length === 0 ? (
              <EmptyState title={t('reports.noExpiry')} />
            ) : (
              list.map((i, k) => (
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
          </>
        );
      }}
    </Boundary>
  );
}

const styles = StyleSheet.create({
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
