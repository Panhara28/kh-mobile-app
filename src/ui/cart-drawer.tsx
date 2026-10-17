import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModifierItem, OrderLine, StaffUser, TableOrder } from '@/lib/api';
import { can, canDeleteLine } from '@/lib/line';
import { initials, splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { activeLines, lineTimes, orderCounts, pendingQty, statusQty } from '@/lib/order';
import { clock, parseKhPosTime } from '@/lib/time';
import { Badge, Button, Stepper } from './components';
import { addedLabel } from './time-label';
import { colors, font, radius, space } from './theme';

/**
 * Cart drawer from the right, like the kh-pos web "Order Summary": each line with photo,
 * status, times, add-ons and a ⋯ menu (Delete); at the bottom the guest count,
 * Send to Kitchen and Serve all.
 */
export function CartDrawer({
  visible,
  tableName,
  order,
  names,
  imageFor,
  user,
  currency,
  busy,
  onClose,
  onSetPending,
  onDelete,
  onSend,
  onServeAll,
  onSetGuests,
  onOpenLine,
}: {
  visible: boolean;
  tableName: string;
  order: TableOrder | null;
  names: Map<string, ModifierItem>;
  /** Photo URL for a dish, from the menu data. */
  imageFor: (variantId: string) => string | null;
  user: StaffUser | null;
  currency: CurrencyCode;
  busy: boolean;
  onClose: () => void;
  onSetPending: (line: OrderLine, qty: number) => void;
  onDelete: (line: OrderLine) => void;
  onSend: () => void;
  onServeAll: () => void;
  onSetGuests: (count: number) => void;
  /** Tapping a line opens "Customize Your Order" for it. */
  onOpenLine: (line: OrderLine) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.92, 440);
  const lines = activeLines(order);
  const counts = orderCounts(order);
  const canSend = can(user, 'order-preparation', 'update');
  const guests = Number(order?.customer ?? 0) || 0;

  /** The ⋯ menu: which line, and where on screen it was tapped (the menu opens just below). */
  const [menu, setMenu] = useState<{ line: OrderLine; x: number; y: number } | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [guestDraft, setGuestDraft] = useState<number | null>(null);

  // Keep the "12 min" waiting times current while the cart is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!visible) {
      setMenu(null);
      setGuestDraft(null);
      return;
    }
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

  function confirmDelete(line: OrderLine) {
    setMenu(null);
    if (!canDeleteLine(user, line)) {
      Alert.alert(t('cart.deleteNotAllowed'));
      return;
    }
    const { name } = splitTitle(line.title);
    Alert.alert(t('order.removeConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cart.delete'), style: 'destructive', onPress: () => onDelete(line) },
    ]);
  }

  function saveGuests(count: number) {
    if (count !== guests) onSetGuests(count);
    setGuestDraft(null);
  }

  const time = (value: string | null) => {
    const d = parseKhPosTime(value);
    return d ? clock(d, now) : null;
  };

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
            <Text style={styles.title}>{t('cart.summary')}</Text>
            <Text style={styles.muted}>
              {tableName}
              {order ? ` · ${t('order.invoice', { no: order.invoiceNo })}` : ''}
            </Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{t('cart.itemsCount', { count: counts.lines })}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list} onScrollBeginDrag={() => setMenu(null)}>
          {lines.length === 0 ? <Text style={[styles.muted, styles.empty]}>{t('order.empty')}</Text> : null}
          {lines.map((line) => {
            const { name, variant } = splitTitle(line.title);
            const pending = pendingQty(line);
            const cooking = statusQty(line, 'cooking') + statusQty(line, 'ready');
            const served = statusQty(line, 'served');
            const image = imageFor(line.variantId);
            const times = lineTimes(line);
            const ordered = addedLabel(t, times.ordered, now);
            const sent = time(times.sent);
            const servedAt = time(times.served);
            const mods = line.orderModifiers ?? [];
            const options = mods.filter((m) => m.modifierItemId !== 'notes');
            const note = mods.find((m) => m.modifierItemId === 'notes');
            return (
              <View key={line.orderDetailId} style={styles.line}>
                <Pressable
                  onPress={() => onOpenLine(line)}
                  accessibilityRole="button"
                  accessibilityLabel={`${line.qty} × ${name}`}
                  accessibilityHint={t('cart.openLineHint')}
                  style={({ pressed }) => [styles.lineTop, pressed && styles.pressed]}
                >
                  <View>
                    {image ? (
                      <Image source={{ uri: image }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Text style={styles.thumbText}>{initials(name)}</Text>
                      </View>
                    )}
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>{line.qty}</Text>
                    </View>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {name}
                    </Text>
                    <Text style={styles.muted}>
                      {formatMoney(line.price, currency)}
                      {variant ? ` (${variant})` : ''}
                    </Text>
                  </View>
                  <View style={styles.lineRight}>
                    <Pressable
                      onPress={(e) => setMenu({ line, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('cart.actions')}
                      style={({ pressed }) => [styles.dots, pressed && styles.dotsPressed]}
                    >
                      <Text style={styles.dotsText}>⋯</Text>
                    </Pressable>
                    <Text style={styles.lineTotal}>{formatMoney(line.totalAmount, currency)}</Text>
                  </View>
                </Pressable>

                <View style={styles.badges}>
                  {pending > 0 ? <Badge tone="outline" text={`◌ ${t('customize.pending')} ${pending}`} /> : null}
                  {cooking > 0 ? <Badge tone="warning" text={`◔ ${t('customize.preparing')} ${cooking}`} /> : null}
                  {served > 0 ? <Badge tone="success" text={`✓ ${t('customize.served')} ${served}`} /> : null}
                </View>

                <View style={styles.times}>
                  {ordered ? <Text style={styles.time}>🕒 {ordered}</Text> : null}
                  {sent ? <Text style={styles.time}>🍳 {t('cart.sentAt', { time: sent })}</Text> : null}
                  {servedAt ? <Text style={styles.time}>✓ {t('cart.servedAt', { time: servedAt })}</Text> : null}
                </View>

                {options.length > 0 || note ? (
                  <View style={styles.addons}>
                    <Text style={styles.addonsTitle}>{t('cart.addons')}</Text>
                    {options.map((m) => {
                      const price = Number(m.price ?? 0) || 0;
                      return (
                        <View key={m.modifierItemId} style={styles.addon}>
                          <Text style={styles.addonName}>• {names.get(m.modifierItemId)?.name ?? '?'}</Text>
                          <Text style={styles.addonPrice}>{price > 0 ? formatMoney(price, currency) : t('cart.free')}</Text>
                        </View>
                      );
                    })}
                    {note?.notes ? (
                      <View style={styles.addon}>
                        <Text style={[styles.addonName, styles.note]}>“{note.notes}”</Text>
                        {Number(note.price ?? 0) > 0 ? <Text style={styles.addonPrice}>{formatMoney(note.price ?? 0, currency)}</Text> : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {pending > 0 ? (
                  <View style={styles.pendingRow}>
                    <Text style={styles.muted}>{t('cart.notSent')}</Text>
                    <Stepper
                      value={pending}
                      min={cooking + served > 0 ? 0 : 1}
                      disabled={busy}
                      onChange={(q) => onSetPending(line, q)}
                      decreaseLabel={`− ${name}`}
                      increaseLabel={`+ ${name}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('order.total')}</Text>
            <Text style={styles.total}>{formatMoney(order?.totalAmount ?? 0, currency)}</Text>
          </View>

          {guestDraft !== null ? (
            <View style={styles.guestEditor}>
              <Text style={styles.guestTitle}>{t('cart.guests')}</Text>
              <View style={styles.guestRow}>
                <Stepper
                  value={guestDraft}
                  min={0}
                  max={999}
                  onChange={setGuestDraft}
                  disabled={busy}
                  editable
                  autoFocus
                  valueLabel={t('cart.guests')}
                  onSubmit={() => saveGuests(guestDraft)}
                />
                <View style={styles.flex} />
                <Button title={t('customize.cancel')} variant="ghost" size="sm" onPress={() => setGuestDraft(null)} />
                <Button title={t('customize.save')} size="sm" disabled={busy} onPress={() => saveGuests(guestDraft)} />
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <ActionButton
              label={`🧍 (${guests})`}
              color={colors.primary}
              disabled={busy || !order}
              accessibilityLabel={t('cart.guestsCount', { count: guests })}
              onPress={() => setGuestDraft(guests)}
            />
            {canSend ? (
              <ActionButton
                label={`🍳 ${t('cart.sendToKitchen')}`}
                color={colors.warning}
                disabled={busy || counts.pending === 0}
                wide
                onPress={onSend}
              />
            ) : null}
            <ActionButton
              label="✓"
              color={colors.success}
              disabled={busy || counts.cooking === 0}
              accessibilityLabel={t('cart.serveAll', { count: counts.cooking })}
              onPress={onServeAll}
            />
          </View>
        </View>
      </Animated.View>

      {menu ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.fill} onPress={() => setMenu(null)} accessibilityLabel={t('common.close')} />
          <View
            style={[
              styles.menu,
              {
                left: Math.max(space.sm, Math.min(menu.x - MENU_WIDTH + 18, width - MENU_WIDTH - space.sm)),
                top: menu.y + 16 + MENU_HEIGHT > windowHeight - space.lg ? menu.y - MENU_HEIGHT - 12 : menu.y + 16,
              },
            ]}
          >
            <Text style={styles.menuTitle}>{t('cart.actions')}</Text>
            <View style={styles.menuDivider} />
            <Pressable
              onPress={() => confirmDelete(menu.line)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Text style={[styles.menuItemText, styles.menuDelete, !canDeleteLine(user, menu.line) && styles.menuItemDisabled]}>
                🗑  {t('cart.delete')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const MENU_WIDTH = 190;
const MENU_HEIGHT = 92;

function ActionButton({
  label,
  color,
  disabled,
  wide,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  color: string;
  disabled: boolean;
  wide?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.action,
        wide && styles.actionWide,
        { backgroundColor: color },
        disabled && styles.actionDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
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
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  countPill: { backgroundColor: colors.muted, borderRadius: radius.full, paddingHorizontal: space.sm, paddingVertical: 2 },
  countPillText: { fontSize: 12, color: colors.mutedForeground },
  close: { paddingLeft: space.sm },
  closeText: { fontSize: 18, color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  list: { padding: space.lg, gap: space.md },
  line: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pressed: { opacity: 0.6 },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground },
  qtyBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBadgeText: { color: colors.primaryForeground, fontSize: 11, fontWeight: '700' },
  lineName: { fontSize: font.body, fontWeight: '600', color: colors.foreground, lineHeight: font.lineHeight },
  lineRight: { alignItems: 'flex-end', gap: space.sm },
  dots: { paddingHorizontal: 4 },
  dotsText: { fontSize: 20, lineHeight: 20, color: colors.foreground, fontWeight: '700' },
  lineTotal: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  dotsPressed: { opacity: 0.4 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    paddingVertical: space.xs,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  menuTitle: { fontSize: 12, fontWeight: '600', color: colors.mutedForeground, paddingHorizontal: space.md, paddingVertical: 6 },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: space.sm },
  menuItem: { paddingHorizontal: space.md, paddingVertical: space.md },
  menuItemPressed: { backgroundColor: colors.muted },
  menuItemText: { fontSize: font.body, color: colors.foreground },
  menuDelete: { color: colors.destructive, fontWeight: '600' },
  menuItemDisabled: { color: colors.mutedForeground },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  times: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 2 },
  time: { fontSize: 12, color: colors.mutedForeground },
  addons: { backgroundColor: colors.muted, borderRadius: radius.md, padding: space.sm, gap: 6 },
  addonsTitle: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, letterSpacing: 0.5 },
  addon: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  addonName: { flex: 1, fontSize: font.small, color: colors.foreground },
  addonPrice: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  note: { fontStyle: 'italic' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  guestEditor: {
    gap: space.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  guestTitle: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  action: { minWidth: 56, height: 42, paddingHorizontal: space.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionWide: { flex: 1 },
  actionDisabled: { opacity: 0.45 },
  actionText: { color: '#ffffff', fontSize: font.body, fontWeight: '700' },
});
