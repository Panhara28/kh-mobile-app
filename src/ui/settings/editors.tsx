import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, StyleSheet, Switch, Text, View } from 'react-native';
import {
  ENVIRONMENTS,
  INVOICE_TEMPLATES,
  PADDING_SIDES,
  SYSTEM_TYPES,
  canAddKeyValue,
  canRemovePrinter,
  integrationValid,
  labelNumber,
  labelValueValid,
  newPrinterId,
  paddingAt,
  parseBrand,
  parseIntegrations,
  parseInventory,
  parseInvoice,
  parseKeyValues,
  parseLabelPrint,
  parseLabelValues,
  parseOrderDiscountRules,
  parsePort,
  parsePrintServer,
  parsePrintSocket,
  parseProductMenu,
  parseTypePos,
  printerValid,
  menuLink,
  serializeInvoice,
  stripCommas,
  serializeLabelPrint,
  serializeOrderDiscountRules,
  serializePrintServer,
  typePosWithSystem,
  withPadding,
  type IntegrationItem,
  type LabelValue,
  type OrderDiscountRules,
  type ServerPrinter,
  type SettingType,
} from '@/lib/settings-general';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Field } from '@/ui/components';
import { uploadBase64 } from '@/ui/product-form/images-section';
import { colors, font, radius, space } from '@/ui/theme';

export interface EditorProps {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  unit?: string;
  placeholder?: string;
}

// ---------- small pieces ----------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SwitchRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <Row label={label}>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </Row>
  );
}

function Hint({ text }: { text: string }) {
  return <Text style={styles.hint}>{text}</Text>;
}

function Choice({ label, options, value, onChange, disabled }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => !disabled && onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** Choose a picture from the library, upload it and hand back its address (5 MB at most, like the web). */
function ImageBox({ url, onChange, disabled, label }: { url: string; onChange: (v: string) => void; disabled: boolean; label: string }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const guard = useOnlineOnly();
  const [busy, setBusy] = useState(false);

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ['images'] });
    const a = r.assets?.[0];
    if (r.canceled || !a?.base64) return;
    if ((a.base64.length * 3) / 4 > 5 * 1024 * 1024) {
      Alert.alert(t('sg.fileTooLarge'));
      return;
    }
    guard(() => {
      void (async () => {
        setBusy(true);
        try {
          onChange(await uploadBase64(api, a.base64!));
        } catch (e) {
          Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(false);
        }
      })();
    });
  }

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.imageRow}>
        {url ? <Image source={{ uri: api.imageUrl(url) ?? url }} style={styles.image} resizeMode="contain" /> : <View style={[styles.image, styles.imageEmpty]} />}
        <View style={styles.grow}>
          {url ? <Text style={styles.hint} numberOfLines={1}>{url.split('/').pop()}</Text> : null}
          {!disabled ? (
            <View style={styles.buttons}>
              <Button title={url ? t('sg.replace') : t('sg.upload')} variant="outline" size="sm" loading={busy} onPress={() => void pick()} />
              {url ? <Button title={t('sg.remove')} variant="ghost" size="sm" onPress={() => onChange('')} /> : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ---------- simple editors ----------

export function NumberEditor({ value, onChange, disabled, unit, placeholder }: EditorProps) {
  return (
    <Field
      label={unit ?? ''}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      accessibilityLabel={placeholder ?? unit}
    />
  );
}

export function TextEditor({ value, onChange, disabled, placeholder }: EditorProps) {
  return <Field label="" value={value} onChangeText={onChange} editable={!disabled} placeholder={placeholder} autoCapitalize="none" autoCorrect={false} />;
}

export function CurrencyEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  return (
    <Choice
      label={t('sg.currency')}
      options={[
        { value: 'KHR', label: 'KHR - Cambodian Riel' },
        { value: 'USD', label: 'USD - US Dollar' },
      ]}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export function AccountingEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  return <SwitchRow label={value === '1' ? t('sg.enabled') : t('sg.disabled')} value={value === '1'} onChange={(v) => onChange(v ? '1' : '0')} disabled={disabled} />;
}

export function TypePosEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parseTypePos(value);
  const emit = (n: typeof v) => onChange(JSON.stringify(n));
  return (
    <View style={styles.stack}>
      <Choice label={t('sg.systemType')} options={SYSTEM_TYPES} value={v.system_type} onChange={(s) => emit(typePosWithSystem(v, s))} disabled={disabled} />
      <Choice label={t('sg.environment')} options={ENVIRONMENTS} value={v.enviroment} onChange={(e) => emit({ ...v, enviroment: e })} disabled={disabled} />
      {v.system_type === 'MART' || v.system_type === 'CINEMA' ? (
        <SwitchRow label={v.shared_order_draft ? t('sg.sharedDraftOn') : t('sg.sharedDraftOff')} value={v.shared_order_draft} onChange={(b) => emit({ ...v, shared_order_draft: b })} disabled={disabled} />
      ) : null}
    </View>
  );
}

export function InventoryEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parseInventory(value);
  return (
    <View style={styles.stack}>
      <Field label={t('sg.printerName')} value={v.print_name} onChangeText={(s) => onChange(JSON.stringify({ ...v, print_name: s }))} editable={!disabled} placeholder="Cashier Printer" />
      <SwitchRow label={v.restrict_product_lot ? t('sg.restrictLotOn') : t('sg.restrictLotOff')} value={v.restrict_product_lot} onChange={(b) => onChange(JSON.stringify({ ...v, restrict_product_lot: b }))} disabled={disabled} />
    </View>
  );
}

export function BrandEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parseBrand(value);
  const emit = (patch: Partial<typeof v>) => onChange(JSON.stringify({ ...v, ...patch }));
  return (
    <View style={styles.stack}>
      <Field label={t('sg.title')} value={v.title} onChangeText={(s) => emit({ title: s })} editable={!disabled} placeholder="My Brand" />
      <Field label={t('sg.description')} value={v.description} onChangeText={(s) => emit({ description: s })} editable={!disabled} placeholder={t('sg.shortDescription')} />
      <ImageBox label={t('sg.icon')} url={v.icon} onChange={(u) => emit({ icon: u })} disabled={disabled} />
    </View>
  );
}

