import { router, type Href } from 'expo-router';
import { Clock, House, LayoutGrid, ReceiptText, UserRound, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeRoute, isTablesOnly } from '@/lib/modules';
import { useModules } from '@/lib/use-modules';
import { useSession } from '@/lib/session';
import { Text } from '@/ui/text';
import { colors, space } from './theme';

export type TabId = 'home' | 'tables' | 'orders' | 'shift' | 'more' | 'account';

/** Height of the bar above the bottom safe area, for screens to keep their last row clear of it. */
export const TAB_BAR_SPACE = 72;

/**
 * The bottom tabs of the main screens (Home, Tables, Orders, More, Account), shown only for what the
 * role can open. Switching tabs replaces the screen, so Back never walks through old tabs.
 */
export function TabBar({ current }: { current: TabId }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const ids = new Set(useModules().map((m) => m.id));

  const tabs: { id: TabId; icon: LucideIcon; label: string; route: string }[] = [];
  if (homeRoute(user) === '/home') tabs.push({ id: 'home', icon: House, label: t('home.tabHome'), route: '/home' });
  if (ids.has('tables')) tabs.push({ id: 'tables', icon: UtensilsCrossed, label: t('home.tabTables'), route: '/tables' });
  if (ids.has('orders')) tabs.push({ id: 'orders', icon: ReceiptText, label: t('home.tabOrders'), route: '/orders' });
  else if (ids.has('shift')) tabs.push({ id: 'shift', icon: Clock, label: t('more.shift'), route: '/shift' });
  // a waiter works only on the tables (and their account)
  if (!isTablesOnly(user)) tabs.push({ id: 'more', icon: LayoutGrid, label: t('more.title'), route: '/more' });
  tabs.push({ id: 'account', icon: UserRound, label: t('home.tabAccount'), route: '/account' });

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {tabs.map((tab) => {
        const active = tab.id === current;
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.id}
            testID={`tab-${tab.id}`}
            onPress={() => {
              if (!active) router.replace(tab.route as Href);
            }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon size={22} color={active ? colors.brandFrom : colors.mutedForeground} strokeWidth={active ? 2.4 : 2} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 6,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 50, justifyContent: 'center' },
  iconWrap: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999 },
  iconWrapActive: { backgroundColor: colors.brandSoft },
  label: { fontSize: 11, color: colors.mutedForeground },
  labelActive: { color: colors.brandFrom, fontWeight: '700' },
});
