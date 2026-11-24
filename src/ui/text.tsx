import { createContext, useContext, useMemo, type ComponentRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

/**
 * Krasar, the app's Khmer typeface (assets/fonts, loaded in app/_layout.tsx). Every Text and TextInput
 * in the app comes from here, so the whole app switches font with the language: Krasar in Khmer, the
 * system font in English.
 */
export const KRASAR_FONTS = {
  'Krasar-Regular': require('../../assets/fonts/Krasar-Regular.ttf'),
  'Krasar-Medium': require('../../assets/fonts/Krasar-Medium.ttf'),
  'Krasar-Bold': require('../../assets/fonts/Krasar-Bold.ttf'),
};

/** The Krasar file for a weight (Android picks a font file by name, not by fontWeight). */
export function krasarFamily(weight: TextStyle['fontWeight']): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight);
  if (w >= 700) return 'Krasar-Bold';
  if (w >= 500) return 'Krasar-Medium';
  return 'Krasar-Regular';
}

/**
 * The style with Krasar applied, unless the text already asks for a font of its own (e.g. monospace).
 * Text inside another Text keeps its parent's font unless it sets a weight of its own.
 */
export function withKrasar(style: StyleProp<TextStyle>, nested = false): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return style;
  if (nested && flat.fontWeight == null) return style;
  // the weight is carried by the file; leaving fontWeight on would make Android fall back to the system font
  return [style, { fontFamily: krasarFamily(flat.fontWeight), fontWeight: 'normal' }];
}

function useKhmer(): boolean {
  const { i18n } = useTranslation();
  return i18n.language === 'km';
}

/** Set inside a Text, so a nested Text can inherit its parent's font. */
const InText = createContext(false);

export function Text({ style, ref, ...props }: TextProps & { ref?: Ref<ComponentRef<typeof RNText>> }) {
  const khmer = useKhmer();
  const nested = useContext(InText);
  const styled = useMemo(() => (khmer ? withKrasar(style, nested) : style), [khmer, nested, style]);
  return (
    <InText.Provider value>
      <RNText ref={ref} {...props} style={styled} />
    </InText.Provider>
  );
}

export function TextInput({ style, ref, ...props }: TextInputProps & { ref?: Ref<ComponentRef<typeof RNTextInput>> }) {
  const khmer = useKhmer();
  const styled = useMemo(() => (khmer ? withKrasar(style) : style), [khmer, style]);
  return <RNTextInput ref={ref} {...props} style={styled} />;
}
