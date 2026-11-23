/**
 * Small themed building blocks shared by every screen.
 */
import { LinearGradient } from 'expo-linear-gradient';
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
import { fontStyle, useFontStore, type FontKind, type FontWeightName } from '../lib/fonts';
import { splitLeadingEmoji } from '../lib/labels';
import { DUSK, radius, spacing, TOUCH_TARGET, usePalette, useResolvedColorScheme } from '../lib/theme';
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
  const dark = useResolvedColorScheme() === 'dark';
  const base = [
    styles.card,
    hero
      ? [styles.cardHero, { backgroundColor: palette.hero, borderColor: dark ? palette.border : palette.hero }]
      : { backgroundColor: palette.surface, borderColor: palette.border },
    style,
  ];
  const body = (
    <HeroContext.Provider value={hero}>
      {hero ? (
        <>
          {/* A subtle diagonal wash, from the hero colour to a slightly lighter step. */}
          <LinearGradient
            pointerEvents="none"
            colors={[palette.hero, palette.heroWash]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* The Compass Gold signature: gold to amber along the top edge. */}
          <LinearGradient
            pointerEvents="none"
            colors={[palette.heroAccent, HERO_BAR_END]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.heroBar}
          />
        </>
      ) : null}
      {children}
    </HeroContext.Provider>
  );
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
  variant?: 'title' | 'heading' | 'body' | 'label' | 'caption' | 'eyebrow' | 'place';
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
  /** `header` lets screen readers jump between headings. */
  accessibilityRole?: 'header';
}

export function AppText({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
  selectable,
  accessibilityRole,
}: AppTextProps) {
  const palette = usePalette();
  const onHero = useContext(HeroContext);
  const fontsReady = useFontStore((state) => state.ready);
  const face = TEXT_FACES[variant];
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
      accessibilityRole={accessibilityRole}
      style={[
        textStyles[variant],
        fontStyle(face[0], face[1], fontsReady),
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
  const fontsReady = useFontStore((state) => state.ready);
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
          <Text style={[styles.buttonLabel, fontStyle('body', '600', fontsReady), { color: foreground }]}>{words}</Text>
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
  /** Trailing icon, e.g. `close` on a chip that removes something. */
  trailingIcon?: IconName;
}

export function Chip({ label, selected, onPress, tone = 'default', detail, icon, trailingIcon }: ChipProps) {
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
  const fontsReady = useFontStore((state) => state.ready);
  const text = (
    <Text style={[styles.chipLabel, fontStyle('body', '600', fontsReady), { color: labelColor }]}>
      {label}
      {detail ? <Text style={[styles.chipDetail, fontStyle('body', '400', fontsReady)]}> {detail}</Text> : null}
    </Text>
  );
  const body =
    icon || trailingIcon ? (
      <View style={styles.chipContent}>
        {icon ? <Icon name={icon} size={16} color={labelColor} /> : null}
        {text}
        {trailingIcon ? <Icon name={trailingIcon} size={16} color={labelColor} /> : null}
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
  /** Keep the label for screen readers but not on screen (a heading already says it). */
  hideLabel?: boolean;
}

export function Field({ label, error, hideLabel, ...input }: FieldProps) {
  const palette = usePalette();
  const fontsReady = useFontStore((state) => state.ready);
  return (
    <View style={styles.field}>
      {hideLabel ? null : (
        <AppText variant="label" muted>
          {label}
        </AppText>
      )}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.textMuted}
        {...input}
        style={[
          styles.input,
          fontStyle('body', '400', fontsReady),
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
      <AppText variant="eyebrow" muted accessibilityRole="header">
        {title}
      </AppText>
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

/** Amber end of the hero card's gold top bar (the start is `palette.heroAccent`). */
const HERO_BAR_END = '#D97706';

/** Translucent white, for controls sitting on the hero surface. */
const HERO_WASH = 'rgba(255, 255, 255, 0.14)';

/** Which font and weight each text variant uses (display = Crimson Pro, body = Manrope). */
const TEXT_FACES: Record<NonNullable<AppTextProps['variant']>, [FontKind, FontWeightName]> = {
  title: ['display', '700'],
  heading: ['display', '600'],
  body: ['body', '400'],
  label: ['body', '600'],
  caption: ['body', '400'],
  eyebrow: ['body', '600'],
  place: ['displayItalic', '400'],
};

const textStyles = StyleSheet.create({
  // Crimson Pro sits smaller than the system font at the same size, so display sizes run larger.
  title: { fontSize: 31, lineHeight: 36, letterSpacing: -0.2 },
  heading: { fontSize: 22, lineHeight: 27 },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  caption: { fontSize: 13, lineHeight: 18 },
  // Tracked small-caps style label (NEXT UP, section headers).
  eyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
  // Place and location names: Crimson Pro italic, larger to match Manrope's x-height.
  place: { fontSize: 16, lineHeight: 22, fontStyle: 'italic' },
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
    shadowColor: DUSK[900],
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  heroBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  cardHero: { overflow: 'hidden', elevation: 4, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
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
  buttonLabel: { fontSize: 15 },
  chip: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chipLabel: { fontSize: 13 },
  chipDetail: {},
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
