import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CartDiscountType } from '@/lib/cart-discount';
import { phoneQuery, type CustomerRow } from '@/lib/customers';
import { formatMoney, type CurrencyCode } from '@/lib/money';
import { retailDiscount, type RetailDiscount, type RetailLine } from '@/lib/retail';
import { useSession } from '@/lib/session';
import { Text } from '@/ui/text';
import { Button, Input, Segmented } from './components';
import { colors, font, radius, space } from './theme';

function Sheet({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
      </View>
    </Modal>
  );
}

/**
 * The sale's customer, like the web POS customer dialog: search by phone (the saved list works offline), or
 * the walk-in customer.
 */
export function RetailCustomerSheet({ current, onPick, onClose }: { current: CustomerRow | null; onPick: (c: CustomerRow | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<CustomerRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const h = setTimeout(() => {
      const q = phone.trim() ? `&phone=${encodeURIComponent(phoneQuery(phone))}` : '';
      api.getOrSaved<{ result?: { data: CustomerRow[] } }>(`/api/auth/customer?limit=20&offset=0${q}`).then(
        (r) => {
          if (!cancelled) setRows(r.result?.data ?? []);
        },
        () => {
          if (!cancelled) setRows([]);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [api, phone]);

  return (
    <Sheet title={t('retail.customer')} onClose={onClose} footer={<Button title={t('common.close')} variant="outline" onPress={onClose} />}>
      <Input value={phone} onChangeText={setPhone} placeholder={t('retail.customerSearch')} keyboardType="phone-pad" autoFocus />
      <Pressable onPress={() => onPick(null)} accessibilityRole="button" style={[styles.row, !current && styles.rowOn]}>
        <Text style={styles.rowTitle}>{t('retail.walkIn')}</Text>
      </Pressable>
      {rows === null ? <Text style={styles.muted}>…</Text> : rows.length === 0 ? <Text style={styles.muted}>{t('retail.noCustomer')}</Text> : null}
      {(rows ?? []).map((c) => (
        <Pressable key={c.id} onPress={() => onPick(c)} accessibilityRole="button" style={[styles.row, current?.id === c.id && styles.rowOn]}>
          <Text style={styles.rowTitle}>{c.customerName || c.phone}</Text>
          <Text style={styles.muted}>{[c.phone, c.address].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

/** A discount on the whole sale, like the web POS discount sheet: a percentage or an amount, with the new total. */
export function RetailDiscountSheet({ cart, current, currency, onApply, onClose }: { cart: RetailLine[]; current: RetailDiscount | null; currency: CurrencyCode; onApply: (d: RetailDiscount | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [type, setType] = useState<CartDiscountType>(current?.type ?? 'PERCENTAGE');
  const [text, setText] = useState(current ? String(current.value) : '');
  const value = Number(text.replace(/,/g, '')) || 0;
  const before = retailDiscount(cart, null).total;
  const after = retailDiscount(cart, { type, value });
  const tooMuch = value > 0 && after.off === 0;
  const money = (v: number) => formatMoney(v, currency);

  return (
    <Sheet
      title={t('retail.discount')}
      onClose={onClose}
      footer={
        <View style={styles.buttons}>
          {current ? <Button title={t('retail.removeDiscount')} variant="outline" onPress={() => onApply(null)} style={styles.flex} /> : null}
          <Button title={t('retail.applyDiscount')} disabled={!(value > 0) || tooMuch} onPress={() => onApply({ type, value })} style={styles.flex} />
        </View>
      }
    >
      <Segmented
        options={[
          { value: 'PERCENTAGE', label: '%' },
          { value: 'AMOUNT', label: currency === 'KHR' ? '៛' : '$' },
        ]}
        value={type}
        onChange={setType}
      />
      <Input value={text} onChangeText={setText} placeholder={type === 'PERCENTAGE' ? '10' : '1.00'} keyboardType="decimal-pad" autoFocus />
      {tooMuch ? <Text style={styles.error}>{t(type === 'PERCENTAGE' ? 'retail.discountPercent' : 'retail.discountAmount')}</Text> : null}
      <View style={styles.summary}>
        <View style={styles.line}>
          <Text style={styles.muted}>{t('retail.subtotal')}</Text>
          <Text style={styles.value}>{money(before)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.muted}>{t('retail.discount')}</Text>
          <Text style={styles.value}>− {money(after.off)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.total}>{t('retail.total')}</Text>
          <Text style={styles.total}>{money(after.total)}</Text>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { padding: space.lg, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.heading, fontWeight: '800', color: colors.foreground },
  body: { padding: space.lg, gap: space.md },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  buttons: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  row: { padding: space.md, gap: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowOn: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  rowTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  summary: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { fontSize: font.body, color: colors.foreground },
  total: { fontSize: font.title, fontWeight: '800', color: colors.foreground },
});
