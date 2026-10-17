import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isLanguage, type Language } from '@/i18n';
import { KHPOS_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Button, Card, Field, Segmented } from '@/ui/components';
import { errorKind } from '@/ui/states';
import { colors, font, space } from '@/ui/theme';

/**
 * Staff login, laid out like the kh-pos web login (/admin/login): a centred card with
 * username, password and a full-width Login button. Signs in through kh-pos /api/auth/login.
 */
export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useSession();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    const next = {
      username: username.trim() ? undefined : t('login.usernameRequired'),
      password: password ? undefined : t('login.passwordRequired'),
    };
    setErrors(next);
    setFailure(null);
    if (next.username || next.password) return;

    setBusy(true);
    try {
      // On success the session switches to the menu screen.
      await login(username.trim(), password);
    } catch (e) {
      setFailure(t(`errors.${errorKind(e)}`));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.lang}>
        <Segmented
          options={[
            { value: 'km', label: 'ខ្មែរ' },
            { value: 'en', label: 'EN' },
          ]}
          value={language}
          onChange={(l) => void i18n.changeLanguage(l)}
        />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>{t('common.appName')}</Text>
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>{t('login.title')}</Text>
              <Text style={styles.description}>{t('login.description')}</Text>
            </View>
            <View style={styles.form}>
              <Field
                label={t('login.username')}
                placeholder={t('login.usernamePlaceholder')}
                value={username}
                onChangeText={(v) => {
                  setUsername(v);
                  if (errors.username) setErrors((e) => ({ ...e, username: undefined }));
                }}
                error={errors.username}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                submitBehavior="submit"
              />
              <Field
                ref={passwordRef}
                label={t('login.password')}
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
                }}
                error={errors.password}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    onPress={() => setShowPassword((s) => !s)}
                    hitSlop={8}
                    style={styles.eye}
                  >
                    <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </Pressable>
                }
              />
              {failure ? (
                <View style={styles.failure} accessibilityRole="alert">
                  <Text style={styles.failureText}>{failure}</Text>
                </View>
              ) : null}
              <Button
                title={t('login.submit')}
                size="lg"
                loading={busy}
                onPress={() => void submit()}
                style={styles.submit}
              />
            </View>
          </Card>
          <Text style={styles.server}>{t('login.server', { url: KHPOS_URL || '-' })}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.muted },
  flex: { flex: 1 },
  lang: { alignSelf: 'flex-end', width: 130, marginTop: space.sm, marginRight: space.lg },
  center: { flexGrow: 1, justifyContent: 'center', padding: space.lg, gap: space.lg },
  brand: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  card: { width: '100%', maxWidth: 448, alignSelf: 'center', padding: space.xl, gap: space.xl },
  cardHeader: { gap: 6 },
  title: { fontSize: 24, fontWeight: '600', color: colors.foreground, lineHeight: 32 },
  description: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  form: { gap: space.lg },
  submit: { width: '100%', marginTop: space.xs },
  failure: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: space.md,
  },
  failureText: { color: colors.destructive, fontSize: font.small, lineHeight: 20 },
  server: { textAlign: 'center', fontSize: 12, color: colors.mutedForeground },
  eye: { paddingHorizontal: space.md, height: '100%', justifyContent: 'center' },
  eyeText: { fontSize: 18 },
});
