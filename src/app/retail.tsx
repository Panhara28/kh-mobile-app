import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CheckoutPayment, PaymentMethod } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { methodNames, receiptFromDetail, type Receipt } from '@/lib/receipt';
import { addToCart, cartCount, cartTotal, matchBarcode, retailOrderBody, setQty, type RetailLine, type RetailProduct } from '@/lib/retail';
import { useSession } from '@/lib/session';
import type { ProductListItem } from '@/lib/products';
import { useBranch } from '@/lib/use-branch';
import { useShift } from '@/lib/use-shift';
import { Button, Card, Input } from '@/ui/components';
import { CheckoutSheet } from '@/ui/checkout-sheet';
import { ReceiptSheet } from '@/ui/receipt-sheet';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

type Found = Omit<ProductListItem, 'productVariants'> & { productVariants?: { id: string; name: string; price: number | null; barcode?: string | null }[] };

function toProducts(rows: Found[]): RetailProduct[] {
  return rows.flatMap((p) =>
    (p.productVariants ?? []).map((v) => ({
      variantId: v.id,
      productId: p.id,
      name: v.name && v.name !== 'ns' ? `${p.title} (${v.name})` : p.title,
      price: Number(v.price) || 0,
      barcode: v.barcode ?? '',
    })),
  );
}

/**
 * Retail POS: sell products without a table. Search or scan a barcode, adjust the cart, then Charge:
 * the sale is opened in kh-pos, paid with the same payment screen as a table, and a receipt shown.
 * It needs kh-pos (the stock and invoice number come from it), so Charge asks to be online.
 */
