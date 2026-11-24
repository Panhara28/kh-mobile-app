import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CheckoutPayment, PaymentMethod } from '@/lib/api';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import {
  canCompletePayment,
  newPayment,
  otherCurrencyValue,
  paymentTotals,
  setPaymentAmount,
  setPaymentCurrency,
  toCheckoutPayments,
  type PaymentContext,
  type PaymentDraft,
} from '@/lib/payment';
import { Button, Card, Chip, Field, Segmented } from './components';
import { colors, font, radius, space } from './theme';

/**
 * "Payment Processing" like the kh-pos web payment dialog: one or more payment lines (method,
 * USD or KHR, amount), what is received, what is still to pay or to give back as change.
 */
export function CheckoutSheet({
  total,
  currency,
  exchangeRate,
  methods,
  busy,
  onClose,
  onComplete,
}: {
  total: number;
  currency: CurrencyCode;
  exchangeRate: number;
  methods: PaymentMethod[];
  busy: boolean;
  onClose: () => void;
  onComplete: (payments: CheckoutPayment[]) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ctx: PaymentContext = { branchCurrency: currency, exchangeRate };
  // A single method needs no choosing; the web starts with none selected.
  const [payments, setPayments] = useState<PaymentDraft[]>(() => [{ ...newPayment(), paymentMethod: methods.length === 1 ? methods[0]!.method_id : '' }]);

  const { received, remaining, change } = paymentTotals(payments, total);
  const other = otherCurrencyValue(total, currency, exchangeRate);
  const update = (i: number, next: PaymentDraft) => setPayments((prev) => prev.map((p, k) => (k === i ? next : p)));

  /** The amount still to pay, in this line's currency. */
  function exact(i: number) {
    const p = payments[i]!;
    const others = payments.reduce((a, q, k) => (k === i ? a : a + (Number(q.amountUsd) || 0)), 0);
    const left = Math.max(0, Math.round((total - others) * 100) / 100);
    const inLine = p.currency === 'USD' ? (currency === 'USD' ? left : left / exchangeRate) : currency === 'USD' ? left * exchangeRate : left;
    update(i, setPaymentAmount(p, String(Math.round(inLine * 100) / 100), ctx));
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('checkout.title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Card style={styles.card}>
              <Text style={styles.muted}>{t('checkout.exchangeRate', { rate: exchangeRate.toLocaleString('en-US') })}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>{t('checkout.total')}</Text>
                <View style={styles.right}>
                  <Text style={styles.big}>{formatMoney(total, currency)}</Text>
                  <Text style={styles.muted}>≈ {formatMoney(other.amount, other.currency)}</Text>
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t('checkout.received')}</Text>
                <Text style={[styles.value, { color: colors.success }]}>{formatMoney(received, currency)}</Text>
              </View>
              {remaining > 0 ? (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.warning }]}>{t('checkout.remaining')}</Text>
                  <Text style={[styles.value, { color: colors.warning }]}>{formatMoney(remaining, currency)}</Text>
                </View>
              ) : change > 0 ? (
                <View style={styles.row}>
                  <Text style={[styles.label, { color: colors.success }]}>{t('checkout.change')}</Text>
                  <Text style={[styles.value, { color: colors.success }]}>{formatMoney(change, currency)}</Text>
                </View>
              ) : null}
            </Card>

            {methods.length === 0 ? <Text style={styles.warning}>{t('checkout.noMethods')}</Text> : null}

            {payments.map((p, i) => (
              <Card key={i} style={styles.card}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {methods.map((m) => (
                    <Chip key={m.method_id} label={m.method ?? m.method_id} selected={p.paymentMethod === m.method_id} onPress={() => update(i, { ...p, paymentMethod: m.method_id })} />
                  ))}
                </ScrollView>
                <Segmented
                  options={[
                    { value: 'USD', label: 'USD $' },
                    { value: 'KHR', label: 'KHR ៛' },
                  ]}
                  value={p.currency}
                  onChange={(c) => update(i, setPaymentCurrency(p, c, ctx))}
                />
                <Field
                  label={t('checkout.amount')}
                  value={p.amount}
                  onChangeText={(text) => update(i, setPaymentAmount(p, text, ctx))}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  autoFocus={i === 0}
                />
                {p.currency === 'KHR' ? <Text style={styles.muted}>≈ {formatMoney(Number(p.amountUsd) || 0, currency)}</Text> : null}
                <View style={styles.rowButtons}>
                  <Button title={t('checkout.exact')} variant="outline" size="sm" onPress={() => exact(i)} />
                  {payments.length > 1 ? <Button title={t('checkout.removePayment')} variant="ghost" size="sm" onPress={() => setPayments((prev) => prev.filter((_, k) => k !== i))} /> : null}
                </View>
              </Card>
            ))}

            <Button title={`+ ${t('checkout.addPayment')}`} variant="outline" onPress={() => setPayments((prev) => [...prev, newPayment()])} />
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            title={remaining > 0 ? t('checkout.incomplete') : t('checkout.complete')}
            size="lg"
            loading={busy}
            disabled={!canCompletePayment(payments, total)}
            onPress={() => onComplete(toCheckoutPayments(payments, total, ctx))}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  close: { fontSize: 20, color: colors.mutedForeground, padding: 4 },
  content: { padding: space.md, gap: space.md },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  right: { alignItems: 'flex-end' },
  label: { fontSize: font.body, color: colors.foreground },
  value: { fontSize: font.title, fontWeight: '700' },
  big: { fontSize: font.heading, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  warning: { fontSize: font.small, color: colors.warning, textAlign: 'center' },
  chips: { gap: 6 },
  rowButtons: { flexDirection: 'row', gap: space.sm },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
