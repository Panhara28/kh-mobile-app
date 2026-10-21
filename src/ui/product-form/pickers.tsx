import { useRecordWriter } from '@/lib/offline/use-record';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { KhPosApi } from '@/lib/api';
import { fetchAllPages, type CategoryRow, type SupplierRow } from '@/lib/catalog';
import type { OfflineData } from '@/lib/offline/data';
import { Button, Chip, Input } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

/**
 * The supplier of the product: search, tap to choose (tap again to clear), or create one from what
 * was typed — like the web SupplierPicker.
 */
export function SupplierPicker({ api, data, value, onChange }: { api: KhPosApi; data: OfflineData; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const writer = useRecordWriter();
  const [all, setAll] = useState<SupplierRow[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    data.cachedRead('suppliers-ref', '', () => fetchAllPages<SupplierRow>(async (o, l) => (await api.call<{ result: { data: SupplierRow[]; total: number } }>('GET', `/api/supplier?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setAll(r.data), () => undefined);
  }, [data, api]);

  const q = search.trim().toLowerCase();
  const shown = all.filter((s) => !q || s.name.toLowerCase().includes(q) || s.id === value);
  const exact = all.some((s) => s.name.toLowerCase() === q);

  async function create() {
    setBusy(true);
    try {
      const body = { name: search.trim(), contactName: '', contactPhone: '', contactEmail: '', address: '' };
      // written to the phone first; kept for later when kh-pos can't be reached (the supplier can be picked once it has been sent)
      let created: { id?: string; name?: string } | undefined;
      const how = await writer({ entity: 'supplier', op: 'create', recordId: `new:${body.name}`, method: 'POST', path: '/api/supplier', body, once: true, label: body.name, row: { id: `new:${body.name}`, name: body.name } }, (a) => (created = a as { id?: string; name?: string }));
      if (how === 'queued') {
        Alert.alert(t('offline.savedOffline'));
        setSearch('');
        return;
      }
      if (created?.id) {
        setAll((a) => [...a, { id: created!.id!, name: created!.name ?? search.trim() } as SupplierRow]);
        onChange(created.id);
        setSearch('');
      }
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{t('pform.supplier')}</Text>
      <Input value={search} onChangeText={setSearch} placeholder={t('pform.searchSupplier')} autoCorrect={false} accessibilityLabel={t('pform.supplier')} />
      <View style={styles.chips}>
        {shown.slice(0, 40).map((s) => (
          <Chip key={s.id} label={s.name} selected={value === s.id} onPress={() => onChange(value === s.id ? '' : s.id)} />
        ))}
      </View>
      {q && !exact ? <Button title={t('pform.createNamed', { name: search.trim() })} variant="outline" size="sm" loading={busy} onPress={() => void create()} /> : null}
    </View>
  );
}

/**
 * The category of the product: search, tap to choose (tap again to clear), or create one from what
 * was typed. Choosing reports the whole category so its kitchen printer can be passed on to the variants.
 */
export function CategoryPicker({ api, data, warehouseId, value, onChange }: { api: KhPosApi; data: OfflineData; warehouseId: string; value: string; onChange: (c: CategoryRow | null) => void }) {
  const { t } = useTranslation();
  const writer = useRecordWriter();
  const [all, setAll] = useState<CategoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    data.cachedRead('categories-full', warehouseId, () => fetchAllPages<CategoryRow>(async (o, l) => (await api.call<{ result: { data: CategoryRow[]; total: number } }>('GET', `/api/category?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setAll(r.data), () => undefined);
  }, [data, api, warehouseId]);

  const q = search.trim().toLowerCase();
  const shown = all.filter((c) => !q || c.title.toLowerCase().includes(q) || c.id === value);
  const exact = all.some((c) => c.title.toLowerCase() === q);

  async function create() {
    setBusy(true);
    try {
      const body = { title: search.trim(), description: '', imageUrl: null, parentId: null, printerId: null };
      // written to the phone first; kept for later when kh-pos can't be reached (the category can be picked once it has been sent)
      let created: { result?: CategoryRow } | undefined;
      const how = await writer({ entity: 'category', op: 'create', recordId: `new:${body.title}`, method: 'POST', path: '/api/category', body, once: true, label: body.title, row: { id: `new:${body.title}`, title: body.title } }, (a) => (created = a as { result?: CategoryRow }));
      if (how === 'queued') {
        Alert.alert(t('offline.savedOffline'));
        setSearch('');
        return;
      }
      if (created?.result) {
        setAll((a) => [...a, created!.result!]);
        onChange(created.result);
        setSearch('');
      }
    } catch (e) {
      Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{t('pform.category')}</Text>
      <Input value={search} onChangeText={setSearch} placeholder={t('pform.searchCategory')} autoCorrect={false} accessibilityLabel={t('pform.category')} />
      <View style={styles.chips}>
        {shown.slice(0, 60).map((c) => (
          <Chip key={c.id} label={c.title} selected={value === c.id} onPress={() => onChange(value === c.id ? null : c)} />
        ))}
      </View>
      {q && !exact ? <Button title={t('pform.createNamed', { name: search.trim() })} variant="outline" size="sm" loading={busy} onPress={() => void create()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: space.xs },
});
