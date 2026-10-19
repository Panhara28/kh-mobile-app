import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { homeRoute } from '@/lib/modules';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initI18n } from '@/i18n';
import { OfflineProvider } from '@/lib/offline/provider';
import { SessionProvider, useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { LoadingState } from '@/ui/states';
import { colors, font, space } from '@/ui/theme';

initI18n();

export default function RootLayout() {
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

/** Login screen while signed out; tables, then a table's menu and order, while signed in. */
function Navigator() {
  const { status, retry, logout, user } = useSession();
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
    // pushed on top of the tables, so Back from the home screen has somewhere to go
    if (home !== '/tables') router.push(home as never);
  }, [status, user]);

  if (status === 'loading') {
    return (
      <SafeAreaView style={styles.fill}>
        <LoadingState />
      </SafeAreaView>
    );
  }
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
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="tables" />
        <Stack.Screen name="table/[id]" />
        <Stack.Screen name="more" />
        <Stack.Screen name="shift" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="table-setup" />
        <Stack.Screen name="account" />
        <Stack.Screen name="table-layout" />
        <Stack.Screen name="settlement" />
        <Stack.Screen name="pricing-templates" />
        <Stack.Screen name="ticket-sale" />
        <Stack.Screen name="digital-ticket" />
        <Stack.Screen name="manual-tickets" />
        <Stack.Screen name="tickets" />
        <Stack.Screen name="halls" />
        <Stack.Screen name="showtimes" />
        <Stack.Screen name="booking" />
        <Stack.Screen name="chart-of-accounts" />
        <Stack.Screen name="product-groups" />
        <Stack.Screen name="board" />
        <Stack.Screen name="board-sale" />
        <Stack.Screen name="production" />
        <Stack.Screen name="retail" />
        <Stack.Screen name="roles" />
        <Stack.Screen name="role/[id]" />
        <Stack.Screen name="promotion-sets" />
        <Stack.Screen name="promotion-set/[id]" />
        <Stack.Screen name="stock-counting" />
        <Stack.Screen name="replenishments" />
        <Stack.Screen name="replenishment/[id]" />
        <Stack.Screen name="purchase-orders" />
        <Stack.Screen name="purchase-order/[id]" />
        <Stack.Screen name="customers" />
        <Stack.Screen name="stock-movements" />
        <Stack.Screen name="returns" />
        <Stack.Screen name="backlog" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="users" />
        <Stack.Screen name="branches" />
        <Stack.Screen name="slots/[warehouseId]" />
        <Stack.Screen name="products" />
        <Stack.Screen name="product-edit/[id]" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="modifiers" />
        <Stack.Screen name="discounts" />
        <Stack.Screen name="payment-methods" />
        <Stack.Screen name="suppliers" />
        <Stack.Screen name="report/[kind]" />
        <Stack.Screen name="order/[id]" />
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
