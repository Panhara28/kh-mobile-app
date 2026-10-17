import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModifierItem, OrderLine, TableOrder } from '@/lib/api';
import { splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { activeLines, lineExtras, lineStarted, orderCounts, pendingQty, statusQty } from '@/lib/order';
import { Badge, Button, Stepper } from './components';
import { addedLabel } from './time-label';
import { colors, font, radius, space } from './theme';

/**
 * Cart drawer, sliding in from the right: the table's order with kitchen status per line,
 * pending quantities, remove, total and Send to kitchen.
 */
export function CartDrawer({
  visible,
  tableName,
  order,
  names,
  currency,
  busy,
  onClose,
  onSetPending,
  onRemove,
  onSend,
  onOpenLine,
}: {
  visible: boolean;
  tableName: string;
  order: TableOrder | null;
  names: Map<string, ModifierItem>;
  currency: CurrencyCode;
  busy: boolean;
  onClose: () => void;
  onSetPending: (line: OrderLine, qty: number) => void;
  onRemove: (line: OrderLine) => void;
  onSend: () => void;
  /** Tapping a line opens "Customize Your Order" for it. */
  onOpenLine: (line: OrderLine) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.88, 420);
  const lines = activeLines(order);
  const counts = orderCounts(order);

  // Keep the "12 min" waiting times current while the cart is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const h = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(h);
  }, [visible]);

  // Slide in from the right; keep the modal mounted until the slide-out has finished.
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide]);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] });

  function confirmRemove(line: OrderLine) {
    const { name } = splitTitle(line.title);
    Alert.alert(t('order.removeConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('order.remove'), style: 'destructive', onPress: () => onRemove(line) },
    ]);
  }

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: slide }]}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel={t('common.close')} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          { width: drawerWidth, paddingTop: insets.top, paddingBottom: insets.bottom + space.md, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title}>
              🛒 {t('cart.title')} · {tableName}
            </Text>
            {order ? <Text style={styles.muted}>{t('order.invoice', { no: order.invoiceNo })}</Text> : null}
          </View>
          <Button title="✕" variant="ghost" size="sm" onPress={onClose} accessibilityLabel={t('common.close')} />
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {lines.length === 0 ? <Text style={[styles.muted, styles.empty]}>{t('order.empty')}</Text> : null}
          {lines.map((line) => {
            const { name, variant } = splitTitle(line.title);
            const { options, note } = lineExtras(line, names);
            const started = lineStarted(line);
            const pending = pendingQty(line);
            const cooking = statusQty(line, 'cooking') + statusQty(line, 'ready');
            const served = statusQty(line, 'served');
            return (
              <View key={line.orderDetailId} style={styles.line}>
                <Pressable
                  onPress={() => onOpenLine(line)}
                  accessibilityRole="button"
                  accessibilityLabel={`${line.qty} × ${name}`}
                  accessibilityHint={t('cart.openLineHint')}
                  style={({ pressed }) => [styles.lineTop, pressed && styles.pressed]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.lineName}>
                      {line.qty} × {name}
                      {variant ? <Text style={styles.muted}> ({variant})</Text> : null}
                    </Text>
                    {options.length ? <Text style={styles.muted}>{options.join(', ')}</Text> : null}
                    {note ? <Text style={styles.note}>“{note}”</Text> : null}
                    {addedLabel(t, line.createdAt, now) ? (
                      <Text style={styles.time}>🕒 {addedLabel(t, line.createdAt, now)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineTotal}>{formatMoney(line.totalAmount, currency)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
                <View style={styles.badges}>
                  {pending > 0 ? <Badge tone="warning" text={`${t('itemStatus.pending')} ${pending}`} /> : null}
                  {cooking > 0 ? <Badge tone="info" text={`${t('itemStatus.cooking')} ${cooking}`} /> : null}
                  {served > 0 ? <Badge tone="success" text={`${t('itemStatus.served')} ${served}`} /> : null}
                </View>
                <View style={styles.lineActions}>
                  {started ? (
                    <Text style={styles.started}>{t('order.started')}</Text>
                  ) : (
                    <Button title={t('order.remove')} variant="ghost" size="sm" disabled={busy} onPress={() => confirmRemove(line)} />
                  )}
                  <Stepper
                    value={pending}
                    min={started ? 0 : 1}
                    disabled={busy}
                    onChange={(q) => onSetPending(line, q)}
                    decreaseLabel={`− ${name}`}
                    increaseLabel={`+ ${name}`}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('order.total')}</Text>
            <Text style={styles.total}>{formatMoney(order?.totalAmount ?? 0, currency)}</Text>
          </View>
          {counts.pending > 0 ? (
            <Button title={t('order.sendToKitchen', { count: counts.pending })} size="lg" loading={busy} onPress={onSend} />
          ) : lines.length > 0 ? (
            <Text style={[styles.muted, styles.allSent]}>{t('order.allSent')}</Text>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: -2, height: 0 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  list: { padding: space.lg, gap: space.md },
  line: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pressed: { opacity: 0.6 },
  time: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  chevron: { fontSize: 22, lineHeight: 22, color: colors.mutedForeground },
  lineName: { fontSize: font.body, fontWeight: '600', color: colors.foreground, lineHeight: font.lineHeight },
  note: { fontSize: font.small, color: colors.foreground, fontStyle: 'italic' },
  lineTotal: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  started: { fontSize: 12, color: colors.mutedForeground, flex: 1 },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: font.body, color: colors.mutedForeground },
  total: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  allSent: { textAlign: 'center' },
});
