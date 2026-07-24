// Minimal design tokens. Dark, calm palette suited to field use.
export const colors = {
  bg: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#273449',
  border: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#38BDF8',
  primaryText: '#082F49',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  overlay: 'rgba(0,0,0,0.5)',
};

export const spacing = (n: number) => n * 4;

export const radius = { sm: 6, md: 10, lg: 16 };

// Score → colour band for quality scores (audio quality, not accuracy).
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return colors.textMuted;
  if (score >= 85) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.danger;
}
