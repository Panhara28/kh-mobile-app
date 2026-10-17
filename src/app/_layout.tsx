import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initI18n } from '@/i18n';
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
        <Navigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Login screen while signed out; tables, then a table's menu and order, while signed in. */
function Navigator() {
  const { status, retry, logout } = useSession();
  const { t } = useTranslation();

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
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.page },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  message: { fontSize: font.title, color: colors.foreground, textAlign: 'center', lineHeight: 26 },
});
