/**
 * Small themed building blocks shared by every screen.
 */
import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitLeadingEmoji } from '../lib/labels';
import { radius, spacing, TOUCH_TARGET, usePalette } from '../lib/theme';

/** True inside a hero card, where text and controls switch to the on-dark colours. */
const HeroContext = createContext(false);

/**
 * True under the bottom tab bar, which already sits above the system navigation
 * buttons. Every other screen has to clear them itself.
 */
export const TabBarContext = createContext(false);

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). Pass false for list screens. */
  scroll?: boolean;
  padded?: boolean;
}

export function Screen({ children, scroll = true, padded = true }: ScreenProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const underTabBar = useContext(TabBarContext);
  // Screens outside the tab bar run to the bottom edge of the display, where
  // Android's navigation buttons (or gesture bar) would cover the last row.
  const clearance = underTabBar ? 0 : insets.bottom;
  const content = padded
    ? { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg + clearance }
    : clearance > 0
      ? { paddingBottom: clearance }
      : undefined;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** `hero` is the single dark, high-emphasis card on a screen. */
  tone?: 'default' | 'hero';
}

export function Card({ children, style, onPress, onLongPress, accessibilityLabel, tone = 'default' }: CardProps) {
  const palette = usePalette();
  const hero = tone === 'hero';
  const base = [
    styles.card,
    hero
      ? [styles.cardHero, { backgroundColor: palette.hero, borderColor: palette.hero }]
      : { backgroundColor: palette.surface, borderColor: palette.border },
    style,
  ];
  const body = <HeroContext.Provider value={hero}>{children}</HeroContext.Provider>;
  if (!onPress && !onLongPress) return <View style={base}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

interface AppTextProps {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'body' | 'label' | 'caption';
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}

export function AppText({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
  selectable,
}: AppTextProps) {
  const palette = usePalette();
  const onHero = useContext(HeroContext);
  const fallback = onHero
    ? muted
      ? palette.heroMuted
      : palette.onHero
    : muted
      ? palette.textMuted
      : palette.text;
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        textStyles[variant],
        { color: color ?? fallback },
        style,
      ]}>
      {children}
    </Text>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  accessibilityHint,
}: ButtonProps) {
  const palette = usePalette();
  const onHero = useContext(HeroContext);
  const background =
    variant === 'primary'
      ? onHero
        ? palette.heroAccent
        : palette.primary
      : variant === 'danger'
        ? palette.danger
        : variant === 'secondary'
          ? onHero
            ? HERO_WASH
            : palette.surface
          : 'transparent';
  const foreground =
    variant === 'primary'
      ? onHero
        ? palette.hero
        : palette.onPrimary
      : variant === 'danger'
        ? '#ffffff'
        : onHero
          ? palette.onHero
          : palette.text;
  const outline =
    variant === 'ghost' || variant === 'secondary' ? (onHero ? HERO_WASH : palette.border) : background;
  const { icon, text: words } = splitLeadingEmoji(label);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: background, borderColor: outline },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonContent}>
          {/* The icon is its own Text: a bad emoji glyph must not take the words down with it. */}
          {icon ? <Text style={styles.buttonIcon}>{icon}</Text> : null}
          <Text style={[styles.buttonLabel, { color: foreground }]}>{words}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Chip({ label, selected, onPress, tone = 'default' }: ChipProps) {
  const palette = usePalette();
  const toneColor =
    tone === 'success'
      ? palette.success
      : tone === 'warning'
        ? palette.warning
        : tone === 'danger'
          ? palette.danger
          : tone === 'info'
            ? palette.info
            : palette.textMuted;
  const onHero = useContext(HeroContext);
  const idleLabel = onHero ? palette.onHero : toneColor;
  const body = (
    <Text style={[styles.chipLabel, { color: selected ? palette.onPrimary : idleLabel }]}>
      {label}
    </Text>
  );
  const chipStyle = [
    styles.chip,
    {
      backgroundColor: selected ? palette.primary : onHero ? HERO_WASH : palette.surface,
      borderColor: selected ? palette.primary : onHero ? HERO_WASH : palette.border,
    },
  ];
  if (!onPress) return <View style={chipStyle}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [chipStyle, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
}

export function Field({ label, error, ...input }: FieldProps) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.textMuted}
        {...input}
        style={[
          styles.input,
          input.multiline && styles.inputMultiline,
          {
            color: palette.text,
            backgroundColor: palette.surface,
            borderColor: error ? palette.danger : palette.border,
          },
        ]}
      />
      {error ? (
        <AppText variant="caption" color={palette.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading">{title}</AppText>
      {action}
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.empty}>
      <AppText variant="heading">{title}</AppText>
      {message ? (
        <AppText muted style={styles.center}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'danger' }) {
  const palette = usePalette();
  const color = tone === 'danger' ? palette.danger : tone === 'warning' ? palette.warning : palette.info;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { borderColor: color, backgroundColor: palette.surface }]}>
      <AppText variant="caption" color={color}>
        {text}
      </AppText>
    </View>
  );
}

/** Translucent white, for controls sitting on the hero surface. */
const HERO_WASH = 'rgba(255, 255, 255, 0.14)';

const textStyles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: 0.2 },
  caption: { fontSize: 13, lineHeight: 18 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    // A soft lift instead of a heavy outline.
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHero: { elevation: 4, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { paddingHorizontal: spacing.md, alignSelf: 'flex-start' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonIcon: { fontSize: 16, fontWeight: 'normal' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  chip: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  field: { gap: spacing.xs },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  banner: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md },
});