export default function RetailScreen() {
  const { t } = useTranslation();
  const { api } = useSession();
  const { data } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { warehouseId, currency, exchangeRate } = useBranch();
  const { shift, reload: reloadShift } = useShift();

  const [text, setText] = useState('');
  const [found, setFound] = useState<RetailProduct[]>([]);
  const [cart, setCart] = useState<RetailLine[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<{ orderId: string; slotId: string } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const lastScan = useRef({ code: '', at: 0 });

  useFocusEffect(
    useCallback(() => {
      data.paymentMethods().then((r) => setMethods(r.data), () => undefined);
      void reloadShift();
    }, [data, reloadShift]),
  );

  // search as the cashier types
  useEffect(() => {
    let cancelled = false;
    const h = setTimeout(() => {
      const q = new URLSearchParams({ limit: '30', offset: '0' });
      if (text.trim()) q.set('searchTitle', text.trim());
      api
        .call<{ result?: { data: Found[] } }>('GET', `/api/product-v2?${q.toString()}`)
        .then((r) => !cancelled && setFound(toProducts(r.result?.data ?? [])))
        .catch(() => !cancelled && setFound([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [api, text]);

  const add = (p: RetailProduct) => setCart((c) => addToCart(c, p, () => Crypto.randomUUID()));

  /** A scanned code: add the product with that barcode, or say it was not found. */
  async function onCode(code: string) {
    const now = Date.now();
    if (code === lastScan.current.code && now - lastScan.current.at < 2000) return; // the camera reports the same code many times
    lastScan.current = { code, at: now };
    let match = matchBarcode(found, code);
    if (!match) {
      try {
        const r = await api.call<{ result?: { data: Found[] } }>('GET', `/api/product-v2?limit=30&offset=0&searchTitle=${encodeURIComponent(code)}`);
        match = matchBarcode(toProducts(r.result?.data ?? []), code);
      } catch {
        match = null;
      }
    }
    if (match) add(match);
    else Alert.alert(t('retail.notFound', { code }));
  }

  async function openScanner() {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(t('retail.cameraDenied'));
        return;
      }
    }
    setScanning(true);
  }

  function charge() {
    if (cart.length === 0) return;
    if (!shift) {
      Alert.alert(t('checkout.noShift'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('checkout.openShift'), onPress: () => router.push('/shift') },
      ]);
      return;
    }
    guard(async () => {
      setBusy(true);
      try {
        const info = await api.posInfo(warehouseId);
        const need = (await api.stockToTransfer(cart.map((l) => ({ variantId: l.variantId, toFindQty: l.qty })))).filter((x) => x.slot && x.slot.posSlot === false);
        if (need.length > 0) {
          Alert.alert(t('checkout.needStock'));
          return;
        }
        const invoiceNo = await api.nextInvoiceNumber();
        const orderId = (await api.call<{ result?: string }>('POST', '/api/pos/order', retailOrderBody({ warehouseId, slotId: info.posSlotId, customerId: info.posCustomerId, invoiceNo }, cart))).result;
        if (!orderId) throw new Error('No order id returned');
        setPay({ orderId, slotId: info.posSlotId });
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  /** The cashier backed out of payment: the opened order is removed so it is not left behind. */
  async function cancelPay() {
    const p = pay;
    setPay(null);
    if (p) await api.deleteOrder(p.orderId).catch(() => undefined);
  }

  async function complete(payments: CheckoutPayment[]) {
    const p = pay;
    if (!p) return;
    setBusy(true);
    try {
      await api.checkout(p.orderId, { slotId: p.slotId, payments });
      setPay(null);
      setCart([]);
      try {
        setReceipt(receiptFromDetail(await api.orderDetail(p.orderId), { names: new Map(), methods: methodNames(methods), exchangeRate, currency }));
      } catch {
        Alert.alert(t('retail.paid'));
      }
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const total = cartTotal(cart);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.retail')} />
      <View style={styles.search}>
        <Input
          style={styles.flex}
          value={text}
          onChangeText={setText}
          placeholder={t('retail.search')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            const m = matchBarcode(found, text);
            if (m) {
              add(m);
              setText('');
            }
          }}
          accessibilityLabel={t('retail.search')}
        />
        <Button title={t('retail.scan')} variant="outline" onPress={() => void openScanner()} />
      </View>

      <FlatList
        data={found}
        keyExtractor={(p) => p.variantId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.muted}>{t('products.empty')}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => add(item)} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.heading} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.value}>{formatMoney(item.price, currency)}</Text>
              </View>
              {item.barcode ? <Text style={styles.muted}>{item.barcode}</Text> : null}
            </Card>
          </Pressable>
        )}
      />

      {cart.length > 0 ? (
        <View style={[styles.cart, { paddingBottom: insets.bottom + space.md }]}>
          <FlatList
            data={cart}
            keyExtractor={(l) => l.lineId}
            style={styles.cartList}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <Text style={styles.cartName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Button title="−" variant="outline" size="sm" onPress={() => setCart((c) => setQty(c, item.variantId, item.qty - 1))} />
                <Text style={styles.qty}>{item.qty}</Text>
                <Button title="+" variant="outline" size="sm" onPress={() => setCart((c) => setQty(c, item.variantId, item.qty + 1))} />
                <Text style={styles.lineTotal}>{formatMoney(item.price * item.qty, currency)}</Text>
              </View>
            )}
          />
          <View style={styles.row}>
            <Text style={styles.heading}>{t('retail.items', { count: cartCount(cart) })}</Text>
            <Text style={styles.heading}>{formatMoney(total, currency)}</Text>
          </View>
          <View style={styles.row}>
            <Button title={t('retail.clear')} variant="outline" onPress={() => setCart([])} style={styles.flex} />
            <Button title={`${t('retail.charge')} ${formatMoney(total, currency)}`} loading={busy} onPress={charge} style={styles.flex} />
          </View>
        </View>
      ) : null}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanner}>
          <CameraView style={styles.flex} facing="back" onBarcodeScanned={(r) => void onCode(r.data)} />
          <View style={[styles.scanFooter, { paddingBottom: insets.bottom + space.md }]}>
            <Text style={styles.scanText}>{t('retail.scanHint', { count: cartCount(cart) })}</Text>
            <Button title={t('retail.done')} onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>

      {pay ? <CheckoutSheet total={total} currency={currency} exchangeRate={exchangeRate} methods={methods} busy={busy} onClose={() => void cancelPay()} onComplete={(p) => void complete(p)} /> : null}
      <ReceiptSheet receipt={receipt} onClose={() => setReceipt(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 2, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  value: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  cart: { gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cartList: { maxHeight: 190 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
  cartName: { flex: 1, fontSize: font.body, color: colors.foreground },
  qty: { minWidth: 24, textAlign: 'center', fontSize: font.body, fontWeight: '700', color: colors.foreground },
  lineTotal: { minWidth: 64, textAlign: 'right', fontSize: font.small, color: colors.mutedForeground },
  scanner: { flex: 1, backgroundColor: '#000' },
  scanFooter: { gap: space.sm, padding: space.md, backgroundColor: colors.card },
  scanText: { fontSize: font.body, color: colors.foreground, textAlign: 'center' },
});
