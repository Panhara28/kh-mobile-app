import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import { formatMoney } from '@/lib/money';
import { useRecordWriter } from '@/lib/offline/use-record';
import { OPTIONAL_HEADERS, parseSheet, REQUIRED_HEADERS, rowWarnings, uploadBody, type Cell, type ExcelRow } from '@/lib/product-import';
import { useBranch } from '@/lib/use-branch';
import { Button, Card } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * Import products from an Excel file, like the web "Upload Excel": pick the .xlsx, see how many rows
 * were read and what looks wrong, then upload. The sheet needs Code, Name, Price and Product Group;
 * RSP, Estimation GP, Stocks, Vendor Name and Cost are read when present. Main branch only; needs the server.
 */
export default function ProductImportScreen() {
  const { t } = useTranslation();
  const writer = useRecordWriter();
  const { currency } = useBranch();
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function pick() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    const asset = r.assets?.[0];
    if (r.canceled || !asset) return;
    setDone(false);
    setFile(asset.name);
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const wb = XLSX.read(b64, { type: 'base64' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const cells = XLSX.utils.sheet_to_json<Cell[]>(sheet!, { header: 1, defval: null, blankrows: false });
      const parsed = parseSheet(cells);
      setErrors(parsed.errors);
      setRows(parsed.data);
    } catch (e) {
      setRows([]);
      setErrors([e instanceof Error ? e.message : t('import.unreadable')]);
    }
  }

  function upload() {
    void (async () => {
      setBusy(true);
      try {
        // the sheet was read on the phone: its rows are sent at once, or kept on the phone and sent once when kh-pos can be reached
        const how = await writer({ entity: 'product-import', op: 'action', recordId: `import:${Date.now()}`, method: 'POST', path: '/api/upload-excel', body: uploadBody(rows), once: true, label: `${t('import.title')} (${rows.length})` });
        setDone(true);
        const count = rows.length;
        setRows([]);
        Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('import.done', { count }));
      } catch (e) {
        Alert.alert(t('import.failed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  const warnings = rowWarnings(rows);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('import.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.heading}>{t('import.columns')}</Text>
          <Text style={styles.muted}>{t('import.required', { list: REQUIRED_HEADERS.join(', ') })}</Text>
          <Text style={styles.muted}>{t('import.optional', { list: [...OPTIONAL_HEADERS, 'Cost'].join(', ') })}</Text>
          <Button title={t('import.choose')} variant="outline" onPress={() => void pick()} />
          {file ? <Text style={styles.muted}>{file}</Text> : null}
        </Card>

        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            {e}
          </Text>
        ))}
        {done ? <Text style={styles.ok}>{t('import.uploaded')}</Text> : null}

        {rows.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.heading}>{t('import.rows', { count: rows.length })}</Text>
            {rows.slice(0, 8).map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.flex, styles.body]} numberOfLines={1}>
                  {r.barcode} · {r.description}
                </Text>
                <Text style={styles.body}>{formatMoney(r.rsp, currency)}</Text>
              </View>
            ))}
            {rows.length > 8 ? <Text style={styles.muted}>{t('import.more', { count: rows.length - 8 })}</Text> : null}
            {warnings.slice(0, 5).map((w) => (
              <Text key={w} style={styles.warn}>
                {w}
              </Text>
            ))}
            {warnings.length > 5 ? <Text style={styles.warn}>{t('import.moreWarnings', { count: warnings.length - 5 })}</Text> : null}
            <Button title={t('import.upload', { count: rows.length })} loading={busy} onPress={upload} />
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
