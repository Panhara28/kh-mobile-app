import { useFonts } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { isModuleForStore } from '@/lib/business-type';
import { homeRoute, isTablesOnly, moduleIdForPath, tablesOnlyAllows } from '@/lib/modules';
import { useStoreKind } from '@/lib/use-modules';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Alert, LogBox, StyleSheet } from 'react-native';
import { can } from '@/lib/line';
import { KRASAR_FONTS, Text } from '@/ui/text';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initI18n } from '@/i18n';
import { restoreLanguage } from '@/i18n/saved-language';
import { OfflineProvider } from '@/lib/offline/provider';
import { SessionProvider, useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { BrandSplash, hideLaunchScreen } from '@/ui/brand-splash';
import { colors, font, space } from '@/ui/theme';

initI18n();
void restoreLanguage();

// Expo Go (development only) warns that it cannot reach the PC when the phone is offline, over the screen being tested
LogBox.ignoreLogs(['Cannot connect to Expo CLI', 'Error happened from the WebSocket']);

export default function RootLayout() {
  // Krasar for Khmer text (ui/text.tsx). Local files, so this is a moment; on an error the system font is used.
  const [fontsLoaded, fontError] = useFonts(KRASAR_FONTS);
  if (!fontsLoaded && !fontError) return <BrandSplash />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <OfflineProvider>
          <Navigator />
        </OfflineProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Login screen while signed out; the module menu (More) while signed in. */
function Navigator() {
  const { status, retry, logout, user, api } = useSession();
  useEffect(hideLaunchScreen, []);
  const { t } = useTranslation();

  // After signing in, open the role's home screen (the owner's dashboard, a board member's board, ...).
  const landed = useRef(false);
  useEffect(() => {
    if (status !== 'signedIn') {
      landed.current = false;
      return;
    }
    if (landed.current || !user) return;
    landed.current = true;
    const home = homeRoute(user);
    // a waiter has only the tables: nothing under them to go back to
    if (isTablesOnly(user)) router.replace('/tables' as never);
    // pushed on top of More, so Back from the home screen has somewhere to go
    else if (home !== '/more') router.push(home as never);
    // A new store: kh-pos refuses to sell until its first-time setup is finished. The owner is taken there;
    // other staff are told to ask them. Unknown offline (then the store was set up already, or nothing can be sold yet anyway).
    api.call<{ result?: { complete?: boolean } }>('GET', '/api/setup').then(
      (r) => {
        if (r.result?.complete !== false) return;
        if (user.role?.role === 'OWNER' || can(user, 'setting', 'update')) router.push('/setup' as never);
        else Alert.alert(t('setup.staffTitle'), t('setup.staffText'));
      },
      () => undefined,
    );
  }, [status, user, api, t]);

  // A screen the store's type leaves out (a small restaurant's purchasing, a restaurant's retail counter...)
  // can still be reached by a link; send the staff member home instead, like the web.
  const pathname = usePathname();
  const kind = useStoreKind();
  useEffect(() => {
    if (status !== 'signedIn' || !user) return;
    if (isTablesOnly(user) && !tablesOnlyAllows(pathname)) {
      router.replace('/tables' as never);
      return;
    }
    const id = moduleIdForPath(pathname);
    if (id && !isModuleForStore(id, kind)) router.replace(homeRoute(user) as never);
  }, [status, user, pathname, kind]);

  if (status === 'loading') return <BrandSplash />;
  if (status === 'unreachable') {
    return (
      <SafeAreaView style={[styles.fill, styles.center]}>
        <Text style={styles.message}>{t('session.unreachable')}</Text>
        <Text style={styles.detail}>{t('session.unreachableFirst')}</Text>
        <Button title={t('common.retry')} onPress={retry} />
        <Button title={t('common.logout')} variant="ghost" onPress={() => void logout()} />
      </SafeAreaView>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="more" />
        <Stack.Screen name="home" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="account" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings-general" />
        <Stack.Screen name="accessibility" />
        <Stack.Screen name="users" />
        <Stack.Screen name="user-import" />
        <Stack.Screen name="deliveries" />
        <Stack.Screen name="payment-methods" />
        <Stack.Screen name="shift" />
        <Stack.Screen name="retail" />
        <Stack.Screen name="board" />
        <Stack.Screen name="board-sale" />
        <Stack.Screen name="booking" />
        <Stack.Screen name="chart-of-accounts" />
        <Stack.Screen name="promotion-sets" />
        <Stack.Screen name="promotion-set/[id]" />
        <Stack.Screen name="tables" />
        <Stack.Screen name="table/[id]" />
        <Stack.Screen name="table-setup" />
        <Stack.Screen name="table-layout" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="stock-finding" />
        <Stack.Screen name="returns" />
        <Stack.Screen name="backlog" />
        <Stack.Screen name="products" />
        <Stack.Screen name="product-edit/[id]" />
        <Stack.Screen name="product-import" />
        <Stack.Screen name="stock-counting" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="discounts" />
        <Stack.Screen name="modifiers" />
        <Stack.Screen name="production" />
        <Stack.Screen name="branches" />
        <Stack.Screen name="slots/index" />
        <Stack.Screen name="slots/[warehouseId]" />
        <Stack.Screen name="stock-movements" />
        <Stack.Screen name="product-groups" />
        <Stack.Screen name="suppliers" />
        <Stack.Screen name="supplier-prices" />
        <Stack.Screen name="purchase-orders" />
        <Stack.Screen name="purchase-order/[id]" />
        <Stack.Screen name="replenishments" />
        <Stack.Screen name="replenishment/[id]" />
        <Stack.Screen name="replenishment/suggest" />
        <Stack.Screen name="report/[kind]" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  message: { fontSize: font.title, color: colors.foreground, textAlign: 'center', lineHeight: 26 },
  detail: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 },
});
