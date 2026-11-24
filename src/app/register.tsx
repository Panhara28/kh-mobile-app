import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMPTY_REGISTER, registerProblem, type RegisterForm } from '@/lib/register';
import { useSession } from '@/lib/session';
import { Button, Field } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { Text } from '@/ui/text';
import { colors, font, space } from '@/ui/theme';

/**
 * Register a new store, like the kh-pos web register page (POST /api/user/first-user): only on a kh-pos that has no
 * users yet. Signs the new owner in afterwards, and the store setup follows.
 */
export default function RegisterScreen() {
  const { t } = useTranslation();
  const { api, login } = useSession();
  const [form, setForm] = useState<RegisterForm>(EMPTY_REGISTER);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof RegisterForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const bad = registerProblem(form);
    if (bad) return setProblem(t(`register.${bad}`));
    setProblem(null);
    setBusy(true);
    try {
      await api.call('POST', '/api/user/first-user', {
        ownerName: form.ownerName.trim(),
        warehouseName: form.martName.trim(),
        address: form.address.trim(),
        phoneNumber: form.phoneNumber.trim(),
        userName: form.userName.trim(),
        password: form.password,
      });
      await login(form.userName.trim(), form.password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setProblem(/ALREADY_REGISTERED/i.test(msg) ? t('register.alreadyRegistered') : t('register.failed'));
      if (!/ALREADY_REGISTERED/i.test(msg) && msg) Alert.alert(t('register.failed'), msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('register.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>{t('register.text')}</Text>
          <Field label={t('register.storeName')} value={form.martName} onChangeText={set('martName')} />
          <Field label={t('register.ownerName')} value={form.ownerName} onChangeText={set('ownerName')} />
          <Field label={t('register.phone')} value={form.phoneNumber} onChangeText={set('phoneNumber')} keyboardType="phone-pad" />
          <Field label={t('register.address')} value={form.address} onChangeText={set('address')} />
          <View style={styles.gap} />
          <Field label={t('register.username')} value={form.userName} onChangeText={set('userName')} autoCapitalize="none" autoCorrect={false} />
          <Field label={t('register.password')} value={form.password} onChangeText={set('password')} secureTextEntry />
          <Field label={t('register.confirmPassword')} value={form.confirmPassword} onChangeText={set('confirmPassword')} secureTextEntry />
          {problem ? <Text style={styles.error}>{problem}</Text> : null}
          <Button title={t('register.submit')} size="lg" loading={busy} onPress={() => void submit()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  lead: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  gap: { height: space.sm },
  error: { fontSize: font.small, color: colors.destructive },
});
