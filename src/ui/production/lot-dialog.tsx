import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allVerified, lotRows, verifyLot, type DraftComponent } from '@/lib/production';
import { Badge, Button, Card, Input } from '../components';
import { colors, font, radius, space } from '../theme';

/**
 * "Lot Verification Required": when the branch restricts product lots, every lot being used must be
 * typed (or scanned with a keyboard scanner) and found in the list before "Confirm Produce" works.
 */
export function LotDialog({ parts, busy, onCancel, onConfirm }: { parts: DraftComponent[]; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rows = useMemo(() => lotRows(parts), [parts]);
  const [verified, setVerified] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  function check() {
    const r = verifyLot(text, rows, verified);
    if (r.result === 'empty') return;
    setVerified(r.verified);
    const code = text.trim();
    if (r.result === 'verified') setNote({ tone: 'ok', text: t('production.lotVerified', { lot: code }) });
    else if (r.result === 'already') setNote({ tone: 'ok', text: t('production.lotAlready', { lot: code }) });
    else setNote({ tone: 'bad', text: t('production.lotMissing', { lot: code }) });
    setText('');
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('production.lotTitle')}</Text>
          <Text style={styles.muted}>{t('production.lotHelp')}</Text>
          <View style={styles.row}>
            <Input value={text} onChangeText={setText} placeholder={t('production.lotPlaceholder')} autoCapitalize="none" autoCorrect={false} onSubmitEditing={check} style={styles.flex} accessibilityLabel={t('production.lotPlaceholder')} />
            <Button title={t('production.verify')} variant="outline" size="sm" disabled={!text.trim()} onPress={check} />
          </View>
          {note ? <Text style={{ color: note.tone === 'ok' ? colors.success : colors.destructive, fontSize: font.small }}>{note.text}</Text> : null}
          {rows.map((r) => {
            const ok = verified.includes(r.lotId);
            return (
              <Card key={r.lotId} style={{ ...styles.card, borderColor: ok ? colors.success : colors.border }}>
                <View style={styles.flex}>
                  <Text style={styles.heading}>{r.title}</Text>
                  <Text style={styles.muted}>SLOT: {r.slot}</Text>
                  <Text style={styles.muted}>LOT: {r.lotNumber}</Text>
                  <Text style={styles.muted}>QTY: {r.qty}</Text>
                </View>
                <Badge tone={ok ? 'success' : 'outline'} text={ok ? '✓' : t('production.pending')} />
              </Card>
            );
          })}
          <Text style={[styles.muted, styles.end]}>{t('production.verifiedCount', { done: verified.length, total: rows.length })}</Text>
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('common.cancel')} variant="outline" onPress={onCancel} style={styles.flex} />
          <Button title={t('production.confirm')} disabled={!allVerified(rows, verified)} loading={busy} onPress={onConfirm} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, borderWidth: 1 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  end: { textAlign: 'right' },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
