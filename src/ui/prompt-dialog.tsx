import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { Button, Field } from './components';
import { colors, font, radius, space } from './theme';

export interface PromptField {
  key: string;
  label: string;
  secure?: boolean;
}

/** A small dialog that asks for one or more values (Alert.prompt only exists on iPhone). */
export function PromptDialog({
  title,
  message,
  fields,
  confirmLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  message?: string;
  fields: PromptField[];
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {fields.map((f, i) => (
            <Field
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ''}
              onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              secureTextEntry={f.secure}
              autoCapitalize="none"
              autoFocus={i === 0}
            />
          ))}
          <View style={styles.buttons}>
            <Button title={t('common.cancel')} variant="outline" onPress={onCancel} style={styles.flex} />
            <Button title={confirmLabel ?? t('customize.save')} loading={busy} onPress={() => onSubmit(values)} style={styles.flex} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.background, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  message: { fontSize: font.small, color: colors.mutedForeground },
  buttons: { flexDirection: 'row', gap: space.sm },
});
