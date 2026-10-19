import * as Print from 'expo-print';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitTitle } from '@/lib/menu';
import { formatMoney } from '@/lib/money';
import { otherCurrencyValue } from '@/lib/payment';
import { receiptHtml, receiptText, type Receipt, type ReceiptLabels } from '@/lib/receipt';
import { Badge, Button, Card } from './components';
import { colors, font, radius, space } from './theme';

/** The receipt of a paid order, with Share (text) and Print (system print dialog, any printer). */
export function ReceiptSheet({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (!receipt) return null;

  const labels: ReceiptLabels = {
    title: t('receipt.title'),
    invoice: t('receipt.invoice'),
    table: t('receipt.table'),
    cashier: t('receipt.cashier'),
    guests: t('receipt.guests'),
    date: t('receipt.date'),
    total: t('receipt.total'),
    discount: t('receipt.discount'),
    paid: t('receipt.paid'),
    change: t('receipt.change'),
    thanks: t('receipt.thanks'),
    notSent: t('receipt.notSent'),
  };
  const money = (v: number) => formatMoney(v, receipt.currency);
  const other = otherCurrencyValue(receipt.total, receipt.currency, receipt.exchangeRate);

  async function share() {
    try {
      await Share.share({ message: receiptText(receipt!, labels) });
    } catch {
      // closed without sharing
    }
  }

  async function print() {
    try {
      await Print.printAsync({ html: receiptHtml(receipt!, labels) });
    } catch (e) {
      Alert.alert(t('receipt.printFailed'), e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.title}>{t('receipt.title')}</Text>
            {receipt.offline ? <Badge tone="info" text={t('receipt.notSent')} /> : null}
            {receipt.invoiceNo ? <Text style={styles.meta}>{t('receipt.invoice')}: #{receipt.invoiceNo}</Text> : null}
            {receipt.tableName ? <Text style={styles.meta}>{t('receipt.table')}: {receipt.tableName}</Text> : null}
            {receipt.cashier ? <Text style={styles.meta}>{t('receipt.cashier')}: {receipt.cashier}</Text> : null}
            {receipt.paidAt ? <Text style={styles.meta}>{t('receipt.date')}: {receipt.paidAt}</Text> : null}
            <View style={styles.rule} />
            {receipt.lines.map((l, i) => (
              <View key={i}>
                <View style={styles.row}>
                  <Text style={styles.item}>
                    {l.qty} × {splitTitle(l.title).name}
                  </Text>
                  <Text style={styles.item}>{money(l.total)}</Text>
                </View>
                {l.extras.map((e, k) => (
                  <Text key={k} style={styles.extra}>
                    + {e}
                  </Text>
                ))}
              </View>
            ))}
            <View style={styles.rule} />
            {receipt.discount > 0 ? (
              <View style={styles.row}>
                <Text style={styles.item}>{t('receipt.discount')}</Text>
                <Text style={styles.item}>-{money(receipt.discount)}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.totalLabel}>{t('receipt.total')}</Text>
              <View style={styles.right}>
                <Text style={styles.totalLabel}>{money(receipt.total)}</Text>
                <Text style={styles.meta}>≈ {formatMoney(other.amount, other.currency)}</Text>
              </View>
            </View>
            {receipt.payments.map((p, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.item}>
                  {t('receipt.paid')} · {p.method}
                </Text>
                <Text style={styles.item}>{formatMoney(p.amount, p.currency)}</Text>
              </View>
            ))}
            {receipt.change > 0 ? (
              <View style={styles.row}>
                <Text style={styles.item}>{t('receipt.change')}</Text>
                <Text style={styles.item}>{money(receipt.change)}</Text>
              </View>
            ) : null}
            <Text style={[styles.meta, styles.center]}>{t('receipt.thanks')}</Text>
          </Card>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('receipt.share')} variant="outline" onPress={() => void share()} style={styles.flex} />
          <Button title={t('receipt.print')} variant="outline" onPress={() => void print()} style={styles.flex} />
          <Button title={t('receipt.done')} onPress={onClose} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md },
  card: { padding: space.lg, gap: space.sm, borderRadius: radius.lg },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  meta: { fontSize: font.small, color: colors.mutedForeground },
  center: { textAlign: 'center', marginTop: space.md },
  rule: { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed', marginVertical: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  right: { alignItems: 'flex-end' },
  item: { fontSize: font.body, color: colors.foreground, flexShrink: 1 },
  extra: { fontSize: 12, color: colors.mutedForeground, paddingLeft: space.md },
  totalLabel: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
