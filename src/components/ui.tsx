import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, shadow, spacing } from '@/lib/theme';

// Brand marks (246x246). Teal ID for chips/lockups; slate ID for dark watermark.
const ID_MARK = require('../../assets/id-mark-color.png');
const ID_WATERMARK = require('../../assets/id-mark.png');

// ---- Screen wrappers -------------------------------------------------------
export function Screen({
  children,
  scroll = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.scrollContent}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// Full-bleed navy header + paper scrolling body.
export function HeaderScreen({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: insets.bottom + spacing(8) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

// ---- Brand -----------------------------------------------------------------
// Wordmark: "Event" (orange) + "Insight" (navy on light) — Archivo 800, no space.
export function Brand({ compact }: { compact?: boolean }) {
  const size = compact ? 44 : 62;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) }}>
      <Image source={ID_MARK} style={{ width: size, height: size }} resizeMode="contain" />
      <View>
        <Text style={styles.eyebrow}>BY INVESTIGATIONS DIFFERENTLY</Text>
        <Text style={compact ? styles.wordmarkSm : styles.wordmarkLg}>
          Event<Text style={{ color: colors.navyText }}>Insight</Text>
        </Text>
      </View>
    </View>
  );
}

// Navy hero header — mirrors the brand reference top-to-bottom: an action row that
// sits over the safe-area band, then eyebrow → wordmark → an optional headline stat
// (big number + pill), with a faded ID watermark bleeding off the top-right. Every
// line is left-aligned and single-line, so nothing wraps out of alignment.
export function NavyHeader({
  stat,
  right,
}: {
  stat?: { label: string; value: number | string; pill?: string };
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top + spacing(2) }]}>
      <Image source={ID_WATERMARK} style={styles.heroWatermark} resizeMode="contain" />
      {right ? <View style={styles.heroActions}>{right}</View> : null}
      <Text style={styles.heroEyebrow} numberOfLines={1} adjustsFontSizeToFit>
        BY INVESTIGATIONS DIFFERENTLY
      </Text>
      <Text style={styles.heroWordmark} numberOfLines={1}>
        Event<Text style={{ color: colors.textOnNavy }}>Insight</Text>
      </Text>
      {stat ? (
        <>
          <Text style={styles.heroStatLabel}>{stat.label}</Text>
          <View style={styles.heroStatRow}>
            <Text style={styles.heroStatNum}>{stat.value}</Text>
            {stat.pill ? (
              <View style={styles.heroStatPill}>
                <Text style={styles.heroStatPillText}>{stat.pill}</Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ---- Typography ------------------------------------------------------------
export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={[styles.p, muted && styles.muted]}>{children}</Text>;
}
export function Eyebrow({ children, onDark }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <Text style={[styles.eyebrow, !onDark && { color: colors.muted }]}>{children}</Text>
  );
}

// ---- Surfaces --------------------------------------------------------------
export function Card({
  children,
  onPress,
  style,
  accent,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  accent?: string; // 4px left accent border
}) {
  const s = [styles.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  return <View style={s}>{children}</View>;
}

type Variant = 'primary' | 'navy' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        v.border ? { borderWidth: 1 } : null,
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.orange, fg: colors.textOnPrimary },
  navy: { bg: colors.navy, fg: colors.textOnNavy },
  secondary: { bg: colors.surface, fg: colors.navyText, border: colors.border },
  danger: { bg: colors.danger, fg: '#FFFFFF' },
  ghost: { bg: 'transparent', fg: colors.slate, border: colors.border },
};

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: spacing(3) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Badge({
  text,
  color = colors.slate,
  soft,
}: {
  text: string;
  color?: string;
  soft?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        soft ? { backgroundColor: color + '22', borderColor: 'transparent' } : { borderColor: color },
      ]}
    >
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

// ---- Tiles -----------------------------------------------------------------
export function StatTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | string;
  unit?: string;
  accent?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value}
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ActionTile({
  title,
  subtitle,
  onPress,
  value,
  valueColor,
  tone = 'default',
  accent,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  value?: string;
  valueColor?: string;
  tone?: 'default' | 'primary';
  accent?: string;
}) {
  const primary = tone === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionTile,
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        primary && { backgroundColor: colors.orange, borderColor: colors.orange },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, primary && { color: colors.textOnPrimary }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.actionSub, primary && { color: '#FDEBDD' }]}>{subtitle}</Text>
        ) : null}
      </View>
      {value ? (
        <View style={[styles.pill, { backgroundColor: (valueColor ?? colors.slate) + '22' }]}>
          <Text style={[styles.pillText, { color: valueColor ?? colors.slate }]}>{value}</Text>
        </View>
      ) : null}
      <Text style={[styles.chevron, primary && { color: colors.textOnPrimary }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing(5), gap: spacing(3), flexGrow: 1 },
  bodyContent: { padding: spacing(5), gap: spacing(3) },

  // hero
  hero: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(6),
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    right: -30,
    top: spacing(3),
    width: 168,
    height: 150,
    opacity: 0.1,
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 32,
    marginBottom: spacing(1),
  },
  heroWordmark: {
    fontFamily: fonts.display,
    color: colors.orange,
    fontSize: 34,
    letterSpacing: -0.6,
    lineHeight: 38,
    marginTop: spacing(2),
  },
  heroEyebrow: {
    fontFamily: fonts.mono,
    color: colors.eyebrow,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  heroStatLabel: {
    fontFamily: fonts.body,
    color: '#9FB2B8',
    fontSize: 12,
    marginTop: spacing(4),
  },
  heroStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(1),
  },
  heroStatNum: {
    fontFamily: fonts.display,
    color: colors.textOnNavy,
    fontSize: 38,
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  heroStatPill: {
    backgroundColor: 'rgba(228,119,42,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: 3,
  },
  heroStatPillText: { fontFamily: fonts.bodySemi, color: colors.orange, fontSize: 13 },

  // brand
  eyebrow: {
    fontFamily: fonts.mono,
    color: colors.eyebrow,
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  wordmarkLg: { fontFamily: fonts.display, color: colors.orange, fontSize: 26, letterSpacing: -0.5 },
  wordmarkSm: { fontFamily: fonts.display, color: colors.orange, fontSize: 20, letterSpacing: -0.4 },

  // type
  h1: { fontFamily: fonts.display, color: colors.navyText, fontSize: 26, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.displayBold, color: colors.navyText, fontSize: 14, letterSpacing: -0.2 },
  p: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { fontFamily: fonts.body, color: colors.slate, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemi, color: colors.navyText, marginBottom: spacing(1.5), fontSize: 13 },

  // surfaces
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(3.5),
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing(1.5),
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.displayBold, fontSize: 15, letterSpacing: -0.2 },
  input: {
    fontFamily: fonts.body,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(3.5),
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.2 },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: 3,
  },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(1) },
  empty: {
    padding: spacing(8),
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
  },

  // tiles
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3.5),
    alignItems: 'flex-start',
  },
  statValue: { fontFamily: fonts.display, color: colors.navyText, fontSize: 24, letterSpacing: -0.5 },
  statUnit: { fontFamily: fonts.display, color: colors.muted, fontSize: 14 },
  statLabel: {
    fontFamily: fonts.body,
    color: colors.slate,
    fontSize: 12,
    marginTop: 3,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(4),
  },
  actionTitle: { fontFamily: fonts.bodySemi, color: colors.navyText, fontSize: 15 },
  actionSub: { fontFamily: fonts.body, color: colors.slate, fontSize: 13, marginTop: 2 },
  chevron: { fontFamily: fonts.body, color: colors.muted, fontSize: 22, marginLeft: 2 },
});
