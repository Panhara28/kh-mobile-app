import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPrintUrl } from '@/lib/print-server';
import { Button, Field } from './components';
import { colors, font, space } from './theme';

/**
 * Scans the QR code on the print app's "Device Connection" card (it holds the print-server address, maybe with
 * ?token=), like the web "Scan" button. A pasted address works too. Gives back a ws:// or wss:// address.
 */
export function ScanPrintUrl({ onDone, onCancel }: { onDone: (url: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taken = useRef(false);

  function accept(raw: string) {
    const value = raw.trim();
    if (!isPrintUrl(value)) {
      setError(t('account.scanNotUrl'));
      return;
    }
    if (taken.current) return;
    taken.current = true;
    onDone(value);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{t('account.scanTitle')}</Text>
        <Text style={styles.hint}>{t('account.scanHint')}</Text>
        <View style={styles.camera}>
          {permission?.granted ? (
            <CameraView style={styles.fill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => accept(r.data)} />
          ) : (
            <View style={styles.noCamera}>
              <Text style={styles.noCameraText}>{t('account.scanNoCamera')}</Text>
              <Button title={t('account.scanAllow')} variant="outline" onPress={() => void requestPermission()} />
            </View>
          )}
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.manual}>
          <Text style={styles.hint}>{t('account.scanPaste')}</Text>
          <Field label="" value={manual} onChangeText={(v) => { setManual(v); setError(null); }} autoCapitalize="none" autoCorrect={false} placeholder="ws://192.168.1.20:8181/?token=SHOP-1234" onSubmitEditing={() => manual.trim() && accept(manual)} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Button title={t('common.cancel')} variant="outline" onPress={onCancel} style={styles.fill} />
            <Button title={t('account.scanUse')} disabled={!manual.trim()} onPress={() => accept(manual)} style={styles.fill} />
          </View>
        </KeyboardAvoidingView>
        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  fill: { flex: 1 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  hint: { fontSize: font.small, color: colors.mutedForeground, paddingHorizontal: space.lg, paddingVertical: space.sm },
  camera: { flex: 1, margin: space.md, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  noCameraText: { color: '#fff', textAlign: 'center' },
  manual: { paddingHorizontal: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  error: { color: colors.destructive, fontSize: font.small, marginBottom: space.sm },
});
