import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { useSession } from '@/lib/session';
import { openGroups } from '@/lib/table-groups';
import { Text, TextInput } from '@/ui/text';
import { Button } from './components';
import { colors, font, radius, space } from './theme';

/** One move of an order (kh-pos GET /api/table-change). */
export interface TableChange {
  id: string;
  fromTableName: string;
  toTableName: string;
  changedByName: string;
  changedAt: string;
  reason: string | null;
}

/**
 * "Table + Tag" style: move a group (its order, tag and items stay the same) to another table, like the
 * web "Change table" dialog, and see where the order has been. Tables already seating groups can take
 * more, so every other table is offered.
 */
export function MoveGroupSheet({
  orderId,
  tagNo,
  fromTableId,
  tables,
  busy,
  onMove,
  onClose,
}: {
  orderId: string;
  tagNo: string | null | undefined;
  fromTableId: string;
  tables: RestaurantTable[];
  busy: boolean;
  onMove: (to: RestaurantTable, reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const [to, setTo] = useState<RestaurantTable | null>(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<TableChange[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // offline the history can't be read: the section is left out
    api.call<{ result?: TableChange[] }>('GET', `/api/table-change?orderId=${encodeURIComponent(orderId)}`).then(
      (r) => {
        if (!cancelled) setHistory(r.result ?? []);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [api, orderId]);

  const choices = tables.filter((x) => x.id !== fromTableId);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('moveGroup.title')}</Text>
          <Text style={styles.subtitle}>{tagNo ? `${t('tables.tag')} ${tagNo}` : t('tables.newGroup')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>{t('moveGroup.to')}</Text>
          <View style={styles.grid}>
            {choices.map((x) => {
              const selected = to?.id === x.id;
              const groups = openGroups(x).length;
              return (
                <Pressable key={x.id} onPress={() => setTo(x)} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.table, selected && styles.tableSelected]}>
                  <Text style={[styles.tableName, selected && styles.tableNameSelected]} numberOfLines={1}>
                    {x.table_name}
                  </Text>
                  <Text style={[styles.tableMeta, selected && styles.tableMetaSelected]}>{groups ? t('tables.groups', { count: groups }) : t('tableStatus.available')}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>{t('moveGroup.reason')}</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder={t('moveGroup.reasonHint')} placeholderTextColor={colors.mutedForeground} maxLength={200} style={styles.input} />

          {history && history.length > 0 ? (
            <>
              <Text style={styles.section}>{t('moveGroup.history')}</Text>
              {history.map((h) => (
                <View key={h.id} style={styles.move}>
                  <View style={styles.moveRow}>
                    <Text style={styles.moveTable}>{h.fromTableName}</Text>
                    <ArrowRight size={16} color={colors.mutedForeground} />
                    <Text style={styles.moveTable}>{h.toTableName}</Text>
                  </View>
                  <Text style={styles.moveMeta}>
                    {[h.changedByName, h.changedAt.replace('T', ' ').slice(0, 16), h.reason].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} variant="outline" onPress={onClose} style={styles.flex} />
          <Button title={to ? t('moveGroup.moveTo', { name: to.table_name }) : t('moveGroup.pick')} disabled={!to} loading={busy} onPress={() => to && onMove(to, reason.trim())} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { padding: space.lg, gap: 2, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.heading, fontWeight: '800', color: colors.foreground },
  subtitle: { fontSize: font.small, color: colors.mutedForeground },
  body: { padding: space.lg, gap: space.md },
  section: { fontSize: font.body, fontWeight: '700', color: colors.foreground, marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  table: { width: '31%', padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 2 },
  tableSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  tableName: { fontSize: font.body, fontWeight: '800', color: colors.foreground },
  tableNameSelected: { color: colors.primaryForeground },
  tableMeta: { fontSize: 11, color: colors.mutedForeground },
  tableMetaSelected: { color: 'rgba(255,255,255,0.85)' },
  input: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, fontSize: font.body, color: colors.foreground },
  move: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  moveTable: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  moveMeta: { fontSize: 12, color: colors.mutedForeground },
  footer: { flexDirection: 'row', gap: space.md, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  flex: { flex: 1 },
});