export function QrCodeEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  return <ImageBox label={t('sg.qrImage')} url={value} onChange={onChange} disabled={disabled} />;
}

// ---------- invoice receipt ----------

export function InvoiceEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parseInvoice(value);
  const emit = (patch: Partial<typeof v>) => onChange(serializeInvoice({ ...v, ...patch }));
  const discountOptions = [
    { value: 'amount', label: t('sg.showAmount') },
    { value: 'percentage', label: t('sg.showPercent') },
  ];
  return (
    <View style={styles.stack}>
      <Choice label={t('sg.template')} options={INVOICE_TEMPLATES} value={v.template} onChange={(s) => emit({ template: s })} disabled={disabled} />
      <ImageBox label={t('sg.logo')} url={v.logoUrl} onChange={(u) => emit({ logoUrl: stripCommas(u) })} disabled={disabled} />
      <Field label={t('sg.invoiceTitle')} value={v.title} onChangeText={(s) => emit({ title: stripCommas(s) })} editable={!disabled} placeholder={t('sg.invoiceTitle')} />
      <Hint text={t('sg.noComma')} />
      <SwitchRow label={t('sg.autoReset')} value={v.autoResetEveryDay === '0'} onChange={(b) => emit({ autoResetEveryDay: b ? '0' : '1' })} disabled={disabled} />
      <SwitchRow label={t('sg.limitName')} value={v.limitProductName === '1'} onChange={(b) => emit({ limitProductName: b ? '1' : '0' })} disabled={disabled} />
      {v.limitProductName === '1' ? <Field label={t('sg.limitLines')} value={v.productNameLimitLine} onChangeText={(s) => emit({ productNameLimitLine: s })} editable={!disabled} keyboardType="number-pad" /> : null}
      <Choice label={t('sg.discountFormat')} options={discountOptions} value={v.discountDisplayFormat} onChange={(s) => emit({ discountDisplayFormat: s })} disabled={disabled} />
      <Hint text={t('sg.discountFormatHint')} />
      <Choice label={t('sg.totalDiscount')} options={[{ value: 'none', label: t('sg.doNotShow') }, ...discountOptions]} value={v.showTotalDiscount} onChange={(s) => emit({ showTotalDiscount: s })} disabled={disabled} />
      <Hint text={t('sg.totalDiscountHint')} />
      <Field label={t('sg.receiptCount')} value={v.receiptCountPerCheckout} onChangeText={(s) => emit({ receiptCountPerCheckout: s })} editable={!disabled} keyboardType="number-pad" />
      <Hint text={t('sg.receiptCountHint')} />
      <Text style={styles.label}>{t('sg.layout')}</Text>
      <View style={styles.grid}>
        {PADDING_SIDES.map((side, i) => (
          <View key={side} style={styles.gridCell}>
            <Field label={t(`sg.pad_${side}`)} value={paddingAt(v.settings, i)} onChangeText={(s) => emit({ settings: withPadding(v.settings, i, s) })} editable={!disabled} keyboardType="number-pad" />
          </View>
        ))}
      </View>
      <Hint text={t('sg.paddingHint')} />
    </View>
  );
}

