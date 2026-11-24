/**
 * Mirrors the kh-pos web menu theme (shadcn "zinc", src/app/globals.css in kh-pos) so the app
 * looks like the web menu customers already know.
 */
export const colors = {
  background: '#ffffff',
  /** Page behind cards (web: bg-muted/40). */
  page: '#f5f7fb',
  foreground: '#09090b',
  card: '#ffffff',
  /** BongIT blue: the web app's --primary / brand gradient start. */
  primary: '#0B43C7',
  primaryForeground: '#ffffff',
  /** The brand gradient (web --brand-from / --brand-to) and a soft blue for icon tiles. */
  brandFrom: '#0B43C7',
  brandTo: '#1F8BFF',
  brandSoft: '#eef3ff',
  secondary: '#f4f4f5',
  muted: '#f4f4f5',
  mutedForeground: '#71717a',
  border: '#e4e4e7',
  destructive: '#ef4444',
  destructiveForeground: '#fafafa',
  destructiveBg: '#fee2e2',
  success: '#16a34a',
  successBg: '#dcfce7',
  warning: '#d97706',
  warningBg: '#fef3c7',
  info: '#2563eb',
  infoBg: '#dbeafe',
  overlay: 'rgba(0,0,0,0.5)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Web --radius is 0.5rem; cards use rounded-xl. */
export const radius = { sm: 6, md: 8, lg: 12, full: 999 } as const;

/** Khmer script needs extra line height so stacked vowels aren't clipped. */
export const font = { small: 13, body: 15, title: 18, heading: 22, lineHeight: 22 } as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;
