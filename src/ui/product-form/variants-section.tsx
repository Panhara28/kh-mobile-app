import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KhPosApi } from '@/lib/api';
import { bindable, imagesFor, MAX_IMAGES_PER_VARIANT, patchVariant, removeComponent, removeVariant, setAllPrices, setComponent, setDiscountType, toggleBind, type ProductFormData, type VariantForm } from '@/lib/product-form';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { NumInput, ToggleRow } from './parts';
import { VariantPicker } from '@/ui/variant-picker';
import { colors, font, radius, space } from '@/ui/theme';

export interface PrinterRef {
  id: string;
  name: string;
  printerName?: string | null;
}

/**
 * "Product Variants" like the web table, one card per variant: pictures, name, price, discount,
 * barcode, low and ideal stock, purchase cost, composite components, visible, menu tags and the
 * kitchen printer — plus "Configure Options" and "Set price for all variants".
 */
export function VariantsSection({
  api,
  form,
  onChange,
  printers,
  currency,
  movie,
  onConfigure,
}: {
  api: KhPosApi;
  form: ProductFormData;
  onChange: (f: ProductFormData) => void;
  printers: PrinterRef[];
  currency: string;
  movie: boolean;
  onConfigure: () => void;
}) {
  const { t } = useTranslation();
  const [allPrice, setAllPrice] = useState<number | null>(null);

  return (
    <View style={styles.box}>
      <Button title={t('pform.configureOptions')} variant="outline" onPress={onConfigure} disabled={movie} />
      {movie ? <Text style={styles.warn}>{t('pform.movieOneVariant')}</Text> : null}
      {form.options.length > 0 && !movie ? <Text style={styles.note}>{t('pform.optionsList', { names: form.options.map((o) => o.name).join(' • ') })}</Text> : null}

      {form.variants.length > 0 ? (
        <NumInput
          label={t('pform.setAllPrices')}
          value={allPrice}
          placeholder="0.00"
          onChange={(n) => {
            setAllPrice(n);
            onChange(setAllPrices(form, n ?? 0));
          }}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('pform.noVariants')}</Text>
          <Text style={styles.muted}>{t('pform.noVariantsHint')}</Text>
        </View>
      )}

      {form.variants.map((v, i) => (
        <VariantCard key={v.id} api={api} form={form} index={i} variant={v} onChange={onChange} printers={printers} currency={currency} />
      ))}
    </View>
  );
}