// ---------- order discount rules ----------

export function OrderDiscountEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const r = parseOrderDiscountRules(value);
  const emit = (n: OrderDiscountRules) => onChange(serializeOrderDiscountRules(n));
  const types = [
    { value: 'PERCENTAGE', label: t('sg.percentage') },
    { value: 'AMOUNT', label: t('sg.fixedAmount') },
  ];
  const num = (s: string, fb: number) => (Number.isFinite(Number(s)) && s.trim() !== '' ? Number(s) : fb);
  return (
    <View style={styles.stack}>
      <Card>
        <Text style={styles.cardTitle}>{t('sg.largeOrders')}</Text>
        <SwitchRow label={t('sg.amountRuleOn')} value={r.amountRule.enabled} onChange={(b) => emit({ ...r, amountRule: { ...r.amountRule, enabled: b } })} disabled={disabled} />
        <Field label={t('sg.minSubtotal')} value={String(r.amountRule.min)} onChangeText={(s) => emit({ ...r, amountRule: { ...r.amountRule, min: num(s, 100) } })} editable={!disabled} keyboardType="decimal-pad" />
        <Choice label={t('sg.discountType')} options={types} value={r.amountRule.discountType} onChange={(s) => emit({ ...r, amountRule: { ...r.amountRule, discountType: s as 'AMOUNT' | 'PERCENTAGE' } })} disabled={disabled} />
        <Field label={r.amountRule.discountType === 'PERCENTAGE' ? t('sg.percentOff') : t('sg.amountOff')} value={String(r.amountRule.value)} onChangeText={(s) => emit({ ...r, amountRule: { ...r.amountRule, value: num(s, 0) } })} editable={!disabled} keyboardType="decimal-pad" />
        <Hint text={t('sg.amountRuleHint')} />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>{t('sg.manyItems')}</Text>
        <SwitchRow label={t('sg.qtyRuleOn')} value={r.qtyRule.enabled} onChange={(b) => emit({ ...r, qtyRule: { ...r.qtyRule, enabled: b } })} disabled={disabled} />
        <Field label={t('sg.minQty')} value={String(r.qtyRule.min)} onChangeText={(s) => emit({ ...r, qtyRule: { ...r.qtyRule, min: num(s, 50) } })} editable={!disabled} keyboardType="number-pad" />
        <Choice label={t('sg.discountType')} options={types} value={r.qtyRule.discountType} onChange={(s) => emit({ ...r, qtyRule: { ...r.qtyRule, discountType: s as 'AMOUNT' | 'PERCENTAGE' } })} disabled={disabled} />
        <Field label={r.qtyRule.discountType === 'PERCENTAGE' ? t('sg.percentOff') : t('sg.amountOff')} value={String(r.qtyRule.value)} onChangeText={(s) => emit({ ...r, qtyRule: { ...r.qtyRule, value: num(s, 0) } })} editable={!disabled} keyboardType="decimal-pad" />
        <Hint text={t('sg.qtyRuleHint')} />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>{t('sg.variantCap')}</Text>
        <SwitchRow label={t('sg.capOn')} value={r.maxQtyPerLine.enabled} onChange={(b) => emit({ ...r, maxQtyPerLine: { ...r.maxQtyPerLine, enabled: b } })} disabled={disabled} />
        <Field label={t('sg.capUnits')} value={String(r.maxQtyPerLine.value)} onChangeText={(s) => emit({ ...r, maxQtyPerLine: { ...r.maxQtyPerLine, value: num(s, 3) } })} editable={!disabled} keyboardType="number-pad" />
        <Choice
          label={t('sg.countBy')}
          options={[
            { value: 'VARIANT', label: t('sg.eachLine') },
            { value: 'PRODUCT', label: t('sg.eachProduct') },
            { value: 'CATEGORY', label: t('sg.eachCategory') },
          ]}
          value={r.maxQtyPerLine.countBy}
          onChange={(s) => emit({ ...r, maxQtyPerLine: { ...r.maxQtyPerLine, countBy: s as 'VARIANT' | 'PRODUCT' | 'CATEGORY' } })}
          disabled={disabled}
        />
        <Hint text={t('sg.capHint')} />
      </Card>
    </View>
  );
}

