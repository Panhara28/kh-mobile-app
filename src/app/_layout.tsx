import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { homeRoute } from '@/lib/modules';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
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

/** Login screen while signed out; the module menu (More) while signed in. */
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
    // pushed on top of More, so Back from the home screen has somewhere to go
    if (home !== '/more') router.push(home as never);
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
        <Stack.Screen name="more" />
        <Stack.Screen name="account" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings-general" />
        <Stack.Screen name="shift" />
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
