import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { useStoreKind } from '@/lib/use-modules';
import { customerBody, emptyCustomer, phoneQuery, validateCustomer, type CustomerForm, type CustomerRow, type ServedType } from '@/lib/customers';
import { useRecordWriter } from '@/lib/offline/use-record';
import { Button, Card, Field, Segmented } from './components';
import { NumberField } from './form-fields';
import { colors, font, radius, space } from './theme';

/**
 * "Order type" like the kh-pos web sheet: dine in, take away or delivery. A delivery is for a
 * customer found by phone number (or added here); kh-pos adds that customer's delivery fee to the prices.
 */
export function OrderTypeSheet({
  api,
  current,
  busy,
  onClose,
  onApply,
}: {
  api: KhPosApi;
  current: ServedType;
  busy: boolean;
  onClose: () => void;
  onApply: (type: ServedType, customer: CustomerRow | null) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lite = useStoreKind().edition === 'LITE';
  const [type, setType] = useState<ServedType>(current);
  const [phone, setPhone] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [chosen, setChosen] = useState<CustomerRow | null>(null);
  const [adding, setAdding] = useState<CustomerForm | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const writer = useRecordWriter();

  // search customers as the number is typed
  useEffect(() => {
    if (type !== 'food_delivery') return;
    let cancelled = false;
    const h = setTimeout(() => {
      api
        .getOrSaved<{ result?: { data: CustomerRow[] } }>(`/api/auth/customer?limit=20&offset=0&type=delivery${phone ? `&phone=${encodeURIComponent(phoneQuery(phone))}` : ''}`)
        .then((r) => !cancelled && setResults(r.result?.data ?? []))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [api, phone, type]);

  async function addCustomer() {
    if (!adding) return;
    const bad = validateCustomer(adding);
    if (bad) {
      setProblem(bad);
      return;
    }
    setSaving(true);
    try {
      // sent at once, or kept on the phone and sent once when kh-pos can be reached
      const how = await writer({ entity: 'delivery', op: 'create', recordId: `new:${adding.phone}:${Date.now()}`, method: 'POST', path: '/api/auth/customer', body: customerBody(adding), once: true, label: adding.customerName.trim() || adding.phone });
      if (how === 'queued') {
        // the order type needs the customer kh-pos makes: choose it again once the customer has been sent
        Alert.alert(t('offline.savedOffline'));
        setAdding(null);
        return;
      }
      const found = await api.call<{ result?: { data: CustomerRow[] } }>('GET', `/api/auth/customer?limit=5&offset=0&phone=${encodeURIComponent(phoneQuery(adding.phone))}`);
      const created = found.result?.data?.[0] ?? null;
      setChosen(created);
      setAdding(null);
      setPhone(adding.phone);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('orderType.title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Segmented
              options={[
                { value: 'dine_in', label: t('orderType.dine_in') },
                { value: 'take_away', label: t('orderType.take_away') },
                // a small restaurant has no delivery, like the web; an order already marked delivery keeps the option
                ...(lite && current !== 'food_delivery' ? [] : [{ value: 'food_delivery', label: t('orderType.food_delivery') }]),
              ]}
              value={type}
              onChange={(v) => setType(v as ServedType)}
            />
            {type === 'food_delivery' ? (
              <>
                {chosen ? (
                  <Card style={styles.card}>
                    <Text style={styles.heading}>{chosen.customerName}</Text>
                    <Text style={styles.muted}>{[chosen.phone, chosen.address].filter(Boolean).join(' · ')}</Text>
                    {Number(chosen.extraPrice) > 0 ? <Text style={styles.fee}>{t('orderType.fee', { amount: Number(chosen.extraPrice) })}</Text> : null}
                    <Button title={t('orderType.change')} variant="ghost" size="sm" onPress={() => setChosen(null)} />
                  </Card>
                ) : adding ? (
                  <Card style={styles.card}>
                    <Field label={t('orderType.customerName')} value={adding.customerName} onChangeText={(v) => setAdding({ ...adding, customerName: v })} error={problem === 'customerName' ? t('admin.required') : undefined} />
                    <Field label={t('users.phone')} value={adding.phone} onChangeText={(v) => setAdding({ ...adding, phone: v })} keyboardType="phone-pad" error={problem === 'phone' ? t('admin.required') : undefined} />
                    <Field label={t('suppliers.address')} value={adding.address} onChangeText={(v) => setAdding({ ...adding, address: v })} />
                    <NumberField label={t('orderType.extraPrice')} value={adding.extraPrice} decimal onChange={(n) => setAdding({ ...adding, extraPrice: n })} />
                    <View style={styles.row}>
                      <Button title={t('common.cancel')} variant="outline" onPress={() => setAdding(null)} style={styles.flex} />
                      <Button title={t('customize.save')} loading={saving} onPress={() => void addCustomer()} style={styles.flex} />
                    </View>
                  </Card>
                ) : (
                  <>
                    <Field label={t('orderType.searchPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                    {results.map((c) => (
                      <Pressable key={c.id} onPress={() => setChosen(c)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
                        <Card style={styles.card}>
                          <Text style={styles.heading}>{c.customerName}</Text>
                          <Text style={styles.muted}>{[c.phone, c.address].filter(Boolean).join(' · ')}</Text>
                        </Card>
                      </Pressable>
                    ))}
                    <Button title={`+ ${t('orderType.newCustomer')}`} variant="outline" onPress={() => { setProblem(null); setAdding({ ...emptyCustomer(), phone }); }} />
                  </>
                )}
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('orderType.apply')} size="lg" loading={busy} disabled={type === 'food_delivery' && !chosen} onPress={() => onApply(type, chosen)} />
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
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  fee: { fontSize: font.small, color: colors.success, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
