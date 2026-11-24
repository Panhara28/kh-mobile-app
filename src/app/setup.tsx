import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Check, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaymentMethod } from '@/lib/api';
import { homeRoute } from '@/lib/modules';
import { useSession } from '@/lib/session';
import { choiceOf, firstOpenStep, nextStep, printerProblem, printersBody, typeBody, type BusinessChoice, type SetupPrinter, type SetupStatus, type SetupStepKey } from '@/lib/setup';
import { Button, Card, Field, Segmented } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { colors, font, radius, space } from '@/ui/theme';

type Page = SetupStepKey | 'finish';
interface SaleCategory {
  id: string;
  title: string;
  printerId: string;
}

/**
 * First-time store setup, like the kh-pos web setup page: store details, business type, currency, payment, kitchen
 * printers and tables (restaurant). kh-pos unlocks selling once it is finished. Needs kh-pos (a new store has
 * nothing saved on the phone yet).
 */
export default function SetupScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.call<{ result: SetupStatus }>('GET', '/api/setup');
      setStatus(r.result);
      setPage((p) => p ?? firstOpenStep(r.result));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function save(key: SetupStepKey, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await api.call<{ result: SetupStatus }>('PUT', '/api/setup', body);
      setStatus(r.result);
      setPage(nextStep(r.result, key));
    } catch (e) {
      Alert.alert(t('setup.saveFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await api.call('POST', '/api/setup');
      Alert.alert(t('setup.doneTitle'), t('setup.doneText'));
      router.replace(homeRoute(user) as Href);
    } catch (e) {
      Alert.alert(t('setup.saveFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  if (!status || !page) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title={t('setup.title')} />
        {error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />}
      </SafeAreaView>
    );
  }

  const done = status.steps.filter((s) => s.done).length;
  const index = status.steps.findIndex((s) => s.key === page);
  const back = index > 0 ? () => setPage(status.steps[index - 1]!.key) : page === 'finish' && status.steps.length ? () => setPage(status.steps[status.steps.length - 1]!.key) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('setup.title')} subtitle={t('setup.progress', { done, total: status.steps.length })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
        {[...status.steps.map((s) => ({ key: s.key as Page, done: s.done })), { key: 'finish' as Page, done: status.complete }].map((s, i) => {
          const on = s.key === page;
          return (
            <Pressable key={s.key} onPress={() => setPage(s.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.step, on && styles.stepOn]}>
              <View style={[styles.dot, s.done && styles.dotDone, on && styles.dotOn]}>{s.done ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text style={[styles.dotText, on && styles.dotTextOn]}>{i + 1}</Text>}</View>
              <Text style={[styles.stepText, on && styles.stepTextOn]}>{t(`setup.step_${s.key}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
          {page === 'store' ? <StoreStep status={status} busy={busy} onSave={(b) => void save('store', b)} /> : null}
          {page === 'type' ? <TypeStep status={status} busy={busy} onSave={(b) => void save('type', b)} /> : null}
          {page === 'currency' ? <CurrencyStep status={status} busy={busy} onSave={(b) => void save('currency', b)} /> : null}
          {page === 'payment' ? <PaymentStep busy={busy} onSave={() => void save('payment', { step: 'payment' })} /> : null}
          {page === 'printers' ? <PrintersStep busy={busy} onSave={(b) => void save('printers', b)} /> : null}
          {page === 'tables' ? <TablesStep status={status} busy={busy} onSave={(b) => void save('tables', b)} onChanged={() => void load()} /> : null}
          {page === 'halls' ? <HallsStep /> : null}
          {page === 'finish' ? <FinishStep status={status} busy={busy} onFinish={() => void finish()} onOpen={setPage} /> : null}
          {back ? <Button title={t('setup.back')} variant="ghost" onPress={back} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function StoreStep({ status, busy, onSave }: { status: SetupStatus; busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(status.store.name);
  const [phone, setPhone] = useState(status.store.phone);
  const [address, setAddress] = useState(status.store.address);
  const short = name.trim().length < 3;
  return (
    <>
      <Heading title={t('setup.store.title')} text={t('setup.store.text')} />
      <Field label={t('setup.store.name')} value={name} onChangeText={setName} error={short && name ? t('setup.store.nameShort') : undefined} />
      <Field label={t('setup.store.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label={t('setup.store.address')} value={address} onChangeText={setAddress} multiline />
      <Button title={t('setup.saveNext')} disabled={short} loading={busy} onPress={() => onSave({ step: 'store', name: name.trim(), phone: phone.trim(), address: address.trim(), logo: status.store.logo })} />
    </>
  );
}

function TypeStep({ status, busy, onSave }: { status: SetupStatus; busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<BusinessChoice | null>(choiceOf(status));
  const options: BusinessChoice[] = ['SMALL_RESTAURANT', 'RESTAURANT', 'MART', 'CINEMA'];
  return (
    <>
      <Heading title={t('setup.type.title')} text={t('setup.type.text')} />
      {options.map((o) => (
        <Pressable key={o} onPress={() => setChoice(o)} accessibilityRole="radio" accessibilityState={{ checked: choice === o }} style={[styles.option, choice === o && styles.optionOn]}>
          <Text style={styles.optionTitle}>{t(`setup.type.${o}`)}</Text>
          <Text style={styles.muted}>{t(`setup.type.${o}_text`)}</Text>
        </Pressable>
      ))}
      <Button title={t('setup.saveNext')} disabled={!choice} loading={busy} onPress={() => choice && onSave(typeBody(choice))} />
    </>
  );
}

function CurrencyStep({ status, busy, onSave }: { status: SetupStatus; busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState<'USD' | 'KHR'>(status.currency === 'KHR' ? 'KHR' : 'USD');
  const [rate, setRate] = useState(status.exchangeRate ? String(status.exchangeRate) : '4100');
  const value = Number(rate.replace(/,/g, ''));
  const bad = !(value > 0);
  return (
    <>
      <Heading title={t('setup.currency.title')} text={t('setup.currency.text')} />
      <Segmented
        options={[
          { value: 'USD', label: 'USD ($)' },
          { value: 'KHR', label: 'KHR (៛)' },
        ]}
        value={currency}
        onChange={setCurrency}
      />
      <Field label={t('setup.currency.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" error={bad ? t('setup.currency.rateBad') : undefined} />
      <Button title={t('setup.saveNext')} disabled={bad} loading={busy} onPress={() => onSave({ step: 'currency', currency, exchangeRate: value })} />
    </>
  );
}

function PaymentStep({ busy, onSave }: { busy: boolean; onSave: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.paymentMethods().then(setMethods, () => setMethods([]));
    }, [api]),
  );
  return (
    <>
      <Heading title={t('setup.payment.title')} text={t('setup.payment.text')} />
      <Card style={styles.card}>
        {methods === null ? <Text style={styles.muted}>…</Text> : methods.length === 0 ? <Text style={styles.muted}>{t('setup.payment.none')}</Text> : null}
        {(methods ?? []).map((m) => (
          <Text key={m.method_id} style={styles.item}>
            • {m.method}
          </Text>
        ))}
      </Card>
      <Button title={t('setup.payment.manage')} variant="outline" onPress={() => router.push('/payment-methods')} />
      <Button title={t('setup.payment.confirm')} disabled={!methods?.length} loading={busy} onPress={onSave} />
    </>
  );
}

function PrintersStep({ busy, onSave }: { busy: boolean; onSave: (b: Record<string, unknown>) => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [printers, setPrinters] = useState<SetupPrinter[] | null>(null);
  const [categories, setCategories] = useState<SaleCategory[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [p, c] = await Promise.all([
          api.call<{ result?: SetupPrinter[] }>('GET', '/api/printer').then((r) => r.result ?? [], () => []),
          api
            .call<{ result?: { data: { id: string; title: string; forSaleCount?: number; printer?: { id?: string } | null; printerId?: string | null }[] } }>('GET', '/api/category?limit=100&offset=0')
            .then((r) => r.result?.data ?? [], () => []),
        ]);
        if (cancelled) return;
        setPrinters((cur) => cur ?? p);
        setCategories(c.filter((x) => (x.forSaleCount ?? 1) > 0).map((x) => ({ id: x.id, title: x.title, printerId: x.printer?.id ?? x.printerId ?? '' })));
      })();
      return () => {
        cancelled = true;
      };
    }, [api]),
  );

  if (!printers) return <LoadingState />;
  const problem = printerProblem(printers);
  const change = (id: string, patch: Partial<SetupPrinter>) => setPrinters(printers.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => setPrinters([...printers, { id: Crypto.randomUUID(), name: printers.length ? `${t('setup.printers.printer')} ${printers.length + 1}` : t('setup.printers.kitchen'), printerName: '', ip: '', port: '9100' }]);
  const printerOf = (c: SaleCategory) => (printers.some((p) => p.id === c.printerId) ? c.printerId : (printers[0]?.id ?? ''));

  return (
    <>
      <Heading title={t('setup.printers.title')} text={t('setup.printers.text')} />
      {printers.map((p) => (
        <Card key={p.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.optionTitle}>{p.name || t('setup.printers.printer')}</Text>
            <Pressable onPress={() => setPrinters(printers.filter((x) => x.id !== p.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('admin.delete')}>
              <Trash2 size={18} color={colors.destructive} />
            </Pressable>
          </View>
          <Field label={t('setup.printers.name')} value={p.name} onChangeText={(v) => change(p.id, { name: v })} />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label={t('setup.printers.ip')} value={p.ip} onChangeText={(v) => change(p.id, { ip: v })} keyboardType="numbers-and-punctuation" autoCapitalize="none" placeholder="192.168.1.50" />
            </View>
            <View style={styles.port}>
              <Field label={t('setup.printers.port')} value={String(p.port)} onChangeText={(v) => change(p.id, { port: v })} keyboardType="number-pad" />
            </View>
          </View>
        </Card>
      ))}
      <Button title={t('setup.printers.add')} variant="outline" left={<Plus size={16} color={colors.foreground} />} onPress={add} />

      {printers.length > 1 && categories.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.optionTitle}>{t('setup.printers.categories')}</Text>
          {categories.map((c) => (
            <View key={c.id} style={styles.catRow}>
              <Text style={styles.item}>{c.title}</Text>
              <View style={styles.chips}>
                {printers.map((p) => (
                  <Pressable key={p.id} onPress={() => setCategories(categories.map((x) => (x.id === c.id ? { ...x, printerId: p.id } : x)))} style={[styles.chip, printerOf(c) === p.id && styles.chipOn]}>
                    <Text style={[styles.chipText, printerOf(c) === p.id && styles.chipTextOn]}>{p.name || '…'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {problem && problem !== 'none' ? <Text style={styles.error}>{t(`setup.printers.bad_${problem}`)}</Text> : null}
      <Button title={t('setup.saveNext')} disabled={!!problem} loading={busy} onPress={() => onSave(printersBody(printers, categories))} />
    </>
  );
}

function TablesStep({ status, busy, onSave, onChanged }: { status: SetupStatus; busy: boolean; onSave: (b: Record<string, unknown>) => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [mode, setMode] = useState(status.tableMode);
  const [tags, setTags] = useState(String(status.tagCount || 50));
  const [prefix, setPrefix] = useState('T');
  const [amount, setAmount] = useState('10');
  const [seats, setSeats] = useState('4');
  const [making, setMaking] = useState(false);
  const count = status.steps.find((s) => s.key === 'tables')?.count ?? 0;
  const tagCount = Number(tags);
  const tagsBad = mode === 'TAG' && !(Number.isInteger(tagCount) && tagCount >= 1 && tagCount <= 999);

  async function generate() {
    const n = Number(amount);
    const cap = Number(seats);
    if (!(Number.isInteger(n) && n >= 1 && n <= 200) || !(Number.isInteger(cap) && cap >= 1)) {
      Alert.alert(t('setup.tables.badGenerate'));
      return;
    }
    setMaking(true);
    try {
      await api.generateTables({ count: n, default: { key: prefix.trim() || 'T', capacity: cap, section: '', shape: '' } });
      onChanged();
    } catch (e) {
      Alert.alert(t('setup.saveFailed'), e instanceof Error ? e.message : undefined);
    } finally {
      setMaking(false);
    }
  }

  return (
    <>
      <Heading title={t('setup.tables.title')} text={t('setup.tables.text')} />
      <Card style={styles.card}>
        <Text style={styles.optionTitle}>{t('setup.tables.have', { count })}</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label={t('setup.tables.prefix')} value={prefix} onChangeText={setPrefix} autoCapitalize="characters" />
          </View>
          <View style={styles.flex}>
            <Field label={t('setup.tables.amount')} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          </View>
          <View style={styles.flex}>
            <Field label={t('setup.tables.seats')} value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          </View>
        </View>
        <Button title={t('setup.tables.generate')} variant="outline" loading={making} onPress={() => void generate()} />
        <Button title={t('setup.tables.more')} variant="ghost" onPress={() => router.push('/table-setup')} />
      </Card>
      <Text style={styles.optionTitle}>{t('setup.tables.mode')}</Text>
      <Segmented
        options={[
          { value: 'NORMAL', label: t('setup.tables.normal') },
          { value: 'TAG', label: t('setup.tables.tag') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Text style={styles.muted}>{t(mode === 'TAG' ? 'setup.tables.tagText' : 'setup.tables.normalText')}</Text>
      {mode === 'TAG' ? <Field label={t('setup.tables.tagCount')} value={tags} onChangeText={setTags} keyboardType="number-pad" error={tagsBad ? t('setup.tables.tagBad') : undefined} /> : null}
      <Button title={t('setup.saveNext')} disabled={count === 0 || tagsBad} loading={busy} onPress={() => onSave({ step: 'tables', tableMode: mode, tagCount: mode === 'TAG' ? tagCount : status.tagCount || 50 })} />
    </>
  );
}

function HallsStep() {
  const { t } = useTranslation();
  return <Heading title={t('setup.halls.title')} text={t('setup.halls.text')} />;
}

function FinishStep({ status, busy, onFinish, onOpen }: { status: SetupStatus; busy: boolean; onFinish: () => void; onOpen: (p: Page) => void }) {
  const { t } = useTranslation();
  const open = status.steps.filter((s) => !s.done);
  return (
    <>
      <Heading title={t('setup.finish.title')} text={open.length ? t('setup.finish.missing') : t('setup.finish.text')} />
      {open.map((s) => (
        <Button key={s.key} title={t(`setup.step_${s.key}`)} variant="outline" onPress={() => onOpen(s.key)} />
      ))}
      <Button title={t('setup.finish.button')} disabled={open.length > 0 || status.complete} loading={busy} onPress={onFinish} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  steps: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  stepOn: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  dotDone: { backgroundColor: colors.success },
  dotOn: { backgroundColor: colors.primary },
  dotText: { fontSize: 11, fontWeight: '700', color: colors.mutedForeground },
  dotTextOn: { color: '#fff' },
  stepText: { fontSize: font.small, color: colors.foreground },
  stepTextOn: { fontWeight: '800', color: colors.primary },
  body: { padding: space.lg, gap: space.md },
  heading: { gap: 4 },
  title: { fontSize: font.heading, fontWeight: '800', color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 20 },
  error: { fontSize: font.small, color: colors.destructive },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  item: { fontSize: font.body, color: colors.foreground },
  option: { padding: space.md, gap: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  optionTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', gap: space.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  port: { width: 90 },
  catRow: { gap: 6, paddingVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: font.small, color: colors.foreground },
  chipTextOn: { color: '#fff', fontWeight: '700' },
});
