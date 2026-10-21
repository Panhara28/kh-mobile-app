import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import { useRecordWriter } from '@/lib/offline/use-record';
import type { Cell } from '@/lib/product-import';
import { fileProblem, parseUserSheet, UPLOAD_PASSWORD, USER_REQUIRED_HEADERS, userRowWarnings, userUploadBody, type UserExcelRow } from '@/lib/user-import';
import { Button, Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Settings > Users > Upload Excel, like the web: pick the .xlsx (Full Name, Username, Phone Number, Position,
 * Profile), see how many rows were read and what looks wrong, then upload. kh-pos gives every new user the
 * password 123456, so they should change it. Needs the server.
 */
export default function UserImportScreen() {
  const { t } = useTranslation();
  const writer = useRecordWriter();
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<UserExcelRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function pick() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    setDone(false);
    setFile(asset.name);
    setRows([]);
    const problem = fileProblem(asset.name, asset.size);
    if (problem) {
      setErrors([problem]);
      return;
    }
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const wb = XLSX.read(b64, { type: 'base64' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const cells = XLSX.utils.sheet_to_json<Cell[]>(sheet!, { header: 1, defval: null, blankrows: false });
      const parsed = parseUserSheet(cells);
      setErrors(parsed.errors);
      setRows(parsed.data);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : t('uimport.unreadable')]);
    }
  }

  function upload() {
    void (async () => {
      setBusy(true);
      try {
        // the rows give new users a password: sealed on the phone if they have to wait for kh-pos
        const how = await writer({ entity: 'user-import', op: 'action', recordId: `import:${Date.now()}`, method: 'POST', path: '/api/upload-excel/user', body: userUploadBody(rows), secret: true, once: true, label: `${t('uimport.button')} (${rows.length})` });
        setDone(true);
        const count = rows.length;
        setRows([]);
        Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('uimport.done', { count }), undefined, [{ text: 'OK', onPress: () => router.back() }]);
      } catch (e) {
        Alert.alert(t('uimport.failed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  const warnings = userRowWarnings(rows);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('uimport.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.heading}>{t('uimport.columns')}</Text>
          <Text style={styles.muted}>{t('uimport.required', { list: USER_REQUIRED_HEADERS.join(', ') })}</Text>
          <Text style={styles.muted}>{t('uimport.example')}</Text>
          <Text style={styles.warn}>{t('uimport.password', { password: UPLOAD_PASSWORD })}</Text>
          <Button title={t('uimport.choose')} variant="outline" onPress={() => void pick()} />
          {file ? <Text style={styles.muted}>{file}</Text> : null}
        </Card>

        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            {e}
          </Text>
        ))}
        {done ? <Text style={styles.ok}>{t('uimport.uploaded')}</Text> : null}

        {rows.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.heading}>{t('uimport.rows', { count: rows.length })}</Text>
            {rows.slice(0, 8).map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.flex, styles.body]} numberOfLines={1}>
                  {r.username} · {r.fullName}
                </Text>
                <Text style={styles.muted}>{r.position}</Text>
              </View>
            ))}
            {rows.length > 8 ? <Text style={styles.muted}>{t('uimport.more', { count: rows.length - 8 })}</Text> : null}
            {warnings.slice(0, 5).map((w) => (
              <Text key={w} style={styles.warn}>
                {w}
              </Text>
            ))}
            {warnings.length > 5 ? <Text style={styles.warn}>{t('uimport.moreWarnings', { count: warnings.length - 5 })}</Text> : null}
            <Button title={t('uimport.upload', { count: rows.length })} loading={busy} onPress={upload} />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: space.md, gap: space.sm },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heading: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  body: { fontSize: font.body, color: colors.foreground },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  warn: { fontSize: font.small, color: colors.warning },
  error: { fontSize: font.small, color: colors.destructive },
  ok: { fontSize: font.body, color: colors.success },
});
