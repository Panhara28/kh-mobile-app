import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { qrMatrix, qrRuns } from '@/lib/qr';
import { Button } from './components';
import { colors, font, radius, space } from './theme';

const SIZE = 240;

/** A QR code drawn with plain views (black on white, with the quiet border scanners need). */
export function QrCode({ value }: { value: string }) {
  const rows = useMemo(() => qrRuns(qrMatrix(value)), [value]);
  const cell = Math.max(2, Math.floor(SIZE / rows.length));
  const side = cell * rows.length;
  return (
    <View style={styles.paper} accessibilityLabel={value}>
      <View style={{ width: side, height: side }}>
        {rows.map((runs, r) => (
          <View key={r} style={{ height: cell }}>
            {runs.map((run) => (
              <View key={run.start} style={{ position: 'absolute', left: run.start * cell, width: run.length * cell, height: cell, backgroundColor: '#000' }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The table QR code (customers scan it to open this table's menu) or an invoice QR code, like the web
 * dialogs. Share sends the link; Open link opens it in the browser.
 */
export function QrSheet({ title, subtitle, link, onClose }: { title: string; subtitle?: string | null; link: string; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView contentContainerStyle={styles.body}>
          <QrCode value={link} />
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={styles.label}>{t('qr.link')}</Text>
          <Text selectable style={styles.link}>
            {link}
          </Text>
          <View style={styles.buttons}>
            <Button title={t('qr.share')} variant="outline" onPress={() => void Share.share({ message: link })} />
            <Button title={t('qr.open')} variant="outline" onPress={() => void Linking.openURL(link)} />
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground, padding: space.lg, backgroundColor: colors.card },
  body: { alignItems: 'center', gap: space.md, padding: space.lg },
  paper: { padding: space.lg, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  subtitle: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  label: { alignSelf: 'flex-start', fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  link: { alignSelf: 'stretch', fontSize: font.small, color: colors.foreground, fontFamily: 'monospace', padding: space.md, backgroundColor: colors.muted, borderRadius: radius.md },
  buttons: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', justifyContent: 'center' },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
