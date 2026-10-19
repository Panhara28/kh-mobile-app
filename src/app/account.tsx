import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n, { isLanguage, type Language } from '@/i18n';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { validNewPassword } from '@/lib/org';
import { useSession } from '@/lib/session';
import { Button, Card, Field, Segmented } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

/** The signed-in person: who they are, language, changing their own password, logging out. */
export default function AccountScreen() {
  const { t } = useTranslation();
  const { api, user, logout } = useSession();
  const guard = useOnlineOnly();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';

  async function changePassword() {
    if (!oldPassword) {
      Alert.alert(t('account.oldRequired'));
      return;
    }
    if (!validNewPassword(newPassword)) {
      Alert.alert(t('users.passwordShort'));
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        await api.call('POST', '/api/user/change-password', { oldPassword, newPassword });
        setOldPassword('');
        setNewPassword('');
        Alert.alert(t('users.passwordChanged'));
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.account')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.heading}>{user?.fullname || user?.username}</Text>
          <Text style={styles.muted}>{[user?.username, user?.role?.role, user?.warehouse?.name].filter(Boolean).join(' · ')}</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('common.language')}</Text>
          <Segmented
            options={[
              { value: 'km', label: 'ខ្មែរ' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={(l) => void i18n.changeLanguage(l)}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('account.changePassword')}</Text>
          <Field label={t('account.oldPassword')} value={oldPassword} onChangeText={setOldPassword} secureTextEntry autoCapitalize="none" />
          <Field label={t('users.newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" />
          <Button title={t('account.changePassword')} loading={busy} onPress={() => void changePassword()} />
        </Card>

        <View>
          <Button
            title={t('common.logout')}
            variant="outline"
            onPress={() =>
              Alert.alert(t('session.logoutConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.logout'), style: 'destructive', onPress: () => void logout() },
              ])
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, gap: space.md },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
});
