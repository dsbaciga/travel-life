/**
 * The app's icon set: Material Symbols on Android, SF Symbols on iOS. Icons are
 * named by meaning ("stay", "parking"), not by glyph, so a screen never picks
 * per-platform names itself. The names and glyphs live in `iconGlyphs.ts`.
 *
 * Emoji used to fill this role. They render differently on every Android
 * maker's font, cannot take the theme colour, and the idle tab state could only
 * fade them.
 */
import * as Font from 'expo-font';
import { SymbolView } from 'expo-symbols';
import symbolFont from 'expo-symbols/androidWeights/regular';
import { Platform, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { usePalette } from '../lib/theme';
import { GLYPHS, type IconName } from './iconGlyphs';

export type { IconName } from './iconGlyphs';

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
  const tint = color ?? palette.text;

  // `SymbolView` on Android checks its font on every mount and draws nothing
  // for that first frame, which flickers in scrolling lists. The root layout
  // loads the font before the splash screen hides, so once it is loaded the
  // glyph is drawn straight from it, as `SymbolView` itself would.
  if (Platform.OS === 'android' && Font.isLoaded(symbolFont.name)) {
    return (
      <View
        style={[{ width: size, height: size }, style]}
        accessible={false}
        importantForAccessibility="no-hide-descendants">
        <Text
          allowFontScaling={false}
          style={[styles.glyph, { fontFamily: symbolFont.name, fontSize: size, lineHeight: size, color: tint }]}>
          {String.fromCharCode(glyph.code)}
        </Text>
      </View>
    );
  }

  return (
    <SymbolView
      name={{ ios: glyph.ios, android: glyph.android, web: glyph.android }}
      size={size}
      tintColor={tint}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  glyph: { includeFontPadding: false, textAlign: 'center' },
});
