import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllPages } from '@/lib/catalog';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useRecordRows, useRecordWriter } from '@/lib/offline/use-record';
import { useOnlineOnly } from '@/lib/offline/use-online-only';
import { branchBody, branchForm, branchTitle, emptyBranch, validateBranch, type BranchForm, type BranchRow } from '@/lib/org';
import { useSession } from '@/lib/session';
import { dateOnly, orNA } from '@/lib/suppliers';
import { Badge, Button, Card, Input } from '@/ui/components';
import { ToggleRow } from '@/ui/product-form/parts';
import { uploadBase64 } from '@/ui/product-form/images-section';
import { ScreenHeader } from '@/ui/screen-header';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { StaleBanner } from '@/ui/sync-status';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Branches (the web's Warehouse page): a numbered list (image, name with "(Main)", owner, phone,
 * address, created date), add with a picture, location and the manager's login, edit, and delete (asked first).
 */
export default function BranchesScreen() {
  const { t } = useTranslation();
  const { api, user } = useSession();
  const { data, state } = useOffline();
  const guard = useOnlineOnly();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<BranchRow[] | null>(null);
  const writer = useRecordWriter();
  const listed = useRecordRows(rows, 'branch', (b: BranchRow) => b.id ?? '');
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ row: BranchRow | null; form: BranchForm } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await data.cachedRead('branches-full', 'all', () => fetchAllPages<BranchRow>(async (o, l) => (await api.call<{ result: { data: BranchRow[]; total: number } }>('GET', `/api/warehouse?limit=${Math.min(l, 100)}&offset=${o}`)).result));
      setRows(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data, api]);

  useEffect(() => {
    // loads after an await, so the state is set asynchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, state.online, state.syncVersion]);

  const mayAdd = can(user, 'warehouse', 'create');
  const mayEdit = can(user, 'warehouse', 'update');
  const mayDelete = can(user, 'warehouse', 'delete');
  const maySlots = can(user, 'slot', 'read');

  const f = editing?.form;
  const set = (patch: Partial<BranchForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  function open(row: BranchRow | null) {
    setProblem(null);
    setShowPassword(false);
    setEditing({ row, form: row ? branchForm(row) : emptyBranch() });
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ['images'] });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    guard(() => {
      void (async () => {
        setUploading(true);
        try {
          set({ image: await uploadBase64(api, asset.base64!) });
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
    const bad = validateBranch(e.form, !e.row);
    setProblem(bad);
    if (bad) return;
    const body = branchBody(e.form, e.row ?? undefined);
    // an edit is kept on the phone and sent later when kh-pos can't be reached; a new branch has an account password,
    // which must not be kept in the phone's queue, so adding needs the server
    const edit = e.row;
    const run = async () => {
      setBusy(true);
      try {
        if (edit) {
          const upd = body as { warehouseName: string; ownerName: string; phoneNumber: string; address: string; image: string; lat: string; lng: string; useMainBranchVisibility: boolean };
          await writer({ entity: 'branch', op: 'update', recordId: edit.id!, method: 'PUT', path: '/api/warehouse-v2', body, label: upd.warehouseName, row: { name: upd.warehouseName, ownerName: upd.ownerName, phone: upd.phoneNumber, address: upd.address, image: upd.image, lat: upd.lat, lng: upd.lng } });
        } else {
          await api.call('POST', '/api/warehouse-v2', body);
        }
        setEditing(null);
        await load();
      } catch (err) {
        Alert.alert(e.row ? t('branches.updateFailed') : t('branches.createFailed'), err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(false);
      }
    };
    if (edit) void run();
    else guard(run);
  }

  function remove(b: BranchRow) {
    Alert.alert(t('branches.deleteTitle'), t('branches.deleteAsk', { name: b.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: () =>
          guard(async () => {
            try {
              await api.call('DELETE', '/api/warehouse-v2', { id: b.id });
              await load();
            } catch (err) {
              Alert.alert(t('branches.deleteFailed'), err instanceof Error ? err.message : undefined);
            }
          }),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.branches')} right={mayAdd ? <Button title={`+ ${t('admin.add')}`} size="sm" onPress={() => open(null)} /> : undefined} />
      {staleAt !== false ? <StaleBanner savedAt={staleAt} /> : null}
      {rows === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <FlatList
          data={listed}
          keyExtractor={(b, i) => b.id ?? String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<EmptyState title={t('admin.empty')} />}
          renderItem={({ item: b, index }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.no}>{index + 1}</Text>
                {b.image ? <Image source={{ uri: b.image }} style={styles.img} resizeMode="cover" /> : <View style={[styles.img, styles.noimg]} />}
                <View style={styles.flex}>
                  <Text style={styles.heading}>{branchTitle(b)}</Text>
                  {b.isMain ? <Badge tone="success" text={t('branches.main')} /> : null}
                </View>
              </View>
              <Text style={styles.body}>{t('branches.owner')}: {orNA(b.ownerName)}</Text>
              <Text style={styles.body}>{t('users.phone')}: {orNA(b.phoneNumber)}</Text>
              <Text style={styles.body}>{t('suppliers.address')}: {orNA(b.address)}</Text>
              <Text style={styles.muted}>{t('branches.created', { date: dateOnly(b.createdAt) })}</Text>
              <View style={styles.row}>
                {mayEdit && b.id ? <Button title={t('admin.edit')} variant="outline" size="sm" onPress={() => open(b)} /> : null}
                {maySlots && b.id ? <Button title={t('branches.slots')} variant="outline" size="sm" onPress={() => router.push({ pathname: '/slots/[warehouseId]', params: { warehouseId: b.id! } })} /> : null}
                {mayDelete && b.id ? <Button title={t('admin.delete')} variant="ghost" size="sm" onPress={() => remove(b)} /> : null}
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
                <Text style={styles.title}>{editing.row ? t('branches.editTitle') : t('branches.createTitle')}</Text>
                <Text style={styles.muted}>{editing.row ? t('branches.editHint') : t('branches.createHint')}</Text>

                <Text style={styles.section}>{t('branches.image')}</Text>
                {f.image ? (
                  <View style={styles.row}>
                    <Image source={{ uri: f.image }} style={styles.imgBig} resizeMode="cover" />
                    <View style={styles.flex}>
                      <Text style={styles.body}>{t('branches.imageUploaded')}</Text>
                      <Text style={styles.muted} numberOfLines={1}>{f.image.split('/').pop()}</Text>
                    </View>
                    <Button title={t('branches.removeImage')} variant="outline" size="sm" disabled={uploading} onPress={() => set({ image: '' })} />
                  </View>
                ) : (
                  <Button title={uploading ? t('branches.uploading') : t('branches.upload')} variant="outline" loading={uploading} onPress={() => void pickImage()} />
                )}

                <Text style={styles.section}>{t('branches.basic')}</Text>
                <Text style={styles.label}>{t('branches.nameRequired')}</Text>
                <Input value={f.warehouseName} onChangeText={(v) => set({ warehouseName: v })} placeholder={t('branches.nameHint')} accessibilityLabel={t('branches.name')} />
                {problem === 'warehouseName' ? <Text style={styles.error}>{t('branches.error_name')}</Text> : null}
                <Text style={styles.label}>{t('branches.owner')}</Text>
                <Input value={f.ownerName} onChangeText={(v) => set({ ownerName: v })} placeholder={t('branches.ownerHint')} accessibilityLabel={t('branches.owner')} />
                {problem === 'ownerName' ? <Text style={styles.error}>{t('branches.error_owner')}</Text> : null}
                <Text style={styles.label}>{t('users.phone')}</Text>
                <Input value={f.phoneNumber} onChangeText={(v) => set({ phoneNumber: v })} placeholder="+855 ..." keyboardType="phone-pad" accessibilityLabel={t('users.phone')} />
                <ToggleRow label={t('branches.useMainVisibility')} value={f.useMainBranchVisibility} onChange={(v) => set({ useMainBranchVisibility: v })} />
                <Text style={styles.muted}>{t('branches.visibilityHint')}</Text>

                <Text style={styles.section}>{t('branches.location')}</Text>
                <Text style={styles.label}>{t('suppliers.address')}</Text>
                <Input value={f.address} onChangeText={(v) => set({ address: v })} placeholder={t('branches.addressHint')} accessibilityLabel={t('suppliers.address')} />
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.label}>{t('branches.lat')}</Text>
                    <Input value={f.lat} onChangeText={(v) => set({ lat: v })} placeholder="e.g. 13.7563" keyboardType="numbers-and-punctuation" accessibilityLabel={t('branches.lat')} />
                    {problem === 'lat' ? <Text style={styles.error}>{t('branches.error_coord')}</Text> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.label}>{t('branches.lng')}</Text>
                    <Input value={f.lng} onChangeText={(v) => set({ lng: v })} placeholder="e.g. 100.5018" keyboardType="numbers-and-punctuation" accessibilityLabel={t('branches.lng')} />
                    {problem === 'lng' ? <Text style={styles.error}>{t('branches.error_coord')}</Text> : null}
                  </View>
                </View>
                <Text style={styles.muted}>{t('branches.coordHint')}</Text>

                {!editing.row ? (
                  <>
                    <Text style={styles.section}>{t('branches.manager')}</Text>
                    <Text style={styles.muted}>{t('branches.managerHint')}</Text>
                    <Text style={styles.label}>{t('branches.usernameRequired')}</Text>
                    <Input value={f.userName} onChangeText={(v) => set({ userName: v })} placeholder="e.g. warehouse_mgr" autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('branches.ownerLogin')} />
                    {problem === 'userName' ? <Text style={styles.error}>{t('branches.error_userName')}</Text> : null}
                    <Text style={styles.label}>{t('branches.passwordRequired')}</Text>
                    <View style={styles.row}>
                      <Input value={f.password} onChangeText={(v) => set({ password: v })} placeholder={t('branches.passwordHint')} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} style={styles.flex} accessibilityLabel={t('users.password')} />
                      <Button title={showPassword ? t('branches.hide') : t('branches.show')} variant="ghost" size="sm" onPress={() => setShowPassword((v) => !v)} />
                    </View>
                    {problem === 'password' ? <Text style={styles.error}>{t('branches.error_password')}</Text> : null}
                  </>
                ) : null}
              </ScrollView>
              <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
                <Button title={t('common.cancel')} variant="outline" onPress={() => setEditing(null)} disabled={busy || uploading} style={styles.flex} />
                <Button title={editing.row ? t('branches.update') : t('branches.create')} loading={busy} disabled={uploading} onPress={save} style={styles.flex} />
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
  list: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: 4, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  no: { fontSize: font.small, color: colors.mutedForeground, minWidth: 18 },
  img: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.muted },
  imgBig: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.muted },
  noimg: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  title: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', marginTop: space.sm },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  body: { fontSize: font.small, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  error: { fontSize: font.small, color: colors.destructive },
  form: { padding: space.md, gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
