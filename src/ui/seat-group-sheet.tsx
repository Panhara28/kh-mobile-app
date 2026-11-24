import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/text';
import { Button, Field } from './components';
import { colors, font, radius, space } from './theme';

/**
 * "Table + Tag" style: seat a new group at a table, like the web "Seat a group" dialog. The tag is suggested (the
 * lowest free one) and can be changed; the group's order is opened at once, before anything is ordered.
 */
export function SeatGroupSheet({
  tableName,
  suggestedTag,
  tagCount,
  usedTags,
  busy,
  onSeat,
  onClose,
}: {
  tableName: string;
  suggestedTag: string;
  tagCount: number;
  /** Tags already seated anywhere in the branch ("001", "002"...). */
  usedTags: Set<string>;
  busy: boolean;
  onSeat: (tag: string, guests: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tag, setTag] = useState(suggestedTag);
  const [guests, setGuests] = useState('2');

  const n = Number(tag);
  const tagProblem = !/^\d+$/.test(tag.trim()) || n < 1 || n > tagCount ? t('seatGroup.tagRange', { max: tagCount }) : usedTags.has(String(n).padStart(3, '0')) ? t('seatGroup.tagUsed') : null;
  const g = Number(guests);
  const guestsBad = !Number.isInteger(g) || g < 1;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('seatGroup.title')}</Text>
          <Text style={styles.subtitle}>{t('seatGroup.subtitle', { table: tableName })}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label={t('seatGroup.tag')} value={tag} onChangeText={setTag} keyboardType="number-pad" error={tagProblem ?? undefined} />
            </View>
            <View style={styles.flex}>
              <Field label={t('seatGroup.guests')} value={guests} onChangeText={setGuests} keyboardType="number-pad" error={guestsBad ? t('seatGroup.guestsBad') : undefined} />
            </View>
          </View>
          <Button title={t('seatGroup.seat')} size="lg" loading={busy} disabled={!!tagProblem || guestsBad} onPress={() => onSeat(String(n), g)} />
          <Button title={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  flex: { flex: 1 },
  sheet: { padding: space.lg, gap: space.md, backgroundColor: colors.card, borderTopLeftRadius: radius.lg * 2, borderTopRightRadius: radius.lg * 2 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  title: { fontSize: font.heading, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: font.small, color: colors.mutedForeground, marginTop: -space.sm },
  row: { flexDirection: 'row', gap: space.md },
});
