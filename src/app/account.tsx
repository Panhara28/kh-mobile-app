import { chooseLanguage } from '@/i18n/saved-language';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n, { isLanguage, type Language } from '@/i18n';
import { DEFAULT_PRINT_URL, isValidPrintUrl, passwordChecks, passwordFormValid, passwordStrength, type PrintMethod } from '@/lib/account';
import { testConnection } from '@/lib/print-server';
import { ScanPrintUrl } from '@/ui/scan-print-url';
import { loadDevice, saveDeviceLabel, savePrinterName, savePrintMethod, savePrintUrl, type DeviceSettings } from '@/lib/device';
import { can } from '@/lib/line';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { useShift } from '@/lib/use-shift';
import { Button, Card, Field, Segmented } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * The profile menu of the web app on the phone: who you are, Open / Close Shift, Change Password
 * (with the strength checklist), Name this device, Print & Device Settings, Settings, Language, Log out.
 */
export default function AccountScreen() {
  const { t } = useTranslation();
  const { user, logout } = useSession();
  const writer = useRecordWriter();
  const { shift, reload } = useShift();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<DeviceSettings | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState(DEFAULT_PRINT_URL);
  const [printer, setPrinter] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const language: Language = isLanguage(i18n.language) ? i18n.language : 'km';

  useEffect(() => {
    void reload();
    loadDevice().then((d) => {
      setDevice(d);
      setLabel(d.label);
      setUrl(d.printUrl);
      setPrinter(d.printer);
    });
  }, [reload]);

  const checks = passwordChecks(newPassword);
  const strength = passwordStrength(newPassword);
  const strengthColor = strength === 'weak' ? colors.destructive : strength === 'medium' ? colors.warning : colors.success;
  const valid = passwordFormValid(oldPassword, newPassword, confirm);
  const mayShift = can(user, 'shift', 'create');

  const changePassword = useCallback(() => {
    if (!valid) {
      Alert.alert(t('account.checkAll'));
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        // sent at once, or kept on the phone (sealed) and sent when kh-pos can be reached
        const how = await writer({ entity: 'account', op: 'action', recordId: 'change-password', method: 'POST', path: '/api/user/change-password', body: { oldPassword, newPassword }, secret: true, once: true, label: t('account.changePassword') });
        setOldPassword('');
        setNewPassword('');
        setConfirm('');
        Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('account.passwordChangedOk'));
      } catch (e) {
        Alert.alert(t('account.passwordFailed'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }, [valid, writer, oldPassword, newPassword, t]);

  async function saveLabel() {
    if (!device) return;
    const l = await saveDeviceLabel(device.id, label);
    setLabel(l);
    Alert.alert(l ? t('account.deviceNamed', { name: l }) : t('account.deviceCleared'));
  }

  async function saveUrl() {
    if (!isValidPrintUrl(url)) {
      Alert.alert(t('account.urlInvalid'));
      return;
    }
    await savePrintUrl(url);
    Alert.alert(t('account.urlSaved'));
  }

  async function resetUrl() {
    await savePrintUrl('');
    setUrl(DEFAULT_PRINT_URL);
    setTestResult(null);
    Alert.alert(t('account.urlReset'));
  }

  async function test() {
    if (!isValidPrintUrl(url)) {
      Alert.alert(t('account.urlInvalid'));
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestResult(await testConnection(url.trim()));
    setTesting(false);
  }

  async function chooseMethod(m: PrintMethod) {
    setDevice((d) => (d ? { ...d, method: m } : d));
    await savePrintMethod(m);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.account')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.heading}>{user?.fullname || user?.username}</Text>
          <Text style={styles.muted}>{[user?.username, user?.role?.role, user?.warehouse?.name].filter(Boolean).join(' · ')}</Text>
          {mayShift || shift ? <Button title={shift ? t('account.closeShift') : t('account.openShift')} variant="outline" onPress={() => router.push('/shift')} /> : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('common.language')}</Text>
          <Segmented
            options={[
              { value: 'km', label: 'ខ្មែរ' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={(l) => void chooseLanguage(l)}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('account.changePassword')}</Text>
          <Text style={styles.muted}>{t('account.changeHint')}</Text>
          <Field label={t('account.oldPassword')} value={oldPassword} onChangeText={setOldPassword} secureTextEntry={!showPw} autoCapitalize="none" placeholder={t('account.oldPlaceholder')} />
          <Field label={t('users.newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPw} autoCapitalize="none" placeholder={t('account.newPlaceholder')} />
          {strength !== 'none' ? <Text style={[styles.strength, { color: strengthColor }]}>{t(`account.strength_${strength}`)}</Text> : null}
          {newPassword ? (
            <View style={styles.checks}>
              <Check ok={checks.minLength} text={t('account.check_min')} />
              <Check ok={checks.hasUpperCase} text={t('account.check_upper')} />
              <Check ok={checks.hasLowerCase} text={t('account.check_lower')} />
              <Check ok={checks.hasNumber} text={t('account.check_number')} />
              <Check ok={checks.hasSpecialChar} text={t('account.check_special')} />
            </View>
          ) : null}
          <Field label={t('account.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry={!showPw} autoCapitalize="none" placeholder={t('account.confirmPlaceholder')} />
          {confirm && confirm !== newPassword ? <Text style={styles.error}>{t('account.noMatch')}</Text> : null}
          <View style={styles.row}>
            <Button title={showPw ? t('branches.hide') : t('branches.show')} variant="ghost" size="sm" onPress={() => setShowPw((s) => !s)} />
            <Button title={t('account.changePassword')} loading={busy} disabled={!valid} onPress={changePassword} />
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('account.nameDevice')}</Text>
          <Text style={styles.muted}>{t('account.nameHint')}</Text>
          <Field label={t('account.deviceName')} value={label} onChangeText={setLabel} placeholder={t('account.deviceExample')} maxLength={100} />
          <View style={styles.info}>
            <Text style={styles.muted}>{t('account.deviceId')}</Text>
            <Text style={styles.mono}>{device?.id ?? ''}</Text>
          </View>
          <Button title={t('customize.save')} variant="outline" onPress={() => void saveLabel()} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.section}>{t('account.printSettings')}</Text>
          <Text style={styles.heading2}>{t('account.printServer')}</Text>
          <Text style={styles.muted}>{t('account.printServerHint')}</Text>
          <Field label="ws://" value={url} onChangeText={(v) => { setUrl(v); setTestResult(null); }} autoCapitalize="none" autoCorrect={false} placeholder={DEFAULT_PRINT_URL} />
          {!isValidPrintUrl(url) && url.trim() ? <Text style={styles.error}>{t('account.urlInvalid')}</Text> : null}
          <View style={styles.row}>
            <Button title={`▦ ${t('account.scan')}`} variant="outline" size="sm" onPress={() => setScanning(true)} />
            <Button title={testing ? t('account.testing') : t('account.test')} variant="outline" size="sm" disabled={testing || !isValidPrintUrl(url)} onPress={() => void test()} />
            <Button title={t('customize.save')} size="sm" disabled={!isValidPrintUrl(url)} onPress={() => void saveUrl()} />
            <Button title={t('account.reset')} variant="outline" size="sm" onPress={() => void resetUrl()} />
          </View>
          {testResult ? <Text style={{ color: testResult.ok ? colors.success : colors.destructive, fontSize: font.small, fontWeight: '600' }}>{testResult.ok ? '✓ ' : '✕ '}{testResult.message}</Text> : null}
          {scanning ? <ScanPrintUrl onCancel={() => setScanning(false)} onDone={(u) => { setUrl(u); setTestResult(null); setScanning(false); Alert.alert(t('account.scanned')); }} /> : null}

          <Text style={styles.heading2}>{t('account.receiptPrinting')}</Text>
          <Text style={styles.muted}>{t('account.receiptHint')}</Text>
          <Segmented
            options={[
              { value: 'browser', label: t('account.method_browser') },
              { value: 'print_server', label: t('account.method_server') },
            ]}
            value={device?.method ?? 'browser'}
            onChange={(m) => void chooseMethod(m as PrintMethod)}
          />
          {device?.method === 'print_server' ? (
            <>
              <Field label={t('account.printerName')} value={printer} onChangeText={setPrinter} onBlur={() => void savePrinterName(printer)} autoCapitalize="none" placeholder="XP-80C" />
              {!printer.trim() ? <Text style={styles.error}>{t('account.pickPrinter')}</Text> : null}
            </>
          ) : null}
        </Card>

        {can(user, 'setting', 'read') ? <Button title={t('more.settings')} variant="outline" onPress={() => router.push('/settings')} /> : null}

        <View>
          <Button
            title={t('common.logout')}
            variant="outline"
            onPress={() =>
              Alert.alert(t('session.logoutConfirm'), undefined, [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.logout'), style: 'destructive', onPress: () => void logout() },
              ])
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <Text style={{ fontSize: font.small, color: ok ? colors.success : colors.mutedForeground }}>
      {ok ? '✓' : '○'} {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, gap: space.md },
  card: { padding: space.md, gap: space.sm, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap' },
  checks: { gap: 2 },
  info: { backgroundColor: colors.muted, borderRadius: radius.md, padding: space.sm, gap: 2 },
  heading: { fontSize: font.title, fontWeight: '700', color: colors.foreground },
  heading2: { fontSize: font.body, fontWeight: '700', color: colors.foreground, marginTop: space.xs },
  section: { fontSize: font.small, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase' },
  muted: { fontSize: font.small, color: colors.mutedForeground },
  mono: { fontSize: 11, color: colors.foreground, fontFamily: 'monospace' },
  strength: { fontSize: font.small, fontWeight: '700' },
  error: { fontSize: font.small, color: colors.destructive },
});
