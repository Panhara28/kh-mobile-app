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
import { Button, Card, Field, Segmented } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/**
 * Staff login, laid out like the kh-pos web login (/admin/login): a centred card with
 * username, password and a full-width Login button. UI only for now: not connected to kh-pos yet.
 */
export default function Login() {
  const { t, i18n } = useTranslation();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const passwordRef = useRef<TextInput>(null);

  function submit() {
    const next = {
      username: username.trim() ? undefined : t('login.usernameRequired'),
      password: password ? undefined : t('login.passwordRequired'),
    };
    setErrors(next);
    // Connecting to the kh-pos login API is the next step.
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
                onSubmitEditing={submit}
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
              <Button title={t('login.submit')} size="lg" onPress={submit} style={styles.submit} />
            </View>
          </Card>
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
  eye: { paddingHorizontal: space.md, height: '100%', justifyContent: 'center' },
  eyeText: { fontSize: 18 },
});
