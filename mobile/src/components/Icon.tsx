/**
 * The app's icon set: Material Symbols on Android, SF Symbols on iOS, both
 * through `expo-symbols`. Icons are named by meaning ("stay", "parking"), not
 * by glyph, so a screen never picks per-platform names itself.
 *
 * Emoji used to fill this role. They render differently on every Android
 * maker's font, cannot take the theme colour, and the idle tab state could only
 * fade them.
 */
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { usePalette } from '../lib/theme';

interface Glyph {
  ios: SFSymbol;
  android: AndroidSymbol;
}

const GLYPHS = {
  today: { ios: 'sun.max', android: 'wb_sunny' },
  map: { ios: 'map', android: 'map' },
  trip: { ios: 'safari', android: 'explore' },
  vault: { ios: 'lock.shield', android: 'shield_lock' },
  add: { ios: 'plus', android: 'add' },
  place: { ios: 'mappin.and.ellipse', android: 'location_on' },
  pin: { ios: 'pin', android: 'push_pin' },
  transit: { ios: 'tram', android: 'train' },
  checkIn: { ios: 'bed.double', android: 'hotel' },
  checkOut: { ios: 'suitcase.rolling', android: 'luggage' },
  camera: { ios: 'camera', android: 'photo_camera' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  receipt: { ios: 'receipt', android: 'receipt_long' },
  food: { ios: 'fork.knife', android: 'restaurant' },
  meal: { ios: 'takeoutbag.and.cup.and.straw', android: 'ramen_dining' },
  note: { ios: 'square.and.pencil', android: 'edit_note' },
  link: { ios: 'link', android: 'link' },
  parking: { ios: 'car', android: 'directions_car' },
  phrasebook: { ios: 'character.bubble', android: 'translate' },
  navigate: { ios: 'location.north.line', android: 'navigation' },
  myLocation: { ios: 'location', android: 'my_location' },
  search: { ios: 'magnifyingglass', android: 'search' },
  settings: { ios: 'gearshape', android: 'settings' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  checked: { ios: 'checkmark.square.fill', android: 'check_box' },
  unchecked: { ios: 'square', android: 'check_box_outline_blank' },
  plug: { ios: 'powerplug', android: 'power' },
  water: { ios: 'drop', android: 'water_drop' },
  money: { ios: 'banknote', android: 'payments' },
  delete: { ios: 'trash', android: 'delete' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  offline: { ios: 'icloud.slash', android: 'cloud_off' },
  alert: { ios: 'exclamationmark.triangle', android: 'warning' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

interface IconProps {
  name: IconName;
  size?: number;
  /** Defaults to the palette's text colour. */
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

export default function Icon({ name, size = 20, color, style }: IconProps) {
  const palette = usePalette();
  const glyph = GLYPHS[name];
  return (
    <SymbolView
      name={{ ios: glyph.ios, android: glyph.android, web: glyph.android }}
      size={size}
      tintColor={color ?? palette.text}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
