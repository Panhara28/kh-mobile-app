import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CountableStatus, KhPosApi, MenuProduct, OrderLine, PromotionOption, StaffUser, StatusMove } from '@/lib/api';
import { appliedPromotionIds, canEditStatus, checkStatusChange, lineNote, lineOptionIds, manualDiscount, resendSummary } from '@/lib/line';
import { initials, splitTitle } from '@/lib/menu';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { modifierPrice, statusQty } from '@/lib/order';
import { Button, Card, Input, Segmented, Stepper } from './components';
import { colors, font, radius, space } from './theme';
import { addedLabel, byAtLabel } from './time-label';

/**
 * What Customize Your Order changes on an order line. The table screen provides these: each is
 * done at once when kh-pos can be reached, and otherwise kept on the phone and sent later.
 */
export interface LineApi {
  setStatusQty(orderId: string, orderDetailId: string, status: CountableStatus, qty: number): Promise<void>;
  moveStatus(orderId: string, moves: StatusMove[]): Promise<void>;
  updateNote(orderId: string, input: { orderDetailId: string; notes: string; price: number }): Promise<void>;
  addModifier(orderId: string, input: { orderDetailId: string; modifierItemId: string; price: number; notes?: string }): Promise<void>;
  removeModifier(orderId: string, input: { orderDetailId: string; modifierItemId: string }): Promise<void>;
  setManualDiscount(orderId: string, input: { itemId: string; amount: number; discountType: 'PERCENTAGE' | 'AMOUNT' }): Promise<void>;
  addPromotion(orderId: string, input: { itemId: string; discountId: string; name: string }): Promise<void>;
  removePromotion(orderId: string, input: { itemId: string; discountId: string; name: string }): Promise<void>;
}

/**
 * "Customize Your Order" for one cart line, like the kh-pos web restaurant POS: info,
 * quantity management (Prepare / Serve / edit counts), options, special instructions,
 * manual discount and promotions. Every change goes to kh-pos at once, or is kept and sent when it can be reached.
 */
