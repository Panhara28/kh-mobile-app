import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLanguage, type Language } from '@/i18n';
import { KHPOS_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Field, Segmented } from '@/ui/components';
import { errorKind } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/** The web app's brand gradient (globals.css --brand-from / --brand-to). */
const BRAND_FROM = '#0B43C7';
const BRAND_TO = '#1F8BFF';
const BRAND_GRADIENT = `linear-gradient(160deg, ${BRAND_FROM} 0%, ${BRAND_TO} 100%)`;

/**
 * Staff login: the BongIT brand on the blue gradient of the web app, and a sheet at the bottom with
 * Continue with Google and the username + password form. Signs in through kh-pos /api/auth/login.
 */
export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useSession();
  const insets = useSafeAreaInsets();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

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
      // On success the session switches to the first screen.
      await login(username.trim(), password);
    } catch (e) {
      setFailure(t(`errors.${errorKind(e)}`));
      setBusy(false);
    }
  }

  function google() {
    // Google sign-in needs the Google Cloud client ids and a kh-pos-v2 route (see docs/DECISIONS.md).
    setFailure(t('login.googleNotReady'));
  }

  return (
    <View style={styles.page}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          {/* brand */}
          <View style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
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
            <View style={styles.brand}>
              <Image source={require('../../assets/brand/bongit-mark-white.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="BongIT" />
              <Text style={styles.product}>Point Of Sale</Text>
              <Text style={styles.powered}>
                Powered by <Text style={styles.poweredStrong}>BongIT</Text>
              </Text>
            </View>
          </View>

          {/* sign in */}
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.title}>{t('login.title')}</Text>
              <Text style={styles.description}>{t('login.chooseMethod')}</Text>
            </View>

            <Pressable
              testID="login-google"
              accessibilityRole="button"
              onPress={google}
              style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
            >
              <GoogleMark />
              <Text style={styles.googleText}>{t('login.google')}</Text>
            </Pressable>

            <View style={styles.or}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>{t('login.or')}</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.form}>
              <Field
                testID="login-username"
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
                testID="login-password"
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
              <Pressable
                testID="login-submit"
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.submit, (pressed || busy) && styles.pressed]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('login.submit')}</Text>}
              </Pressable>
            </View>

            <Text style={styles.server}>{t('login.server', { url: KHPOS_URL || '-' })}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Google's "G" (letter form, no image asset needed). */
function GoogleMark() {
  return (
    <View style={styles.gMark} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={styles.gLetter}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BRAND_FROM, experimental_backgroundImage: BRAND_GRADIENT },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { flexGrow: 1, minHeight: 280, paddingHorizontal: space.lg },
  lang: { alignSelf: 'flex-end', width: 130 },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.xl },
  logo: { width: 112, height: 112, marginBottom: space.sm },
  product: { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  powered: { fontSize: font.body, color: 'rgba(255,255,255,0.8)' },
  poweredStrong: { fontWeight: '700', color: '#fff' },

  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    gap: space.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  sheetHeader: { gap: 4 },
  title: { fontSize: 26, fontWeight: '800', color: colors.foreground, lineHeight: 34 },
  description: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },

  googleButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  googleText: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  gMark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  gLetter: { fontSize: 20, fontWeight: '800', lineHeight: 22, color: '#4285F4' },

  or: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { fontSize: 12, color: colors.mutedForeground, textTransform: 'uppercase' },

  form: { gap: space.lg },
  submit: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_FROM,
    experimental_backgroundImage: `linear-gradient(90deg, ${BRAND_FROM} 0%, ${BRAND_TO} 100%)`,
    marginTop: space.xs,
  },
  submitText: { fontSize: font.body, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.8 },
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
