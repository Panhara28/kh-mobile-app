import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import type { KhPosApi } from '@/lib/api';
import { MOVIE_GENRES, MOVIE_RATINGS, type MovieData } from '@/lib/product-form';
import { Button, Chip, Input } from '@/ui/components';
import { TagsField } from '@/ui/form-fields';
import { pictureValue } from '@/lib/offline/uploads';
import { NumInput, ToggleRow } from './parts';
import { colors, font, radius, space } from '@/ui/theme';

/** The largest trailer the phone sends: it is read into memory and sent as text, so it is far below the web's 150 MB. */
const MAX_TRAILER_BYTES = 30 * 1024 * 1024;

/**
 * "Movie Information" for the cinema category: poster, trailer, duration, release date, director,
 * producer share, 10% tax, content rating, genres, cast, producer emails and synopsis.
 */
export function MovieSection({ api, movie, onChange, guard }: { api: KhPosApi; movie: MovieData; onChange: (m: MovieData) => void; guard: (action: () => void) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'poster' | 'trailer' | null>(null);
  const patch = (p: Partial<MovieData>) => onChange({ ...movie, ...p });

  async function pickPoster() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8, mediaTypes: ['images'] });
    const b64 = r.assets?.[0]?.base64;
    if (r.canceled || !b64) return;
    guard(() => {
      void (async () => {
        setBusy('poster');
        try {
          patch({ posterUrl: pictureValue(b64) });
        } catch (e) {
          Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(null);
        }
      })();
    });
  }

  async function pickTrailer() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('products.noPermission'));
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    if ((asset.fileSize ?? 0) > MAX_TRAILER_BYTES) {
      Alert.alert(t('pform.trailerTooBig', { mb: Math.round(MAX_TRAILER_BYTES / 1024 / 1024) }));
      return;
    }
    guard(() => {
      void (async () => {
        setBusy('trailer');
        try {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
          const ext = (asset.uri.split('.').pop() ?? 'mp4').toLowerCase().slice(0, 4);
          patch({ trailerUrl: pictureValue(b64, ext) });
        } catch (e) {
          Alert.alert(t('products.uploadFailed'), e instanceof Error ? e.message : undefined);
        } finally {
          setBusy(null);
        }
      })();
    });
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{t('pform.poster')}</Text>
      <View style={styles.row}>
        {movie.posterUrl ? <Image source={{ uri: movie.posterUrl }} style={styles.poster} resizeMode="cover" /> : <View style={[styles.poster, styles.none]} />}
        <View style={styles.flex}>
          <Button title={t('pform.choosePoster')} variant="outline" size="sm" loading={busy === 'poster'} onPress={() => void pickPoster()} />
          {movie.posterUrl ? <Button title={t('pform.remove')} variant="ghost" size="sm" onPress={() => patch({ posterUrl: null })} /> : null}
        </View>
      </View>

      <Text style={styles.label}>{t('pform.trailer')}</Text>
      <Input value={movie.trailerUrl ?? ''} onChangeText={(v) => patch({ trailerUrl: v.trim() ? v : null })} placeholder="https://" autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('pform.trailer')} />
      <View style={styles.row}>
        <Button title={t('pform.chooseTrailer')} variant="outline" size="sm" loading={busy === 'trailer'} onPress={() => void pickTrailer()} />
        {movie.trailerUrl ? <Button title={t('pform.remove')} variant="ghost" size="sm" onPress={() => patch({ trailerUrl: null })} /> : null}
      </View>

      <NumInput label={t('pform.duration')} value={movie.durationMinutes || null} decimal={false} placeholder="120" onChange={(n) => patch({ durationMinutes: Math.floor(n ?? 0) })} />
      <Text style={styles.label}>{t('pform.releaseDate')}</Text>
      <Input value={movie.releaseDate} onChangeText={(v) => patch({ releaseDate: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" accessibilityLabel={t('pform.releaseDate')} />
      <Text style={styles.label}>{t('pform.director')}</Text>
      <Input value={movie.director ?? ''} onChangeText={(v) => patch({ director: v })} accessibilityLabel={t('pform.director')} />
      <NumInput label={t('pform.producerShare')} value={movie.producerShare ?? 0} decimal onChange={(n) => patch({ producerShare: n ?? 0 })} />
      <ToggleRow label={t('pform.tax10')} value={movie.taxRate === 10} onChange={(on) => patch({ taxRate: on ? 10 : 0 })} />

      <Text style={styles.label}>{t('pform.rating')}</Text>
      <View style={styles.chips}>
        {MOVIE_RATINGS.map((r) => (
          <Chip key={r} label={r} selected={movie.rating === r} onPress={() => patch({ rating: r })} />
        ))}
      </View>

      <Text style={styles.label}>{t('pform.genres')}</Text>
      <View style={styles.chips}>
        {MOVIE_GENRES.map((g) => (
          <Chip key={g} label={g} selected={(movie.genre ?? []).includes(g)} onPress={() => patch({ genre: (movie.genre ?? []).includes(g) ? (movie.genre ?? []).filter((x) => x !== g) : [...(movie.genre ?? []), g] })} />
        ))}
      </View>
      <TagsField label={t('pform.genresOther')} values={(movie.genre ?? []).filter((g) => !MOVIE_GENRES.includes(g))} onChange={(extra) => patch({ genre: [...(movie.genre ?? []).filter((g) => MOVIE_GENRES.includes(g)), ...extra] })} />
      <TagsField label={t('pform.cast')} values={movie.cast ?? []} onChange={(v) => patch({ cast: v })} />
      <TagsField label={t('pform.emailProducer')} values={movie.emailProducer ?? []} onChange={(v) => patch({ emailProducer: v })} />

      <Text style={styles.label}>{t('pform.synopsis')}</Text>
      <Input value={movie.synopsis ?? ''} onChangeText={(v) => patch({ synopsis: v })} multiline style={styles.multi} accessibilityLabel={t('pform.synopsis')} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  flex: { flex: 1, gap: 4, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.mutedForeground },
  poster: { width: 100, height: 140, borderRadius: radius.md, backgroundColor: colors.muted },
  none: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  multi: { minHeight: 100, textAlignVertical: 'top' },
});
