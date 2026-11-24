import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { orderCounts } from '@/lib/order';
import { Badge, Button } from './components';
import { colors, font, radius, space } from './theme';

/**
 * "Table + Tag" style: the groups sitting at one table, each its own order with a tag. Tap a group to
 * take its order, or seat a new group (it gets the next free tag when its first dish is saved).
 */
export function TableGroupsSheet({
  table,
  groups,
  currency,
  onOpen,
  onNewGroup,
  onClose,
}: {
  table: RestaurantTable;
  /** One seat per group (see lib/table-groups.ts), with the changes waiting on the phone applied. */
  groups: RestaurantTable[];
  currency: CurrencyCode;
  onOpen: (seatId: string) => void;
  onNewGroup: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const full = !!table.setting_capacity && groups.reduce((a, g) => a + (g.order?.customer ?? 0), 0) >= table.setting_capacity;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{table.table_name}</Text>
          <Text style={styles.subtitle}>{t('tables.groups', { count: groups.length })}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {groups.map((g) => {
            const o = g.order;
            const counts = orderCounts(o);
            return (
              <Pressable
                key={g.id}
                onPress={() => onOpen(g.id)}
                accessibilityRole="button"
                accessibilityLabel={`${t('tables.tag')} ${o?.tagNo ?? ''}`}
                style={({ pressed }) => [styles.group, pressed && styles.pressed]}
              >
                <View style={styles.tagChip}>
                  <Text style={styles.tagLabel}>{t('tables.tag')}</Text>
                  <Text style={styles.tagNo}>{o?.tagNo ?? '…'}</Text>
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupTitle}>
                    {o?.localOnly ? t('offline.notOpened') : `#${o?.invoiceNo ?? ''}`}
                    {o?.customer ? ` · ${t('tables.guests', { count: o.customer })}` : ''}
                  </Text>
                  <Text style={styles.meta}>{counts.portions > 0 ? t('tables.items', { count: counts.portions }) : t('tables.noOrderYet')}</Text>
                  <View style={styles.badges}>
                    {counts.pending > 0 ? <Badge tone="warning" text={t('tables.toSend', { count: counts.pending })} /> : null}
                    {g.pendingSync ? <Badge tone="info" text={t('offline.notSent')} /> : null}
                  </View>
                </View>
                <Text style={styles.amount}>{formatMoney(o?.totalAmount ?? 0, currency)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={full ? t('tables.seatAnyway') : t('tables.newGroup')} onPress={onNewGroup} />
          <Button title={t('common.close')} variant="outline" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { padding: space.lg, backgroundColor: colors.card, gap: 2 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  subtitle: { fontSize: font.small, color: colors.mutedForeground },
  body: { padding: space.md, gap: space.md },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 76,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75 },
  tagChip: { width: 64, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  tagLabel: { fontSize: 11, fontWeight: '600', color: '#a1a1aa', textTransform: 'uppercase' },
  tagNo: { fontSize: font.heading, fontWeight: '800', color: colors.primaryForeground },
  groupInfo: { flex: 1, minWidth: 0, gap: 2 },
  groupTitle: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  meta: { fontSize: 12, color: colors.mutedForeground },
  badges: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  amount: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  footer: { gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
