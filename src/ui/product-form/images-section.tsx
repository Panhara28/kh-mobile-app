import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pictureValue } from '@/lib/offline/uploads';
import { addImages, removeImage, unbindImage, type ProductFormData } from '@/lib/product-form';
import { Button } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Product pictures like the web "Product Images": upload several at once (library or camera),
 * see which variant each is bound to, unbind, delete, and open one to preview it.
 */
export function ImagesSection({ form, onChange }: { form: ProductFormData; onChange: (f: ProductFormData) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function pick(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7, mediaTypes: ['images'] })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7, mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 });
    const assets = (result.assets ?? []).filter((a) => !!a.base64);
    if (result.canceled || assets.length === 0) return;
    {
      void (async () => {
        const urls: string[] = [];
        try {
          for (const [i, a] of assets.entries()) {
            setBusy(t('pform.uploading', { done: i + 1, total: assets.length }));
            urls.push(pictureValue(a.base64!));
          }
        } catch (e) {
          Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(null);
          if (urls.length > 0) onChange(addImages(form, urls, () => Crypto.randomUUID()));
        }
      })();
    }
  }

  return (
    <View style={styles.box}>
      <View style={styles.buttons}>
        <Button title={t('pform.uploadImages')} variant="outline" size="sm" onPress={() => void pick(false)} loading={!!busy} />
        <Button title={t('products.takePhoto')} variant="outline" size="sm" onPress={() => void pick(true)} />
      </View>
      {busy ? <Text style={styles.muted}>{busy}</Text> : null}
      {form.images.length === 0 ? <Text style={styles.muted}>{t('pform.noImages')}</Text> : null}
      <View style={styles.grid}>
        {form.images.map((im, i) => {
          const variant = form.variants.find((v) => v.id === im.productVariantId);
          return (
            <View key={im.id || i} style={styles.tile}>
              <Pressable onPress={() => setPreview(im.url)} accessibilityRole="button" accessibilityLabel={t('pform.preview')}>
                <Image source={{ uri: im.url }} style={styles.image} resizeMode="contain" />
              </Pressable>
              {variant ? <Text style={styles.bound} numberOfLines={1}>{variant.name}</Text> : null}
              <View style={styles.tileActions}>
                {im.productVariantId ? <Text style={styles.action} onPress={() => onChange(unbindImage(form, i))}>{t('pform.unbind')}</Text> : null}
                <Text style={[styles.action, styles.delete]} onPress={() => onChange(removeImage(form, i))}>{t('admin.delete')}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.overlay} onPress={() => setPreview(null)}>
          {preview ? <Image source={{ uri: preview }} style={styles.big} resizeMode="contain" /> : null}
          <View style={{ paddingBottom: insets.bottom + space.md }}>
            <Button title={t('common.close')} variant="outline" onPress={() => setPreview(null)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: 104, gap: 4 },
  image: { width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.muted },
  bound: { fontSize: 11, color: colors.primary, textAlign: 'center' },
  tileActions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { fontSize: 12, color: colors.primary },
  delete: { color: colors.destructive },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: space.md, gap: space.md },
  big: { width: '100%', height: '75%' },
});
