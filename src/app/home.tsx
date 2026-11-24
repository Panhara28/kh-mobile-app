import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ChartColumnBig, Hand, Search, UserRound, X } from 'lucide-react-native';
import { BrandMark } from '@/ui/brand-mark';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { rangeFor } from '@/lib/dates';
import { can } from '@/lib/line';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { sortByLabel, type AppModule, type ModuleGroup } from '@/lib/modules';
import { useModules } from '@/lib/use-modules';
import { applyOutbox } from '@/lib/offline/overlay';
import { useOffline } from '@/lib/offline/provider';
import { orderCounts } from '@/lib/order';
import { dateQuery, totalSales, type SaleLine } from '@/lib/reports';
import { useSession } from '@/lib/session';
import { openGroups } from '@/lib/table-groups';
import { useBranch } from '@/lib/use-branch';
import { ModuleIcon } from '@/ui/module-icon';
import { BRAND_GRADIENT } from '@/ui/screen-header';
import { SyncBadge } from '@/ui/sync-status';
import { TabBar, TAB_BAR_SPACE } from '@/ui/tab-bar';
import { Text, TextInput } from '@/ui/text';
import { colors, font, radius, shadow, space } from '@/ui/theme';

const BRAND_FROM = colors.brandFrom;
const REFRESH_MS = 30_000;

/** Section order below the shortcuts (the daily modules are the shortcuts themselves). */
const SECTIONS: ModuleGroup[] = ['reports', 'stock', 'setup'];

/**
 * Home, after login: the branch and staff member on the brand gradient, a search over everything the
 * role can open, today's sales, shortcuts to the daily work, the tables in use right now, and the other
 * modules in rows. A tab bar at the bottom goes to Home, Tables, Search, Orders and Account.
 */
