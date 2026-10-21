import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useOffline } from '@/lib/offline/provider';
import { useSession } from '@/lib/session';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * The live preview of the Invoice Receipt setting: kh-pos' own receipt templates with the web's sample order, shown in a
 * WebView (kh-pos serves the page `/invoice/preview`). The app gives the page its login token and sends the setting's
 * text as it is edited. Needs the server (the templates live there).
 */
export function InvoicePreview({ value }: { value: string }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const { state } = useOffline();
  const ref = useRef<WebView>(null);
  const [first] = useState(value);
  const token = api.token ?? '';

  // the edited text goes to the page a moment after typing stops
  useEffect(() => {
    const h = setTimeout(() => ref.current?.injectJavaScript(`window.__setInvoiceValue && window.__setInvoiceValue(${JSON.stringify(value)}); true;`), 250);
    return () => clearTimeout(h);
  }, [value]);

  if (!state.online || !api.baseUrl) {
    return <Text style={styles.note}>{t('sg.previewOffline')}</Text>;
  }
  const before = `window.__KHPOS_TOKEN__ = ${JSON.stringify(token)}; window.__INVOICE_VALUE__ = ${JSON.stringify(first)}; true;`;
  return (
    <View style={styles.box}>
      <WebView
        ref={ref}
        source={{ uri: `${api.baseUrl}/invoice/preview` }}
        injectedJavaScriptBeforeContentLoaded={before}
        originWhitelist={[api.baseUrl]}
        javaScriptEnabled
        nestedScrollEnabled
        startInLoadingState
        style={styles.web}
        onError={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 460, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: '#f4f4f5' },
  web: { flex: 1, backgroundColor: '#f4f4f5' },
  note: { fontSize: font.small, color: colors.mutedForeground, padding: space.sm },
});