export function CustomizeLine({
  line,
  orderId,
  product,
  user,
  api,
  lineApi,
  loadPromotions,
  currency,
  busy,
  run,
  onClose,
}: {
  line: OrderLine | null;
  orderId: string | null;
  /** Menu data for the line's dish (photo and option groups), if loaded. */
  product: MenuProduct | undefined;
  user: StaffUser | null;
  /** For the dish photo address. */
  api: Pick<KhPosApi, 'imageUrl'>;
  lineApi: LineApi;
  /** Discounts that can be applied to a dish (saved copy when offline). */
  loadPromotions: (productId: string) => Promise<PromotionOption[]>;
  currency: CurrencyCode;
  busy: boolean;
  /** Runs a change (done now, or kept for later when offline) and reloads the table; resolves false on error. */
  run: (action: () => Promise<void>) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState<{ status: CountableStatus; qty: number } | null>(null);
  /** Open "Mark as Served" dialog: how many of the preparing portions to serve. */
  const [serving, setServing] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [notePrice, setNotePrice] = useState('0');
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENTAGE'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState('0');
  const [promotions, setPromotions] = useState<PromotionOption[]>([]);

  // Fresh form values whenever another line is opened (not on every background refresh,
  // so typing isn't overwritten).
  const lineId = line?.orderDetailId;
  useEffect(() => {
    if (!line) return;
    const n = lineNote(line);
    setNote(n.notes);
    setNotePrice(String(n.price));
    const d = manualDiscount(line);
    setDiscountType(d?.discountType ?? 'AMOUNT');
    setDiscountValue(String(d?.value ?? 0));
    setEditing(null);
    setServing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  const productId = product?.productId;
  useEffect(() => {
    setPromotions([]);
    if (!productId) return;
    loadPromotions(productId).then(setPromotions, () => setPromotions([]));
  }, [loadPromotions, productId]);

  if (!line || !orderId) return null;
  const { name, variant } = splitTitle(line.title);
  const imageUrl = api.imageUrl(product?.images?.[0]?.url);
  const pending = statusQty(line, 'pending');
  const cooking = statusQty(line, 'cooking') + statusQty(line, 'ready');
  const served = statusQty(line, 'served');
  const discountAmount = Number(line.discountAmount ?? 0) || 0;
  const optionIds = lineOptionIds(line);
  const applied = appliedPromotionIds(line);
  const groups = (product?.modifiers ?? []).filter((g) => (g.items ?? []).length > 0);
  const id = line.orderDetailId;

  /** "ban · 2026-10-17 23:20": who last changed this status count, and when (as on the web). */
  const changedBy = (s: CountableStatus) => {
    // When portions last entered this status, and who moved them (kept by kh-pos).
    const entry = (line.status ?? []).find((x) => x.status === s);
    return entry ? byAtLabel(t, entry.createdBy, entry.createdAt) : null;
  };
  const added = addedLabel(t, line.createdAt);
  const resent = resendSummary(line);

  const statusLabel = (s: CountableStatus) =>
    t(s === 'pending' ? 'customize.pending' : s === 'cooking' ? 'customize.preparing' : 'customize.served');

  /**
   * Preparing and Served can be edited but never above what was ordered (the line's total,
   * which kh-pos keeps as the sum of all statuses): the kitchen can't prepare, and the floor
   * can't serve, more than was sent. Pending stays free so more can be added.
   */
  const maxFor = (s: CountableStatus) => (s === 'pending' ? 999 : Math.max(1, Number(line.qty) || 0));

  function saveCount(status: CountableStatus, qty: number) {
    if (!line || !orderId) return;
    if (qty > maxFor(status)) {
      Alert.alert(t('customize.exceedsOrdered', { max: maxFor(status), status: statusLabel(status) }));
      return;
    }
    const check = checkStatusChange(line, status, qty);
    if (check === 'atLeastOne') {
      Alert.alert(t('customize.atLeastOne'));
      return;
    }
    const doIt = async () => {
      if (await run(() => lineApi.setStatusQty(orderId, id, status, qty))) setEditing(null);
    };
    if (check === 'confirmZero') {
      Alert.alert(t('customize.confirmZeroTitle'), t('customize.confirmZero', { status: statusLabel(status) }), [
        { text: t('customize.cancel'), style: 'cancel' },
        { text: t('customize.confirmZeroYes'), style: 'destructive', onPress: () => void doIt() },
      ]);
      return;
    }
    void doIt();
  }

  function startEdit(status: CountableStatus, current: number) {
    if (!canEditStatus(user, status)) {
      Alert.alert(t('customize.noPermission'));
      return;
    }
    setEditing({ status, qty: current });
  }

  const statusRows: { status: CountableStatus; icon: string; qty: number; tone: object; action?: ReactNode }[] = [
    {
      status: 'pending',
      icon: '🕒',
      qty: pending,
      tone: styles.countPending,
      action: (
        <Button
          title={t('customize.prepare')}
          variant="outline"
          size="sm"
          disabled={busy || pending < 1}
          onPress={() => void run(() => lineApi.moveStatus(orderId, [{ orderDetailId: id, fromStatus: 'pending', toStatus: 'cooking', qty: pending }]))}
        />
      ),
    },
    {
      status: 'cooking',
      icon: '🍳',
      qty: cooking,
      tone: styles.countPending,
      action: (
        <Button
          title={t('customize.serve')}
          variant="outline"
          size="sm"
          disabled={busy || cooking < 1}
          onPress={() => setServing(cooking)}
        />
      ),
    },
    { status: 'served', icon: '✓', qty: served, tone: styles.countServed },
  ];

  async function confirmServe() {
    if (!orderId || serving === null) return;
    const qty = Math.min(Math.max(1, serving), cooking);
    const ok = await run(() => lineApi.moveStatus(orderId, [{ orderDetailId: id, fromStatus: 'cooking', toStatus: 'served', qty }]));
    if (ok) setServing(null);
  }

  const parsedNotePrice =Math.max(0, Number(notePrice) || 0);
  const current = lineNote(line);
  const noteChanged = note.trim() !== current.notes.trim() || parsedNotePrice !== current.price;

  async function applyNotes() {
    if (!orderId) return;
    const notes = note.trim();
    const ok = await run(() =>
      current.exists
        ? lineApi.updateNote(orderId, { orderDetailId: id, notes, price: parsedNotePrice })
        : lineApi.addModifier(orderId, { orderDetailId: id, modifierItemId: 'notes', notes, price: parsedNotePrice }),
    );
    if (ok) Alert.alert(t('customize.saved'));
  }

  async function applyDiscount() {
    if (!orderId) return;
    const value = Math.max(0, Number(discountValue) || 0);
    const ok = await run(() => lineApi.setManualDiscount(orderId, { itemId: id, amount: value, discountType }));
    if (ok) Alert.alert(t('customize.saved'));
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Modal visible={serving !== null} transparent animationType="fade" onRequestClose={() => setServing(null)}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('customize.serveTitle')}</Text>
            <Text style={styles.dialogText}>{t('customize.serveAsk', { available: cooking })}</Text>
            <View style={styles.dialogQty}>
              <Text style={styles.statusLabel}>{t('customize.serveQty')}</Text>
              <Stepper value={serving ?? 1} min={1} max={Math.max(1, cooking)} onChange={setServing} disabled={busy} editable valueLabel={t('customize.serveQty')} onSubmit={() => void confirmServe()} />
            </View>
            <Button title={t('customize.serveConfirm')} disabled={busy || cooking < 1} onPress={() => void confirmServe()} />
            <Button title={t('customize.cancel')} variant="outline" onPress={() => setServing(null)} />
          </View>
        </View>
      </Modal>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('customize.title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Info */}
            <Card style={styles.card}>
              <View style={styles.infoTop}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Text style={styles.thumbText}>{initials(name)}</Text>
                  </View>
                )}
                <View style={styles.flex}>
                  <Text style={styles.name}>{name}</Text>
                  {variant ? <Text style={styles.muted}>{variant}</Text> : null}
                  {added ? <Text style={styles.statusWhen}>🕒 {added}</Text> : null}
                </View>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>{t('customize.qty', { qty: line.qty })}</Text>
                <Text style={styles.infoText}>{t('customize.each', { price: formatMoney(line.price, currency) })}</Text>
                <View style={styles.totalBox}>
                  <Text style={styles.muted}>{t('customize.total')} </Text>
                  <Text style={styles.total}>{formatMoney(line.totalAmount, currency)}</Text>
                </View>
              </View>
              {discountAmount > 0 ? (
                <Text style={styles.discountNote}>{t('customize.discount', { amount: formatMoney(discountAmount, currency) })}</Text>
              ) : null}
            </Card>

            {/* Quantity management */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{t('customize.quantity')}</Text>
              {statusRows.map((row) => {
                const isEditing = editing?.status === row.status;
                return (
                  <View key={row.status} style={styles.statusBlock}>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusIcon}>{row.icon}</Text>
                    <View>
                      <Text style={styles.statusLabel}>{statusLabel(row.status)}</Text>
                      {changedBy(row.status) ? <Text style={styles.statusWhen}>{changedBy(row.status)}</Text> : null}
                    </View>
                    {isEditing ? (
                      <>
                        <Stepper value={editing.qty} min={0} max={maxFor(row.status)} onChange={(q) => setEditing({ status: row.status, qty: q })} disabled={busy} editable autoFocus valueLabel={statusLabel(row.status)} onSubmit={() => saveCount(row.status, editing.qty)} />
                        <View style={styles.flex} />
                        <Button title={t('customize.save')} size="sm" disabled={busy} onPress={() => saveCount(row.status, editing.qty)} />
                        <Button title="✕" variant="ghost" size="sm" onPress={() => setEditing(null)} accessibilityLabel={t('customize.cancel')} />
                      </>
                    ) : (
                      <>
                        <View style={[styles.count, row.tone]}>
                          <Text style={styles.countText}>{row.qty}</Text>
                        </View>
                        <Pressable
                          onPress={() => startEdit(row.status, row.qty)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t('customize.edit', { status: statusLabel(row.status) })}
                          style={[styles.edit, !canEditStatus(user, row.status) && styles.editDisabled]}
                        >
                          <Text style={styles.editText}>✎</Text>
                        </Pressable>
                        <View style={styles.flex} />
                        {row.action}
                      </>
                    )}
                  </View>
                  {row.status === 'cooking' && resent.length > 0 ? (
                    <Text style={styles.resentNote}>
                      {t('cart.resentBy', { count: resent.length })} {resent.map((r) => (r.qty ? `${r.who} ×${r.qty}` : r.who)).join(', ')}
                    </Text>
                  ) : null}
                  </View>
                );
              })}
            </Card>

            {/* Options */}
            {groups.length > 0 ? (
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>{t('customize.options')}</Text>
                {groups.map((g) => (
                  <View key={g.modifierId} style={styles.group}>
                    <Text style={styles.muted}>{g.title}</Text>
                    <View style={styles.options}>
                      {(g.items ?? []).map((item) => {
                        const on = optionIds.has(item.id);
                        const extra = modifierPrice(item);
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on, disabled: busy }}
                            disabled={busy}
                            onPress={() =>
                              void run(() =>
                                on
                                  ? lineApi.removeModifier(orderId, { orderDetailId: id, modifierItemId: item.id })
                                  : lineApi.addModifier(orderId, { orderDetailId: id, modifierItemId: item.id, price: extra }),
                              )
                            }
                            style={[styles.option, on && styles.optionOn]}
                          >
                            <Text style={[styles.optionText, on && styles.optionTextOn]}>
                              {item.name}
                              {extra > 0 ? ` +${formatMoney(extra, currency)}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* Special instructions */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>{t('customize.instructions')}</Text>
              <Text style={styles.muted}>{t('customize.instructionsHint')}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currency}>$</Text>
                <Input
                  value={notePrice}
                  onChangeText={setNotePrice}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t('customize.instructionsPrice')}
                  style={styles.priceInput}
                />
              </View>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder={t('customize.instructionsPlaceholder')}
                multiline
                maxLength={500}
                style={styles.textarea}
                accessibilityLabel={t('customize.instructions')}
              />
              <Button title={t('customize.applyNotes')} disabled={busy || !noteChanged} onPress={() => void applyNotes()} />
            </Card>

            {/* Manual discount */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>$ {t('customize.manualDiscount')}</Text>
              <View style={styles.discountRow}>
                <View style={styles.flex}>
                  <Text style={styles.label}>{t('customize.discountType')}</Text>
                  <Segmented
                    options={[
                      { value: 'AMOUNT', label: t('customize.discountAmount') },
                      { value: 'PERCENTAGE', label: t('customize.discountPercent') },
                    ]}
                    value={discountType}
                    onChange={setDiscountType}
                  />
                </View>
                <View style={styles.valueBox}>
                  <Text style={styles.label}>{t('customize.discountValue')}</Text>
                  <Input
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t('customize.discountValue')}
                  />
                </View>
              </View>
              <Button title={t('customize.applyDiscount')} disabled={busy} onPress={() => void applyDiscount()} />
            </Card>

            {/* Promotions */}
            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>🏷 {t('customize.promotions')}</Text>
              {promotions.length === 0 ? (
                <Text style={[styles.muted, styles.center]}>{t('customize.noPromotions')}</Text>
              ) : (
                promotions.map((p) => {
                  const on = applied.has(p.discountId);
                  const d = p.discount;
                  const value =
                    d?.value != null ? (d.discountType === 'PERCENTAGE' ? `${d.value}%` : formatMoney(d.value, currency)) : '';
                  return (
                    <Pressable
                      key={p.discountId}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: busy }}
                      disabled={busy}
                      onPress={() =>
                        void run(() =>
                          on
                            ? lineApi.removePromotion(orderId, { itemId: id, discountId: p.discountId, name: d?.title ?? p.discountId })
                            : lineApi.addPromotion(orderId, { itemId: id, discountId: p.discountId, name: d?.title ?? p.discountId }),
                        )
                      }
                      style={[styles.promotion, on && styles.optionOn]}
                    >
                      <Text style={[styles.optionText, on && styles.optionTextOn]}>
                        {d?.title ?? p.discountId} {value ? `· ${value}` : ''}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.lg, paddingHorizontal: space.xl * 2 },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  close: { position: 'absolute', right: space.lg, top: space.lg },
  closeText: { fontSize: 20, color: colors.mutedForeground },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  card: { padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.border },
  infoTop: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: font.title, fontWeight: '700', color: colors.mutedForeground },
  name: { fontSize: font.title, fontWeight: '700', color: colors.foreground, lineHeight: 26 },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.background, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  dialogTitle: { fontSize: font.title, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  dialogText: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  dialogQty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  center: { textAlign: 'center', paddingVertical: space.md },
  infoRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  infoText: { fontSize: font.body, color: colors.foreground },
  totalBox: { flexDirection: 'row', alignItems: 'baseline' },
  total: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  discountNote: { fontSize: font.small, color: colors.success, textAlign: 'right' },
  sectionTitle: { fontSize: font.body, fontWeight: '600', color: colors.foreground },
  statusBlock: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  resentNote: { fontSize: font.small, color: colors.warning, paddingHorizontal: space.md, paddingBottom: space.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.md,
  },
  statusIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  statusLabel: { fontSize: font.body, color: colors.foreground },
  statusWhen: { fontSize: 11, color: colors.mutedForeground, marginTop: 1 },
  count: { minWidth: 26, paddingHorizontal: 6, height: 24, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  countPending: { backgroundColor: colors.warningBg },
  countServed: { backgroundColor: colors.successBg },
  countText: { fontSize: font.small, fontWeight: '700', color: colors.foreground },
  edit: { paddingHorizontal: 6 },
  editDisabled: { opacity: 0.35 },
  editText: { fontSize: 18, color: colors.foreground },
  group: { gap: space.sm },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: font.small, color: colors.foreground },
  optionTextOn: { color: colors.primaryForeground },
  promotion: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  currency: { fontSize: font.body, color: colors.mutedForeground },
  priceInput: { flex: 1, borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingHorizontal: 0 },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: space.sm },
  discountRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  valueBox: { width: 96 },
  label: { fontSize: font.small, fontWeight: '500', color: colors.foreground, marginBottom: 6 },
});