// ---------- product menu rules ----------

export function ProductMenuEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const v = parseProductMenu(value);
  const emit = (patch: Partial<typeof v>) => onChange(JSON.stringify({ ...v, ...patch }));
  return (
    <View style={styles.stack}>
      <SwitchRow label={t('sg.onlyForSale')} value={v.onlyForSale} onChange={(b) => emit({ onlyForSale: b })} disabled={disabled} />
      <SwitchRow label={t('sg.onlyInStock')} value={v.onlyInStock} onChange={(b) => emit({ onlyInStock: b })} disabled={disabled} />
      <ImageBox label={t('sg.banner')} url={v.bannerUrl} onChange={(u) => emit({ bannerUrl: u })} disabled={disabled} />
      <Text style={styles.label}>{t('sg.menuLink')}</Text>
      <Text selectable style={styles.link}>{menuLink(api.baseUrl, user?.currentWarehouseId)}</Text>
    </View>
  );
}

// ---------- printers ----------

function PrinterFields({ p, onChange, disabled }: { p: { name: string; printer_name: string; ip: string; port: number }; onChange: (n: typeof p) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <View>
      <Field label={t('sg.name')} value={p.name} onChangeText={(s) => onChange({ ...p, name: s })} editable={!disabled} placeholder="Cashier Printer" />
      <Field label={t('sg.deviceName')} value={p.printer_name} onChangeText={(s) => onChange({ ...p, printer_name: s })} editable={!disabled} placeholder="XP-80C" autoCapitalize="none" />
      <Field label={t('sg.ip')} value={p.ip} onChangeText={(s) => onChange({ ...p, ip: s })} editable={!disabled} placeholder="192.168.1.50" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
      <Field label={t('sg.port')} value={String(p.port)} onChangeText={(s) => onChange({ ...p, port: parsePort(s) })} editable={!disabled} keyboardType="number-pad" placeholder="9100" />
    </View>
  );
}

