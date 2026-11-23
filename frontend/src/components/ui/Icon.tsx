/**
 * Icon: the one way to draw an icon in the web app.
 *
 * Every icon is a Material Symbols (outlined, weight 400) glyph, the same
 * family the Android app uses (`mobile/src/components/iconGlyphs.ts`). Callers
 * pass a meaning (`name="flight"`, `name="stay"`), never a glyph, so one meaning
 * looks the same everywhere and can be restyled in one place.
 *
 * Glyphs are bundled at build time by `unplugin-icons` (no runtime fetching), so
 * they work offline in the PWA. Do not use emoji, `@heroicons/react` or
 * hand-written `<svg>` icons for UI chrome; add a name here instead.
 *
 * Names shared with mobile (today, map, trip, vault, add, place, pin, transit,
 * checkIn, checkOut, camera, photos, receipt, food, meal, note, link, parking,
 * phrasebook, navigate, myLocation, search, settings, copy, checked, unchecked,
 * plug, water, money, delete, sync, offline, alert, chevronRight, chevronLeft,
 * expand, collapse, fitAll, close, schedule, calendar) keep the same meaning.
 */
import type { SVGProps } from 'react';
import { ICONS, type IconName } from './iconRegistry';

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children' | 'ref' | 'title'> {
  /** What the icon means (see the registry above). */
  name: IconName;
  /**
   * Pixel size. Defaults to 20 (inline with text; use 16 in dense chips and 24
   * in buttons and headers). A Tailwind `size-*` / `w-* h-*` class in
   * `className` overrides it.
   */
  size?: number;
  /**
   * Accessible label. Without it the icon is decorative (`aria-hidden`); with
   * it the icon is exposed as an image with this name.
   */
  title?: string;
}

/**
 * Draws a Material Symbols glyph by meaning. Uses `currentColor`, so colour it
 * with a text colour class.
 *
 * @example
 * <Icon name="flight" />                     // 20px, decorative
 * <Icon name="alert" size={16} className="text-amber-600" />
 * <Icon name="delete" size={24} title="Delete trip" />
 */
export default function Icon({ name, size = 20, title, className, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  const labelled = typeof title === 'string' && title.length > 0;
  return (
    <Glyph
      width={size}
      height={size}
      className={`inline-block shrink-0${className ? ` ${className}` : ''}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...rest}
    />
  );
}
