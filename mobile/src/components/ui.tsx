/**
 * Small themed building blocks shared by every screen.
 */
import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import Icon, { type IconName } from './Icon';

/**
 * Android shows a ripple where you touch; iOS has no ripple, so it keeps the
 * fade. Fading as well on Android would dim the ripple itself.
 */
const RIPPLE = Platform.OS === 'android';

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
  /**
   * Pinned under the content and always visible, for the screen's main action
   * (Save) so it never scrolls out of reach at the end of a long form.
   */
  footer?: ReactNode;
}

export function Screen({ children, scroll = true, padded = true, footer }: ScreenProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const underTabBar = useContext(TabBarContext);
  // Screens outside the tab bar run to the bottom edge of the display, where
  // Android's navigation buttons (or gesture bar) would cover the last row.
  // A footer takes over that job, since it is what sits at the bottom edge.
  const edgeClearance = underTabBar ? 0 : insets.bottom;
  const clearance = footer ? 0 : edgeClearance;
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
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: spacing.md + edgeClearance,
            },
          ]}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * "Not synced yet", as a small dot instead of a chip: it is common offline and
 * should not compete with the item's title and time.
 */
export function PendingDot() {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel="Not synced yet"
      style={[styles.pendingDot, { backgroundColor: palette.info }]}
    />
  );
}

interface IconButtonProps {
  icon: IconName;
  /** Spoken name: an icon-only control has no visible words. */
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

/** A 44pt, icon-only control for headers (settings, delete). */
export function IconButton({ icon, accessibilityLabel, onPress, color, disabled }: IconButtonProps) {
  const palette = usePalette();
  const onHero = useContext(HeroContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      android_ripple={{ color: palette.ripple, borderless: true, radius: TOUCH_TARGET / 2 }}
      style={({ pressed }) => [styles.iconButton, disabled && styles.disabled, !RIPPLE && pressed && styles.pressed]}>
      <Icon name={icon} size={24} color={color ?? (onHero ? palette.onHero : palette.text)} />
    </Pressable>
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
      android_ripple={{ color: hero ? HERO_WASH : palette.ripple }}
      style={({ pressed }) => [base, RIPPLE ? styles.clipRipple : pressed && styles.pressed]}>
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
  /** Leading icon, drawn in the label colour. */
  icon?: IconName;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  accessibilityHint,
  icon: iconName,
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
      android_ripple={{
        color: variant === 'primary' || variant === 'danger' || onHero ? 'rgba(255, 255, 255, 0.24)' : palette.ripple,
      }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: background, borderColor: outline },
        (disabled || loading) && styles.disabled,
        RIPPLE ? styles.clipRipple : pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonContent}>
          {iconName ? <Icon name={iconName} size={18} color={foreground} /> : null}
          {/* The icon is its own Text: a bad emoji glyph must not take the words down with it. */}
          {!iconName && icon ? <Text style={styles.buttonIcon}>{icon}</Text> : null}
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
  /**
   * Text after the label in a normal weight, for a name in another script
   * ("Hindi" + "(हिन्दी)"). Complex scripts fall back to a font the phone may only
   * fake the bold of, which makes the drawn text wider than the measured text and
   * wraps it out of the chip; normal weight needs no faking.
   */
  detail?: string;
  /** Leading icon, drawn in the label colour. */
  icon?: IconName;
}

export function Chip({ label, selected, onPress, tone = 'default', detail, icon }: ChipProps) {
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
  const labelColor = selected ? palette.onPrimary : idleLabel;
  const text = (
    <Text style={[styles.chipLabel, { color: labelColor }]}>
      {label}
      {detail ? <Text style={styles.chipDetail}> {detail}</Text> : null}
    </Text>
  );
  const body = icon ? (
    <View style={styles.chipContent}>
      <Icon name={icon} size={16} color={labelColor} />
      {text}
    </View>
  ) : (
    text
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
      accessibilityLabel={detail ? `${label} ${detail}` : label}
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      hitSlop={6}
      android_ripple={{ color: selected || onHero ? 'rgba(255, 255, 255, 0.24)' : palette.ripple }}
      style={({ pressed }) => [chipStyle, RIPPLE ? styles.clipRipple : pressed && styles.pressed]}>
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  // Keeps the Android ripple inside the rounded corners. Android only: on iOS
  // this would also clip the card shadow.
  clipRipple: { overflow: 'hidden' },
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
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  chipDetail: { fontWeight: 'normal' },
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
