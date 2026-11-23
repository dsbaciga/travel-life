import type { Palette } from './theme';

/**
 * Stroke colour and opacity for `ContourBackdrop`.
 *
 * A hero card is a dark surface in both colour schemes, so its contours are
 * always gold (`heroAccent`) at ~10%. Off a hero the contours follow the
 * scheme: gold at ~8% on dark, charcoal at ~6% on light.
 */
export function contourStroke(
  palette: Pick<Palette, 'heroAccent' | 'primary' | 'text'>,
  dark: boolean,
  onHero: boolean,
): { color: string; opacity: number } {
  if (onHero) return { color: palette.heroAccent, opacity: 0.1 };
  return dark ? { color: palette.primary, opacity: 0.08 } : { color: palette.text, opacity: 0.06 };
}
