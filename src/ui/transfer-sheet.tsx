import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { splitTitle } from '@/lib/menu';
import { activeLines } from '@/lib/order';
import { buildTransfer, movable, selectAll, selectedCount, type TransferBody, type TransferSelection } from '@/lib/transfer';
import { Badge, Button, Card, Segmented, Stepper } from './components';
import { colors, font, radius, space } from './theme';

const statusTone = { available: 'outline', order_taken: 'default', cleaning: 'info' } as const;

/**
 * Moves an order (all of it, or chosen portions by status) to another table, like the kh-pos web
 * "Transfer table": pick the destination, pick what moves, and whether discounts go with it.
 */
export function TransferSheet({
  table,
  tables,
  busy,
  onClose,
  onTransfer,
}: {
  table: RestaurantTable;
  tables: RestaurantTable[];
  busy: boolean;
  onClose: () => void;
  onTransfer: (body: TransferBody, destination: RestaurantTable) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const order = table.order;
  const lines = activeLines(order);
  const [dest, setDest] = useState<RestaurantTable | null>(null);
  const [selection, setSelection] = useState<TransferSelection>(() => selectAll(order));
  const [discount, setDiscount] = useState(true);

  const body = dest && order ? buildTransfer({ orderId: order.orderId, sourceTableId: table.id, destinationTableId: dest.id, lines, selection, transferDiscount: discount }) : null;
  const count = selectedCount(selection);

  const set = (lineId: string, status: string, qty: number) => setSelection((s) => ({ ...s, [lineId]: { ...s[lineId], [status]: qty } }));

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{dest ? t('transfer.toTable', { name: dest.table_name }) : t('transfer.title', { name: table.table_name })}</Text>
          <Pressable onPress={dest ? () => setDest(null) : onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>{dest ? '‹' : '✕'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {!dest ? (
            <>
              <Text style={styles.muted}>{t('transfer.pick')}</Text>
              {tables
                .filter((x) => x.id !== table.id)
                .map((x) => (
                  <Pressable key={x.id} onPress={() => setDest(x)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
                    <Card style={styles.card}>
                      <View style={styles.row}>
                        <Text style={styles.heading}>{x.table_name}</Text>
                        <Badge text={t(`tableStatus.${x.status}`)} tone={statusTone[x.status] ?? 'outline'} />
                      </View>
                      {x.order ? <Text style={styles.muted}>{t('transfer.merges', { no: x.order.invoiceNo })}</Text> : null}
                    </Card>
                  </Pressable>
                ))}
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.muted}>{t('transfer.chosen', { count })}</Text>
                <Button title={t('transfer.all')} variant="outline" size="sm" onPress={() => setSelection(selectAll(order))} />
              </View>
              {lines.map((line) => (
                <Card key={line.orderDetailId} style={styles.card}>
                  <Text style={styles.heading}>{splitTitle(line.title).name}</Text>
                  {movable(line).map((m) => (
                    <View key={m.status} style={styles.row}>
                      <Text style={styles.label}>
                        {t(m.status === 'pending' ? 'customize.pending' : m.status === 'served' ? 'customize.served' : 'customize.preparing')} ({m.qty})
                      </Text>
                      <Stepper value={selection[line.orderDetailId]?.[m.status] ?? 0} min={0} max={m.qty} onChange={(q) => set(line.orderDetailId, m.status, q)} editable valueLabel={t('transfer.title', { name: '' })} />
                    </View>
                  ))}
                </Card>
              ))}
              <Text style={styles.label}>{t('transfer.discount')}</Text>
              <Segmented
                options={[
                  { value: 'yes', label: t('transfer.discountYes') },
                  { value: 'no', label: t('transfer.discountNo') },
                ]}
                value={discount ? 'yes' : 'no'}
                onChange={(v) => setDiscount(v === 'yes')}
              />
            </>
          )}
        </ScrollView>

        {dest ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <Button title={t('transfer.move', { count })} size="lg" loading={busy} disabled={!body} onPress={() => body && onTransfer(body, dest)} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: font.title, fontWeight: '700', color: colors.foreground },
  close: { fontSize: 22, color: colors.mutedForeground, padding: 4 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.body, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  pressed: { opacity: 0.7 },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