function VariantCard({ api, form, index, variant: v, onChange, printers, currency }: { api: KhPosApi; form: ProductFormData; index: number; variant: VariantForm; onChange: (f: ProductFormData) => void; printers: PrinterRef[]; currency: string }) {
  const { t } = useTranslation();
  const [binding, setBinding] = useState(false);
  const [picking, setPicking] = useState(false);
  const patch = (p: Partial<VariantForm>) => onChange(patchVariant(form, index, p));
  const bound = imagesFor(form, v.id);

  function confirm(title: string, message: string, action: string, run: () => void) {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: action, onPress: run },
    ]);
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.heading}>{v.name || t('pform.unnamed')}</Text>
          {v.isDefault ? <Badge tone="info" text={t('pform.default')} /> : null}
        </View>
        {form.variants.length > 1 ? (
          <Button
            title={t('admin.delete')}
            variant="ghost"
            size="sm"
            onPress={() => confirm(t('admin.deleteConfirm', { name: v.name }), '', t('admin.delete'), () => onChange(removeVariant(form, index)))}
          />
        ) : null}
      </View>

      <Pressable onPress={() => setBinding(true)} accessibilityRole="button" accessibilityLabel={t('pform.bindImages')} style={styles.imageRow}>
        {bound.map((im) => (
          <Image key={im.id} source={{ uri: im.url }} style={styles.thumb} resizeMode="contain" />
        ))}
        {bound.length < MAX_IMAGES_PER_VARIANT ? (
          <View style={[styles.thumb, styles.plus]}>
            <Text style={styles.plusText}>＋</Text>
          </View>
        ) : null}
        <Text style={styles.muted}>{t('pform.bindImages')}</Text>
      </Pressable>

      <NumInput label={t('pform.price', { currency })} value={v.price} onChange={(n) => patch({ price: n ?? 0 })} />

      <Text style={styles.label}>{t('pform.discount')}</Text>
      <View style={styles.chips}>
        <Chip label="—" selected={!v.discountType} onPress={() => onChange(setDiscountType(form, index, ''))} />
        <Chip label={currency} selected={v.discountType === 'AMOUNT'} onPress={() => onChange(setDiscountType(form, index, 'AMOUNT'))} />
        <Chip label="%" selected={v.discountType === 'PERCENTAGE'} onPress={() => onChange(setDiscountType(form, index, 'PERCENTAGE'))} />
      </View>
      {v.discountType ? <NumInput label={t('pform.discountValue')} value={v.discountValue} onChange={(n) => patch({ discountValue: n })} /> : null}

      <Text style={styles.label}>{t('pform.barcode')}</Text>
      <Input value={v.barcode} onChangeText={(x) => patch({ barcode: x })} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('pform.barcode')} />

      <View style={styles.pair}>
        <View style={styles.flex}>
          <NumInput label={t('pform.lowStock')} value={v.lowStockQty} decimal={false} onChange={(n) => patch({ lowStockQty: n })} />
        </View>
        <View style={styles.flex}>
          <NumInput label={t('pform.idealStock')} value={v.idealStockQty} decimal={false} onChange={(n) => patch({ idealStockQty: n })} />
        </View>
      </View>
      <NumInput label={t('pform.purchaseCost', { currency })} value={v.purchasedCost} onChange={(n) => patch({ purchasedCost: n ?? 0 })} />

      <ToggleRow
        label={t('pform.composite')}
        value={v.isComposite}
        onChange={(on) => confirm(on ? t('pform.enableComposite') : t('pform.disableComposite'), t(on ? 'pform.enableCompositeAsk' : 'pform.disableCompositeAsk'), t('common.confirm'), () => patch({ isComposite: on }))}
      />
      {v.isComposite ? (
        <View style={styles.composite}>
          <Button title={`+ ${t('pform.addComponent')}`} variant="outline" size="sm" onPress={() => setPicking(true)} />
          {v.compositeVariants.length === 0 ? <Text style={styles.warn}>{t('pform.componentRequired')}</Text> : null}
          {v.compositeVariants.map((c, k) => (
            <View key={c.variantId} style={styles.row}>
              {c.image ? <Image source={{ uri: c.image }} style={styles.small} resizeMode="contain" /> : null}
              <Text style={[styles.flex, styles.body]} numberOfLines={2}>
                {c.title || c.variantId}
              </Text>
              <Button title="−" variant="outline" size="sm" onPress={() => onChange(setComponent(form, index, { ...c, quantity: Math.max(1, c.quantity - 1) }))} />
              <Text style={styles.qty}>{c.quantity}</Text>
              <Button title="+" variant="outline" size="sm" onPress={() => onChange(setComponent(form, index, { ...c, quantity: c.quantity + 1 }))} />
              <Button title="✕" variant="ghost" size="sm" onPress={() => onChange(removeComponent(form, index, k))} />
            </View>
          ))}
        </View>
      ) : null}

      <ToggleRow
        label={t('pform.visible')}
        value={v.visible}
        onChange={(on) => confirm(on ? t('pform.makeVisible') : t('pform.makeHidden'), t(on ? 'pform.makeVisibleAsk' : 'pform.makeHiddenAsk'), t('common.confirm'), () => patch({ visible: on }))}
      />

      <Text style={styles.label}>{t('pform.menuTags')}</Text>
      <View style={styles.chips}>
        <Chip label={t('pform.popular')} selected={v.isPopular} onPress={() => patch({ isPopular: !v.isPopular })} />
        <Chip label={t('pform.new')} selected={v.isNew} onPress={() => patch({ isNew: !v.isNew })} />
        <Chip label={t('pform.mostOrder')} selected={v.isMostOrder} onPress={() => patch({ isMostOrder: !v.isMostOrder })} />
      </View>

      <Text style={styles.label}>{t('pform.kitchenPrinter')}</Text>
      <View style={styles.chips}>
        <Chip label={t('pform.categoryDefault')} selected={!v.printerId} onPress={() => patch({ printerId: null })} />
        {printers.map((p) => (
          <Chip key={p.id} label={p.printerName ? `${p.name} (${p.printerName})` : p.name} selected={v.printerId === p.id} onPress={() => patch({ printerId: p.id })} />
        ))}
        {v.printerId && !printers.some((p) => p.id === v.printerId) ? <Chip label={t('pform.unknownPrinter')} selected onPress={() => patch({ printerId: null })} /> : null}
      </View>

      <BindModal visible={binding} form={form} variant={v} onChange={onChange} onClose={() => setBinding(false)} />
      {picking ? (
        <VariantPicker
          api={api}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            onChange(setComponent(form, index, { variantId: p.variantId, quantity: 1, title: p.name }));
            setPicking(false);
          }}
        />
      ) : null}
    </Card>
  );
}

/** Tap a picture to bind it to the variant (up to two) or to free it again. */
function BindModal({ visible, form, variant, onChange, onClose }: { visible: boolean; form: ProductFormData; variant: VariantForm; onChange: (f: ProductFormData) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const list = bindable(form, variant.id);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.bindContent}>
          <Text style={styles.heading}>{t('pform.bindHint', { name: variant.name })}</Text>
          {list.length === 0 ? <Text style={styles.muted}>{t('pform.noImagesToBind')}</Text> : null}
          <View style={styles.grid}>
            {list.map((im) => {
              const selected = im.productVariantId === variant.id;
              return (
                <Pressable key={im.id} onPress={() => onChange(toggleBind(form, im.id, variant.id))} accessibilityRole="button" style={[styles.bindTile, selected && styles.bindSelected]}>
                  <Image source={{ uri: im.url }} style={styles.bindImage} resizeMode="contain" />
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button title={t('common.close')} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  box: { gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.body, color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  note: { fontSize: font.small, color: colors.primary },
  warn: { fontSize: font.small, color: colors.warning },
  empty: { alignItems: 'center', padding: space.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg, gap: 4 },
  emptyTitle: { fontWeight: '700', color: colors.foreground },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.muted },
  plus: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  plusText: { fontSize: 18, color: colors.mutedForeground },
  composite: { gap: space.sm, paddingLeft: space.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  small: { width: 32, height: 32, borderRadius: radius.sm },
  qty: { minWidth: 24, textAlign: 'center', fontWeight: '700', color: colors.foreground },
  bindContent: { padding: space.md, gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bindTile: { width: 100, height: 100, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, overflow: 'hidden' },
  bindSelected: { borderColor: colors.primary, borderWidth: 2 },
  bindImage: { width: '100%', height: '100%' },
  check: { position: 'absolute', top: 4, right: 6, color: colors.success, fontSize: 18, fontWeight: '700' },
  footer: { padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
