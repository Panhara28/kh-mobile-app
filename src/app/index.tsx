import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isLanguage, type Language } from '@/i18n';
import { Button, Card, Header, Segmented } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/** Welcome screen: explains the three steps and starts the table QR scan. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';
  const steps = ['scan', 'choose', 'send'] as const;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header
        title={t('common.appName')}
        right={
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
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.hero}>
          <View style={styles.qrMark}>
            <Text style={styles.qrMarkText}>QR</Text>
          </View>
          <Text style={styles.title}>{t('home.title')}</Text>
          <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
        </Card>

        <Card style={styles.steps}>
          {steps.map((s, i) => (
            <View key={s} style={styles.step}>
              <View style={styles.stepNo}>
                <Text style={styles.stepNoText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{t(`home.steps.${s}`)}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        {/* Scanning arrives in Phase 2. */}
        <Button title={t('home.scan')} size="lg" disabled onPress={() => undefined} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  lang: { width: 120 },
  content: { padding: space.lg, gap: space.lg },
  hero: { padding: space.xl, alignItems: 'center', gap: space.md },
  qrMark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrMarkText: { color: colors.primaryForeground, fontSize: font.heading, fontWeight: '700' },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, textAlign: 'center', lineHeight: 32 },
  subtitle: { fontSize: font.body, color: colors.mutedForeground, textAlign: 'center', lineHeight: font.lineHeight },
  steps: { padding: space.lg, gap: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepNo: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNoText: { fontWeight: '700', color: colors.foreground },
  stepText: { flex: 1, fontSize: font.body, color: colors.foreground, lineHeight: font.lineHeight },
  footer: {
    padding: space.lg,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
