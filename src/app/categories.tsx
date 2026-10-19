import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { canAddCategory, canDeleteCategory, categoryFormOf, categoryProblem, emptyCategoryForm, initials, isReadOnlyField, matches, printerLabel, saleText, saleTone, saveBody, toggleBody, type CategoryFormData, type CategoryItem, type PrinterItem, type SaleStatus } from '@/lib/categories';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import type { BranchRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { useBranch } from '@/lib/use-branch';
import { formatMoney } from '@/lib/money';
import { Badge, Button, Card, Chip, Input } from '@/ui/components';
import { uploadBase64 } from '@/ui/product-form/images-section';
import { NumInput, ToggleRow } from '@/ui/product-form/parts';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Categories like the kh-pos web Category page: picture, title, description, products for sale out
 * of all, printer, created date, sort order, delivery-fee settings; add, edit, delete, and enable or
 * disable every product of a category for sale. Only the main branch adds, deletes and edits the text and
 * picture; every branch can choose its own kitchen printer for a category.
 */
export default function CategoriesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();
  const { warehouseId, currency } = useBranch();

  const [rows, setRows] = useState<CategoryItem[] | null>(null);
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [branch, setBranch] = useState<BranchRow | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ row: CategoryItem | null; form: CategoryFormData } | null>(null);
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('categories-page', warehouseId, () => fetchAllPages<CategoryItem>(async (o, l) => (await api.call<{ result: { data: CategoryItem[]; total: number } }>('GET', `/api/category?limit=${Math.min(l, 100)}&offset=${o}`)).result));
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api, warehouseId]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, state.online, state.syncVersion]);

  useEffect(() => {
    data.cachedRead('printers-ref', warehouseId, async () => (await api.call<{ result?: PrinterItem[] }>('GET', '/api/printer')).result ?? []).then((r) => setPrinters(r.data), () => undefined);
    data.cachedRead('branches-ref', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse-v2?limit=${Math.min(l, 100)}&offset=${o}`)).result)).then((r) => setBranch(r.data.find((b) => b.id === warehouseId) ?? null), () => undefined);
  }, [data, api, warehouseId]);

  const isMain = branch ? !!branch.isMain : (user?.warehouse as { isMain?: boolean } | null | undefined)?.isMain !== false;
  const mayAdd = canAddCategory(isMain, can(user, 'category', 'create'));
  const mayEdit = can(user, 'category', 'update');
  const mayDelete = canDeleteCategory(isMain, can(user, 'category', 'delete'));
  const mayToggle = can(user, 'category', 'update');

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ['images'] });
    const b64 = r.assets?.[0]?.base64;
    if (r.canceled || !b64) return;
    guard(() => {
      void (async () => {
        setUploading(true);
        try {
          const url = await uploadBase64(api, b64);
          setEditing((e) => (e ? { ...e, form: { ...e.form, imageUrl: url } } : e));
        } catch (e) {
          Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setUploading(false);
        }
      })();
    });
  }

  function save() {
    const e = editing!;
    if (categoryProblem(e.form)) {
      setProblem(true);
      return;
    }
    const body = saveBody(e.form, e.row ?? undefined);
    guard(async () => {
      setBusy(true);
      try {
        await api.call(e.row ? 'PUT' : 'POST', '/api/category', body);
        setEditing(null);
        await load();
      } catch (err) {
        Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    });
  }

  function remove(c: CategoryItem) {
    Alert.alert(t('categories.deleteTitle'), t('categories.deleteAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/category', { id: c.id });
              await load();
            } catch (err) {
              Alert.alert(t('errors.server'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  function setForSale(c: CategoryItem, status: SaleStatus) {
    Alert.alert(t(status === 'enable' ? 'categories.enableSale' : 'categories.disableSale'), t(status === 'enable' ? 'categories.enableSaleAsk' : 'categories.disableSaleAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t(status === 'enable' ? 'plist.enable' : 'plist.disable'),
        style: status === 'disable' ? 'destructive' : 'default',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('POST', '/api/category/product-toggle', toggleBody(c.id, status));
              await load();
            } catch (err) {
              Alert.alert(t('categories.saleFailed'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  const shown = (rows ?? []).filter((c) => matches(c, search));
  const f = editing?.form;
  const ro = (field: 'title' | 'description' | 'image' | 'sortOrder') => isReadOnlyField(isMain, field);
  const toneColor = (tone: 'success' | 'destructive' | 'warning') => (tone === 'success' ? colors.success : tone === 'destructive' ? colors.destructive : colors.warning);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.categories')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => { setProblem(false); setEditing({ row: null, form: emptyCategoryForm() }); }} /> : undefined} />
      <View style={styles.filters}>
        <Input value={search} onChangeText={setSearch} placeholder={t('admin.search')} autoCorrect={false} accessibilityLabel={t('admin.search')} />
      </View>
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item: c }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                {c.imageUrl ? <Image source={{ uri: c.imageUrl }} style={styles.img} resizeMode="contain" /> : <View style={[styles.img, styles.noimg]}><Text style={styles.initials}>{initials(c.title)}</Text></View>}
                <View style={styles.flex}>
                  <Text style={styles.heading} numberOfLines={2}>
                    {c.title}
                  </Text>
                  {c.description ? <Text style={styles.muted} numberOfLines={2}>{c.description}</Text> : null}
                </View>
              </View>
              <View style={styles.row}>
                <Text style={[styles.sale, { color: toneColor(saleTone(c)) }]}>{saleText(c)}</Text>
                <Text style={styles.muted}>{t('categories.productsForSale')}</Text>
              </View>
              <View style={styles.chips}>
                <Badge tone="outline" text={c.printer?.name ?? printers.find((p) => p.id === c.printerId)?.name ?? t('categories.noPrinter')} />
                <Badge tone="outline" text={t('categories.sortN', { n: c.sortOrder ?? 0 })} />
                <Badge tone={c.excludeFeeDelivery ? 'warning' : 'outline'} text={c.excludeFeeDelivery ? t('categories.feeExcluded') : t('categories.feeIncluded')} />
                {Number(c.markExtraFee) > 0 ? <Badge tone="info" text={t('categories.extraFeeN', { fee: formatMoney(Number(c.markExtraFee), currency) })} /> : null}
              </View>
              {c.createdAt ? <Text style={styles.muted}>{t('categories.created', { date: c.createdAt.slice(0, 10) })}</Text> : null}
              <View style={styles.chips}>
                {mayEdit ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => { setProblem(false); setEditing({ row: c, form: categoryFormOf(c) }); }} /> : null}
                {mayToggle ? <Button title={t('categories.enableSale')} variant="outline" size="sm" onPress={() => setForSale(c, 'enable')} /> : null}
                {mayToggle ? <Button title={t('categories.disableSale')} variant="outline" size="sm" onPress={() => setForSale(c, 'disable')} /> : null}
                {mayDelete ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(c)} /> : null}
              </View>
            </Card>
          )}
        />
      )}

      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.safe}>
          {editing && f ? (
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{editing.row ? t('categories.editTitle') : t('categories.createTitle')}</Text>

                <Text style={styles.label}>{t('categories.image')}</Text>
                {f.imageUrl ? <Image source={{ uri: f.imageUrl }} style={styles.preview} resizeMode="cover" /> : null}
                {!ro('image') ? (
                  <View style={styles.chips}>
                    <Button title={t('categories.uploadImage')} variant="outline" size="sm" loading={uploading} onPress={() => void pickImage()} />
                    {f.imageUrl ? <Button title={t('pform.remove')} variant="ghost" size="sm" onPress={() => setEditing({ ...editing, form: { ...f, imageUrl: '' } })} /> : null}
                  </View>
                ) : null}

                <Text style={styles.label}>{t('categories.title')}</Text>
                <Input value={f.title} onChangeText={(v) => setEditing({ ...editing, form: { ...f, title: v } })} placeholder={t('categories.titleHint')} editable={!ro('title')} accessibilityLabel={t('categories.title')} />
                {problem && categoryProblem(f) ? <Text style={styles.error}>{t('admin.required')}</Text> : null}

                <Text style={styles.label}>{t('categories.description')}</Text>
                <Input value={f.description} onChangeText={(v) => setEditing({ ...editing, form: { ...f, description: v } })} multiline editable={!ro('description')} accessibilityLabel={t('categories.description')} />

                <Text style={styles.label}>{t('categories.printer')} ({t('categories.optional')})</Text>
                <View style={styles.chips}>
                  <Chip label={t('categories.noPrinterOption')} selected={!f.printerId} onPress={() => setEditing({ ...editing, form: { ...f, printerId: '' } })} />
                  {printers.map((p) => (
                    <Chip key={p.id} label={printerLabel(p)} selected={f.printerId === p.id} onPress={() => setEditing({ ...editing, form: { ...f, printerId: p.id } })} />
                  ))}
                </View>

                <NumInput label={t('categories.sort')} value={f.sortOrder} decimal={false} onChange={(n) => !ro('sortOrder') && setEditing({ ...editing, form: { ...f, sortOrder: n ?? 0 } })} />
                <ToggleRow label={t('categories.noDeliveryFee')} value={f.excludeFeeDelivery} onChange={(v) => setEditing({ ...editing, form: { ...f, excludeFeeDelivery: v } })} />
                <NumInput label={t('categories.extraFee')} value={f.markExtraFee} onChange={(n) => setEditing({ ...editing, form: { ...f, markExtraFee: n ?? 0 } })} />
                {!isMain ? <Text style={styles.muted}>{t('categories.branchNote')}</Text> : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} style={styles.flex} />
                <Button title={t('customize.save')} disabled={!f.title.trim()} loading={busy} onPress={save} style={styles.flex} />
              </View>
            </KeyboardAvoidingView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  filters: { backgroundColor: colors.card, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  img: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700', color: colors.mutedForeground },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  sale: { fontSize: font.title, fontWeight: '700' },
  error: { fontSize: font.small, color: colors.destructive },
  preview: { width: 128, height: 128, borderRadius: radius.md },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