export function PrintServerEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parsePrintServer(value);
  const emit = (printers: ServerPrinter[], group_by = v.group_by) => onChange(serializePrintServer({ ...v, printers, group_by }));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<ServerPrinter | null>(null);
  const [fresh, setFresh] = useState({ name: '', printer_name: '', ip: '', port: 9100 });

  return (
    <View style={styles.stack}>
      <Choice
        label={t('sg.groupBy')}
        options={[
          { value: 'ITEM', label: t('sg.item') },
          { value: 'TABLE', label: t('sg.table') },
        ]}
        value={v.group_by}
        onChange={(g) => emit(v.printers, g)}
        disabled={disabled}
      />
      <Text style={styles.label}>{t('sg.printerCount', { count: v.printers.length })}</Text>
      {v.printers.map((p, i) => (
        <Card key={p.id ?? i}>
          {editing === i && draft ? (
            <View>
              <PrinterFields p={draft} onChange={(n) => setDraft({ ...draft, ...n })} disabled={disabled} />
              <View style={styles.buttons}>
                <Button
                  title={t('sg.save')}
                  size="sm"
                  onPress={() => {
                    const next = [...v.printers];
                    next[i] = draft;
                    emit(next);
                    setEditing(null);
                    setDraft(null);
                  }}
                />
                <Button title={t('common.cancel')} variant="ghost" size="sm" onPress={() => { setEditing(null); setDraft(null); }} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.cardTitle}>{p.name}</Text>
              <Text style={styles.hint}>{p.printer_name}</Text>
              <Text style={styles.mono}>{p.ip}:{p.port}</Text>
              {!disabled ? (
                <View style={styles.buttons}>
                  <Button title={t('sg.edit')} variant="outline" size="sm" onPress={() => { setEditing(i); setDraft({ ...p }); }} />
                  <Button title={t('sg.remove')} variant="ghost" size="sm" disabled={!canRemovePrinter(v.printers.length)} onPress={() => emit(v.printers.filter((_, k) => k !== i))} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      ))}
      {v.printers.length === 0 ? <Hint text={t('sg.noPrinters')} /> : null}
      {!disabled ? (
        <Card>
          <Text style={styles.cardTitle}>{t('sg.addPrinter')}</Text>
          <PrinterFields p={fresh} onChange={setFresh} disabled={false} />
          <Button
            title={t('sg.addPrinter')}
            disabled={!printerValid(fresh)}
            onPress={() => {
              emit([...v.printers, { ...fresh, id: newPrinterId() }]);
              setFresh({ name: '', printer_name: '', ip: '', port: 9100 });
            }}
          />
        </Card>
      ) : null}
    </View>
  );
}

export function PrintSocketEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parsePrintSocket(value);
  const emit = (n: typeof v) => onChange(JSON.stringify(n));
  return (
    <View style={styles.stack}>
      <Field label={t('sg.socketUrl')} value={v.url} onChangeText={(s) => emit({ ...v, url: s })} editable={!disabled} autoCapitalize="none" placeholder="ws://localhost:8181" />
      <PrinterFields p={v.printers} onChange={(n) => emit({ ...v, printers: { ...v.printers, ...n } })} disabled={disabled} />
      <Field label={t('sg.printServerIp')} value={v.print_server_ip} onChangeText={(s) => emit({ ...v, print_server_ip: s })} editable={!disabled} autoCapitalize="none" placeholder="192.168.1.100:8080" />
    </View>
  );
}

export function LabelPrintEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const v = parseLabelPrint(value);
  const emit = (n: typeof v) => onChange(serializeLabelPrint(n));
  const pad = (side: 'top' | 'right' | 'bottom' | 'left') => (
    <View key={side} style={styles.gridCell}>
      <Field label={t(`sg.pad_${side}`)} value={String(v.paperSize.padding[side] ?? '')} onChangeText={(s) => emit({ ...v, paperSize: { ...v.paperSize, padding: { ...v.paperSize.padding, [side]: labelNumber(s) } } })} editable={!disabled} keyboardType="decimal-pad" />
    </View>
  );
  return (
    <View style={styles.stack}>
      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Field label={t('sg.widthMm')} value={String(v.paperSize.width ?? '')} onChangeText={(s) => emit({ ...v, paperSize: { ...v.paperSize, width: labelNumber(s) } })} editable={!disabled} keyboardType="decimal-pad" />
        </View>
        <View style={styles.gridCell}>
          <Field label={t('sg.heightMm')} value={String(v.paperSize.height ?? '')} onChangeText={(s) => emit({ ...v, paperSize: { ...v.paperSize, height: labelNumber(s) } })} editable={!disabled} keyboardType="decimal-pad" />
        </View>
        {(['top', 'right', 'bottom', 'left'] as const).map(pad)}
      </View>
      <SwitchRow label={t('sg.showPrice')} value={v.price} onChange={(b) => emit({ ...v, price: b })} disabled={disabled} />
      <SwitchRow label={t('sg.useSocket')} value={v.using === 'SOCKET'} onChange={(b) => emit({ ...v, using: b ? 'SOCKET' : undefined })} disabled={disabled} />
      {v.using === 'SOCKET' ? <Field label={t('sg.socketPrinterName')} value={v.printerName ?? ''} onChangeText={(s) => emit({ ...v, printerName: s })} editable={!disabled} placeholder="Printer Name" /> : null}
      <SwitchRow label={t('sg.displayValue')} value={v.barcode.displayValue} onChange={(b) => emit({ ...v, barcode: { ...v.barcode, displayValue: b } })} disabled={disabled} />
      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Field label={t('sg.codeWidth')} value={String(v.barcode.width ?? '')} onChangeText={(s) => emit({ ...v, barcode: { ...v.barcode, width: labelNumber(s) } })} editable={!disabled} keyboardType="decimal-pad" />
        </View>
        <View style={styles.gridCell}>
          <Field label={t('sg.codeHeight')} value={String(v.barcode.height ?? '')} onChangeText={(s) => emit({ ...v, barcode: { ...v.barcode, height: labelNumber(s) } })} editable={!disabled} keyboardType="decimal-pad" />
        </View>
      </View>
    </View>
  );
}

