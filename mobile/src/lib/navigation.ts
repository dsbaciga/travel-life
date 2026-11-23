/**
 * Start turn-by-turn navigation in Google Maps.
 *
 * Tries the app's own navigation link first; if the phone has no handler for it
 * (Google Maps missing, or an iOS build that has not declared the scheme), the
 * https directions link opens in the browser or the app instead.
 */
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import { buildGoogleNavigationLinks } from '@travel-life/shared';
import type { NavTarget } from '../domain/destination';

export async function openNavigation(target: NavTarget): Promise<void> {
  const links = buildGoogleNavigationLinks({
    destination: target.place,
    mode: target.mode,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'desktop',
  });
  if (!links) {
    Alert.alert('Nothing to navigate to', 'This item has no address or coordinates yet.');
    return;
  }
  try {
    await Linking.openURL(links.primary);
  } catch {
    try {
      await Linking.openURL(links.fallback);
    } catch {
      Alert.alert("Couldn't open maps. Try again.", 'No app on this phone could open the directions.');
    }
  }
}
