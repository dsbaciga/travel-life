/**
 * The app's icon names and their glyphs on each platform. Pure data, so the
 * Android code points can be checked against the symbol font's own map in a
 * Node test (see __tests__/iconGlyphs.test.ts).
 */
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export interface Glyph {
  ios: SFSymbol;
  android: AndroidSymbol;
  /** The glyph's code point in the Material Symbols font, for drawing it as text. */
  code: number;
}

export const GLYPHS = {
  today: { ios: 'sun.max', android: 'wb_sunny', code: 0xe430 },
  map: { ios: 'map', android: 'map', code: 0xe55b },
  trip: { ios: 'safari', android: 'explore', code: 0xe87a },
  vault: { ios: 'lock.shield', android: 'shield_lock', code: 0xf686 },
  add: { ios: 'plus', android: 'add', code: 0xe145 },
  place: { ios: 'mappin.and.ellipse', android: 'location_on', code: 0xe0c8 },
  pin: { ios: 'pin', android: 'push_pin', code: 0xf10d },
  transit: { ios: 'tram', android: 'train', code: 0xe570 },
  checkIn: { ios: 'bed.double', android: 'hotel', code: 0xe53a },
  checkOut: { ios: 'suitcase.rolling', android: 'luggage', code: 0xf235 },
  camera: { ios: 'camera', android: 'photo_camera', code: 0xe412 },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library', code: 0xe413 },
  receipt: { ios: 'receipt', android: 'receipt_long', code: 0xef6e },
  food: { ios: 'fork.knife', android: 'restaurant', code: 0xe56c },
  meal: { ios: 'takeoutbag.and.cup.and.straw', android: 'ramen_dining', code: 0xea64 },
  note: { ios: 'square.and.pencil', android: 'edit_note', code: 0xe745 },
  link: { ios: 'link', android: 'link', code: 0xe157 },
  parking: { ios: 'car', android: 'directions_car', code: 0xe531 },
  phrasebook: { ios: 'character.bubble', android: 'translate', code: 0xe8e2 },
  navigate: { ios: 'location.north.line', android: 'navigation', code: 0xe55d },
  myLocation: { ios: 'location', android: 'my_location', code: 0xe55c },
  search: { ios: 'magnifyingglass', android: 'search', code: 0xe8b6 },
  settings: { ios: 'gearshape', android: 'settings', code: 0xe8b8 },
  copy: { ios: 'doc.on.doc', android: 'content_copy', code: 0xe14d },
  checked: { ios: 'checkmark.square.fill', android: 'check_box', code: 0xe834 },
  unchecked: { ios: 'square', android: 'check_box_outline_blank', code: 0xe835 },
  plug: { ios: 'powerplug', android: 'power', code: 0xe63c },
  water: { ios: 'drop', android: 'water_drop', code: 0xe798 },
  money: { ios: 'banknote', android: 'payments', code: 0xef63 },
  delete: { ios: 'trash', android: 'delete', code: 0xe872 },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync', code: 0xe627 },
  offline: { ios: 'icloud.slash', android: 'cloud_off', code: 0xe2c1 },
  alert: { ios: 'exclamationmark.triangle', android: 'warning', code: 0xe002 },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', code: 0xe5cc },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', code: 0xe5cb },
  expand: { ios: 'chevron.down', android: 'expand_more', code: 0xe5cf },
  collapse: { ios: 'chevron.up', android: 'expand_less', code: 0xe5ce },
  fitAll: { ios: 'arrow.up.left.and.arrow.down.right', android: 'fit_screen', code: 0xea10 },
  close: { ios: 'xmark', android: 'close', code: 0xe5cd },
  schedule: { ios: 'clock', android: 'schedule', code: 0xe8b5 },
  calendar: { ios: 'calendar', android: 'calendar_today', code: 0xe935 },
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;