// ---------- lists ----------

export function LabelValueEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const items = parseLabelValues(value);
  const emit = (n: LabelValue[]) => onChange(JSON.stringify(n));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<LabelValue>({ label: '', value: '' });
  const [fresh, setFresh] = useState<LabelValue>({ label: '', value: '' });
  return (
    <View style={styles.stack}>
      <Text style={styles.label}>{t('sg.itemCount', { count: items.length })}</Text>
      {items.map((it, i) => (
        <Card key={i}>
          {editing === i ? (
            <View>
              <Field label={t('sg.label')} value={draft.label} onChangeText={(s) => setDraft({ ...draft, label: s })} />
              <Field label={t('sg.value')} value={draft.value} onChangeText={(s) => setDraft({ ...draft, value: s })} autoCapitalize="none" />
              <View style={styles.buttons}>
                <Button title={t('sg.save')} size="sm" disabled={!labelValueValid(draft)} onPress={() => { const n = [...items]; n[i] = draft; emit(n); setEditing(null); }} />
                <Button title={t('common.cancel')} variant="ghost" size="sm" onPress={() => setEditing(null)} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.cardTitle}>{it.label}</Text>
              <Text style={styles.mono}>{it.value}</Text>
              {!disabled ? (
                <View style={styles.buttons}>
                  <Button title={t('sg.edit')} variant="outline" size="sm" onPress={() => { setEditing(i); setDraft({ ...it }); }} />
                  <Button title={t('sg.remove')} variant="ghost" size="sm" onPress={() => emit(items.filter((_, k) => k !== i))} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      ))}
      {!disabled ? (
        <Card>
          <Text style={styles.cardTitle}>{t('sg.addItem')}</Text>
          <Field label={t('sg.label')} value={fresh.label} onChangeText={(s) => setFresh({ ...fresh, label: s })} />
          <Field label={t('sg.value')} value={fresh.value} onChangeText={(s) => setFresh({ ...fresh, value: s })} autoCapitalize="none" />
          <Button title={t('common.add')} disabled={!labelValueValid(fresh)} onPress={() => { emit([...items, { ...fresh }]); setFresh({ label: '', value: '' }); }} />
        </Card>
      ) : null}
    </View>
  );
}

export function KeyValueEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const obj = parseKeyValues(value);
  const emit = (n: Record<string, string>) => onChange(JSON.stringify(n));
  const [key, setKey] = useState('');
  const [val, setVal] = useState('');
  return (
    <View style={styles.stack}>
      {Object.entries(obj).map(([k, v]) => (
        <View key={k}>
          <Field label={k} value={String(v)} onChangeText={(s) => emit({ ...obj, [k]: s })} editable={!disabled} placeholder={t('sg.value')} />
          {!disabled ? <Button title={t('sg.remove')} variant="ghost" size="sm" onPress={() => { const n = { ...obj }; delete n[k]; emit(n); }} /> : null}
        </View>
      ))}
      {!disabled ? (
        <Card>
          <Text style={styles.cardTitle}>{t('sg.addItem')}</Text>
          <Field label={t('sg.label')} value={key} onChangeText={setKey} autoCapitalize="none" placeholder="urgent" />
          <Field label={t('sg.value')} value={val} onChangeText={setVal} autoCapitalize="none" placeholder="1" />
          <Button title={t('common.add')} disabled={!canAddKeyValue(obj, key, val)} onPress={() => { emit({ ...obj, [key.trim()]: val.trim() }); setKey(''); setVal(''); }} />
        </Card>
      ) : null}
    </View>
  );
}

export function IntegrationEditor({ value, onChange, disabled }: EditorProps) {
  const { t } = useTranslation();
  const items = parseIntegrations(value);
  const emit = (n: IntegrationItem[]) => onChange(JSON.stringify(n));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<IntegrationItem>({ name: '', url: '', token: '' });
  const [fresh, setFresh] = useState<IntegrationItem>({ name: '', url: '', token: '' });
  const fields = (it: IntegrationItem, set: (n: IntegrationItem) => void) => (
    <View>
      <Field label={t('sg.brandName')} value={it.name} onChangeText={(s) => set({ ...it, name: s })} placeholder="My Brand" />
      <Field label={t('sg.url')} value={it.url} onChangeText={(s) => set({ ...it, url: s })} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      <Field label={t('sg.token')} value={it.token} onChangeText={(s) => set({ ...it, token: s })} autoCapitalize="none" secureTextEntry />
    </View>
  );
  return (
    <View style={styles.stack}>
      <Text style={styles.label}>{t('sg.entryCount', { count: items.length })}</Text>
      {items.map((it, i) => (
        <Card key={i}>
          {editing === i ? (
            <View>
              {fields(draft, setDraft)}
              <View style={styles.buttons}>
                <Button title={t('sg.save')} size="sm" disabled={!integrationValid(draft)} onPress={() => { const n = [...items]; n[i] = draft; emit(n); setEditing(null); }} />
                <Button title={t('common.cancel')} variant="ghost" size="sm" onPress={() => setEditing(null)} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.cardTitle}>{it.name}</Text>
              <Text style={styles.mono} numberOfLines={1}>{it.url}</Text>
              <Text style={styles.hint}>{t('sg.tokenHidden')}</Text>
              {!disabled ? (
                <View style={styles.buttons}>
                  <Button title={t('sg.edit')} variant="outline" size="sm" onPress={() => { setEditing(i); setDraft({ ...it }); }} />
                  <Button title={t('sg.remove')} variant="ghost" size="sm" onPress={() => emit(items.filter((_, k) => k !== i))} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      ))}
      {!disabled ? (
        <Card>
          <Text style={styles.cardTitle}>{t('sg.addIntegration')}</Text>
          {fields(fresh, setFresh)}
          <Button title={t('common.add')} disabled={!integrationValid(fresh)} onPress={() => { emit([...items, { ...fresh }]); setFresh({ name: '', url: '', token: '' }); }} />
        </Card>
      ) : null}
    </View>
  );
}

export function AccessibilityNotice() {
  const { t } = useTranslation();
  return <Hint text={t('sg.accessibilityLater')} />;
}

/** The editor the web would show for this kind of setting (null when the phone has none). */
export function renderEditor(type: SettingType, p: EditorProps): ReactNode {
  switch (type) {
    case 'number':
      return <NumberEditor {...p} />;
    case 'qr-code':
      return <QrCodeEditor {...p} />;
    case 'invoice':
      return <InvoiceEditor {...p} />;
    case 'json-array':
      return <LabelValueEditor {...p} />;
    case 'json':
      return <KeyValueEditor {...p} />;
    case 'print-server':
      return <PrintServerEditor {...p} />;
    case 'label-print':
      return <LabelPrintEditor {...p} />;
    case 'type-pos':
      return <TypePosEditor {...p} />;
    case 'product-menu':
      return <ProductMenuEditor {...p} />;
    case 'order-discount':
      return <OrderDiscountEditor {...p} />;
    case 'currency':
      return <CurrencyEditor {...p} />;
    case 'print-socket':
      return <PrintSocketEditor {...p} />;
    case 'accounting':
      return <AccountingEditor {...p} />;
    case 'brand_integration':
      return <IntegrationEditor {...p} />;
    case 'inventory':
      return <InventoryEditor {...p} />;
    case 'brand':
      return <BrandEditor {...p} />;
    case 'accessibility':
      return null;
    default:
      return <TextEditor {...p} />;
  }
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  block: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: space.xs },
  rowLabel: { flex: 1, fontSize: font.body, color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.foreground },
  hint: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  error: { fontSize: font.small, color: colors.destructive },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridCell: { width: '48%' },
  cardTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground, marginBottom: space.xs },
  mono: { fontSize: font.small, color: colors.foreground, fontFamily: 'monospace' },
  link: { fontSize: font.small, color: colors.primary, fontFamily: 'monospace' },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  image: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.muted },
  imageEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
});