export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { data, state } = useOffline();
  const { api } = useSession();
  const { currency, tableMode } = useBranch();

  const [query, setQuery] = useState('');
  const [today, setToday] = useState<{ sales: number; items: number } | null>(null);
  const [tables, setTables] = useState<RestaurantTable[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const modules = useModules();
  const has = (id: string) => modules.some((m) => m.id === id);
  const canSales = can(user, 'dashboard', 'read') || user?.role?.role === 'OWNER';
  const canTables = has('tables');

  const load = useCallback(async () => {
    const jobs: Promise<unknown>[] = [];
    if (canSales) {
      const range = rangeFor('today');
      if (range) {
        jobs.push(
          api
            .call<{ result?: SaleLine[] }>('GET', `/api/report/sale?${dateQuery(range)}`)
            .then((r) => {
              const lines = r.result ?? [];
              setToday({ sales: totalSales(lines), items: Math.round(lines.reduce((a, l) => a + (Number(l.qty) || 0), 0)) });
            })
            .catch(() => undefined),
        );
      }
    }
    if (canTables) jobs.push(data.tables().then((r) => setTables(r.data), () => undefined));
    await Promise.all(jobs);
  }, [api, data, canSales, canTables]);

  const { syncVersion, online } = state;
  useFocusEffect(
    useCallback(() => {
      void load();
      const h = setInterval(() => void load(), REFRESH_MS);
      return () => clearInterval(h);
      // syncVersion and online are triggers: reload when changes were sent or kh-pos came back
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, syncVersion, online]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  /** Tables with guests right now (several groups count once per table). */
  const busy = useMemo(() => {
    if (!tables) return [];
    return tables
      .map((tb) => applyOutbox(tb, state.commands))
      .filter((tb) => openGroups(tb).length > 0 || tb.status === 'order_taken')
      .map((tb) => {
        const groups = openGroups(tb);
        const total = groups.reduce((a, o) => a + Number(o.totalAmount || 0), 0);
        const counts = groups.map((o) => orderCounts(o));
        return {
          table: tb,
          groups: groups.length,
          total,
          portions: counts.reduce((a, c) => a + c.portions, 0),
          pending: counts.reduce((a, c) => a + c.pending, 0),
        };
      });
  }, [tables, state.commands]);

  const label = (m: AppModule) => t(m.titleKey);
  const shortcuts = sortByLabel(
    modules.filter((m) => m.group === 'daily' && m.id !== 'account'),
    label,
    i18n.language,
  );
  const dashboard = modules.find((m) => m.id === 'report-dashboard');
  const found = query.trim()
    ? sortByLabel(
        modules.filter((m) => label(m).toLowerCase().includes(query.trim().toLowerCase())),
        label,
        i18n.language,
      )
    : [];

  const open = (route: string) => router.push(route as Href);
  const openTable = (tb: RestaurantTable) =>
    tableMode === 'TAG' ? open('/tables') : router.push({ pathname: '/table/[id]', params: { id: tb.id } });


  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + space.lg }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#fff" />}
      >
        {/* header on the brand gradient */}
        <View style={[styles.hero, { paddingTop: insets.top + space.md }]}>
          <View style={styles.topRow}>
            <BrandMark size={40} />
            <View style={styles.flex}>
              <Text style={styles.storeName} numberOfLines={1}>
                {user?.warehouse?.name ?? t('common.appName')}
              </Text>
              <Text style={styles.staff} numberOfLines={1}>
                {[user?.fullname || user?.username, user?.role?.role].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <SyncBadge />
            <Pressable accessibilityRole="button" accessibilityLabel={t('home.tabAccount')} onPress={() => open('/account')} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
              <UserRound size={20} color={BRAND_FROM} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.search}>
            <Search size={18} color={colors.mutedForeground} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>

          {canSales ? (
            <Pressable onPress={() => dashboard && open(dashboard.route)} style={({ pressed }) => [styles.banner, pressed && styles.pressed]} accessibilityRole="button">
              <View style={styles.flex}>
                <Text style={styles.bannerLabel}>{t('home.todaySales')}</Text>
                <Text style={styles.bannerAmount}>{today ? formatMoney(today.sales, currency as CurrencyCode) : '…'}</Text>
                <Text style={styles.bannerMeta}>
                  {t('home.itemsSold', { count: today?.items ?? 0 })}
                  {canTables ? ` · ${t('home.tablesInUse', { count: busy.length })}` : ''}
                </Text>
                {dashboard ? <Text style={styles.bannerLink}>{t('home.viewDashboard')} ›</Text> : null}
              </View>
              <View style={styles.bannerArt}>
                <ChartColumnBig size={44} color="#fff" strokeWidth={1.8} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.banner}>
              <View style={styles.flex}>
                <Text style={styles.bannerLabel}>{t('home.welcome')}</Text>
                <Text style={styles.bannerAmount} numberOfLines={1}>
                  {user?.fullname || user?.username}
                </Text>
              </View>
              <View style={styles.bannerArt}>
                <Hand size={44} color="#fff" strokeWidth={1.8} />
              </View>
            </View>
          )}
        </View>

        {/* white body over the gradient */}
        <View style={styles.body}>
          {query.trim() ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('home.results', { count: found.length })}</Text>
              {found.length === 0 ? <Text style={styles.muted}>{t('home.noResults')}</Text> : null}
              {found.map((m) => (
                <Pressable key={m.id} onPress={() => open(m.route)} style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]} accessibilityRole="button">
                  <View style={styles.resultIcon}>
                    <ModuleIcon id={m.id} size={22} color={BRAND_FROM} />
                  </View>
                  <Text style={styles.resultText}>{label(m)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
              {shortcuts.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
                  {shortcuts.map((m) => (
                    <Pressable key={m.id} testID={`home-${m.id}`} onPress={() => open(m.route)} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label(m)}>
                      <View style={styles.shortcutTile}>
                        <ModuleIcon id={m.id} size={30} color={BRAND_FROM} />
                      </View>
                      <Text style={styles.shortcutText} numberOfLines={2}>
                        {label(m)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {canTables ? (
                <View style={styles.section}>
                  <SectionHeader title={t('home.tablesNow')} action={t('home.seeAll')} onAction={() => open('/tables')} />
                  {busy.length === 0 ? (
                    <Text style={styles.muted}>{tables ? t('home.noTablesInUse') : '…'}</Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                      {busy.map((b) => (
                        <Pressable key={b.table.id} onPress={() => openTable(b.table)} style={({ pressed }) => [styles.tableCard, pressed && styles.pressed]} accessibilityRole="button">
                          <View style={styles.tableTop}>
                            <Text style={styles.tableName} numberOfLines={1}>
                              {b.table.table_name}
                            </Text>
                            {b.groups > 1 ? <Text style={styles.groupChip}>{t('tables.groups', { count: b.groups })}</Text> : null}
                          </View>
                          <Text style={styles.tableTotal}>{formatMoney(b.total, currency as CurrencyCode)}</Text>
                          <Text style={styles.tableMeta}>{t('tables.items', { count: b.portions })}</Text>
                          {b.pending > 0 ? <Text style={styles.toSend}>{t('tables.toSend', { count: b.pending })}</Text> : null}
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              ) : null}

              {SECTIONS.map((group) => {
                const items = sortByLabel(
                  modules.filter((m) => m.group === group),
                  label,
                  i18n.language,
                );
                if (items.length === 0) return null;
                return (
                  <View key={group} style={styles.section}>
                    <SectionHeader title={t(`more.group_${group}`)} action={t('home.seeAll')} onAction={() => open('/more')} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                      {items.map((m) => (
                        <Pressable key={m.id} onPress={() => open(m.route)} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label(m)}>
                          <View style={styles.moduleArt}>
                            <ModuleIcon id={m.id} size={36} color={BRAND_FROM} />
                          </View>
                          <Text style={styles.moduleText} numberOfLines={2}>
                            {label(m)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>

      <TabBar current="home" />
    </View>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
        <Text style={styles.seeAll}>{action} ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },

  hero: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl + space.lg,
    gap: space.md,
    backgroundColor: BRAND_FROM,
    experimental_backgroundImage: BRAND_GRADIENT,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  storeName: { fontSize: font.title, fontWeight: '800', color: '#fff' },
  staff: { fontSize: font.small, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  roundButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.card },

  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, paddingHorizontal: space.lg, borderRadius: radius.full, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: font.body, color: colors.foreground, paddingVertical: 0 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  bannerLabel: { fontSize: font.body, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  bannerAmount: { fontSize: 34, fontWeight: '800', color: '#fff', marginTop: 2 },
  bannerMeta: { fontSize: font.small, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  bannerLink: { fontSize: font.body, fontWeight: '700', color: '#fff', marginTop: space.sm },
  bannerArt: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },

  body: { marginTop: -space.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card, paddingTop: space.lg, gap: space.xl },
  shortcuts: { paddingHorizontal: space.lg, gap: space.md },
  shortcut: { width: 84, alignItems: 'center', gap: space.sm },
  shortcutTile: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  shortcutText: { fontSize: font.small, color: colors.foreground, textAlign: 'center' },

  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.foreground, paddingHorizontal: space.lg },
  seeAll: { fontSize: font.small, fontWeight: '700', color: BRAND_FROM },
  muted: { fontSize: font.small, color: colors.mutedForeground, paddingHorizontal: space.lg },
  row: { paddingHorizontal: space.lg, gap: space.md },

  tableCard: { width: 150, padding: space.md, gap: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', ...shadow.card },
  tableTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  tableName: { flexShrink: 1, fontSize: font.title, fontWeight: '800', color: colors.foreground },
  groupChip: { fontSize: 11, fontWeight: '700', color: BRAND_FROM, backgroundColor: '#e8efff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  tableTotal: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  tableMeta: { fontSize: 12, color: colors.mutedForeground },
  toSend: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: colors.warning, backgroundColor: colors.warningBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },

  moduleCard: { width: 120, gap: space.sm },
  moduleArt: { height: 96, borderRadius: 18, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center' },
  moduleText: { fontSize: font.small, fontWeight: '700', color: colors.foreground },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center' },
  resultText: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.foreground },
  chevron: { fontSize: 22, color: colors.mutedForeground },

});
