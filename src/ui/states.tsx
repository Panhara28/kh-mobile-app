import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { ApiError, type ApiErrorKind } from '@/lib/api';
import { Button } from './components';
import { colors, font, space } from './theme';

/** Mirrors kh-pos LoadingState / EmptyState (src/components/ui/state.tsx). */
export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} testID="loading">
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label ?? t('common.loading')}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.muted}>{description}</Text> : null}
    </View>
  );
}

export function errorKind(e: unknown): ApiErrorKind {
  return e instanceof ApiError ? e.kind : 'server';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const kind = errorKind(error);
  return (
    <View style={styles.center} testID={`error-${kind}`}>
      <Text style={styles.title}>{t(`errors.${kind}`)}</Text>
      {onRetry ? <Button title={t('common.retry')} variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  title: { fontSize: font.title, fontWeight: '600', color: colors.foreground, textAlign: 'center', lineHeight: 26 },
  muted: { fontSize: font.body, color: colors.mutedForeground, textAlign: 'center', lineHeight: font.lineHeight },
});
