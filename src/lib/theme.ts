// Design tokens — "Event Insight" brand system (Investigations Differently).
// High-fidelity handoff: colours, type, radii, shadows are final.

export const colors = {
  // brand
  orange: '#E4772A', // Signal Orange — primary accent: "Event", CTAs, high priority
  navy: '#1B2B3A', // Ink Navy — headers, dark surfaces
  navyText: '#17262D', // primary text on light
  teal: '#2CA5C0', // Insight Teal — links, data, "Insight", review tags
  eyebrow: '#7FC4D6', // teal-tint mono kicker on navy

  // surfaces
  bg: '#F6F5F1', // Paper — app/screen background
  surface: '#FFFFFF', // cards
  border: '#E5E3DC', // card borders, dividers

  // text
  text: '#17262D',
  slate: '#5D6B70', // secondary text
  muted: '#8A9499', // tertiary text, mono labels
  textMuted: '#5D6B70', // alias (legacy usages)
  textOnNavy: '#FFFFFF',
  textOnPrimary: '#FFFFFF',

  // status
  success: '#1E9E5A',
  warning: '#D98A11',
  danger: '#D64545',

  // tints (pills / chips) — accent at low alpha
  orangeTint: 'rgba(228,119,42,0.14)',
  tealTint: 'rgba(44,165,192,0.14)',

  // convenience aliases used across existing screens
  primary: '#E4772A', // primary CTA = Signal Orange
  primaryDark: '#C9641F',
  primarySoft: 'rgba(228,119,42,0.14)',
  accent: '#2CA5C0',
  surfaceAlt: '#EFEDE6',
  borderStrong: '#D8D5CC',
  navyDeep: '#12202B',
  successSoft: '#E4F5EC',
  warningSoft: '#FBF0DA',
  dangerSoft: '#FBE6E6',
  navySoft: '#3A4E58',
  overlay: 'rgba(23,38,45,0.45)',
};

// Type families (loaded in app/_layout.tsx via @expo-google-fonts).
export const fonts = {
  display: 'Archivo_800ExtraBold', // wordmark, big numbers, H1
  displayBold: 'Archivo_700Bold', // section headings
  body: 'PublicSans_400Regular',
  bodyMed: 'PublicSans_500Medium',
  bodySemi: 'PublicSans_600SemiBold',
  bodyBold: 'PublicSans_700Bold',
  mono: 'IBMPlexMono_500Medium', // eyebrows, IDs, labels
  monoReg: 'IBMPlexMono_400Regular',
};

export const spacing = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#17262D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  raised: {
    shadowColor: '#17262D',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.22,
    shadowRadius: 60,
    elevation: 8,
  },
} as const;

// Quality score → colour band (audio quality, not accuracy).
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return colors.muted;
  if (score >= 85) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.danger;
}
