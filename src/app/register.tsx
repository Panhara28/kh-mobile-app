import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMPTY_REGISTER, registerProblem, type RegisterForm } from '@/lib/register';
import { KHPOS_MODE } from '@/lib/config';
import { useSession } from '@/lib/session';
import { DEMO_PASSWORD, DEMO_STAFF } from '@/local/demo-seed';
import { Button, Field } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { Text } from '@/ui/text';
import { colors, font, radius, space } from '@/ui/theme';

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
  /** Loading the demo restaurant: how far it is (0..1) and what it is making. */
  const [demo, setDemo] = useState<{ done: number; what: string } | null>(null);

  /** The web's demo small restaurant, made on this phone; then sign in as any demo user. */
  function askDemo() {
    Alert.alert(t('demo.title'), t('demo.ask'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('demo.tables'), onPress: () => void loadDemo(false) },
      { text: t('demo.tags'), onPress: () => void loadDemo(true) },
    ]);
  }

  async function loadDemo(tags: boolean) {
    setDemo({ done: 0, what: 'store' });
    try {
      const { loadDemoRestaurant } = await import('@/local/phone');
      await loadDemoRestaurant(tags, (done, what) => setDemo({ done, what }));
      setDemo(null);
      const users = DEMO_STAFF.map((s) => `${s.username} · ${t(`demo.role_${s.role}`)}`).join('\n');
      Alert.alert(t('demo.readyTitle'), t('demo.ready', { users, password: DEMO_PASSWORD }), [{ text: 'OK', onPress: () => router.replace('/') }]);
    } catch (e) {
      setDemo(null);
      Alert.alert(t('demo.failed'), e instanceof Error ? e.message : undefined);
    }
  }

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
          {KHPOS_MODE === 'phone' ? (
            <View style={styles.demoBox}>
              <Text style={styles.demoText}>{t('demo.hint')}</Text>
              <Button title={t('demo.button')} variant="outline" disabled={busy || !!demo} onPress={askDemo} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={!!demo} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>{t('demo.loading')}</Text>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${Math.round((demo?.done ?? 0) * 100)}%` }]} />
            </View>
            <Text style={styles.lead}>{demo ? t(`demo.step_${demo.what}`) : ''}</Text>
          </View>
        </View>
      </Modal>
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
  demoBox: { marginTop: space.lg, paddingTop: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  demoText: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20, textAlign: 'center' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: 'rgba(15,23,42,0.45)' },
  progressCard: { width: '100%', maxWidth: 360, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.card },
  progressTitle: { fontSize: font.body, fontWeight: '800', color: colors.foreground },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.muted },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
