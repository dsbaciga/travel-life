/**
 * Native push (flight alerts, booking deadlines, trip-start reminders).
 *
 * The server delivers through the Expo push gateway, so the phone registers an
 * Expo push token with `POST /api/push/mobile-token`.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { kvDelete, kvGet, kvSet } from '../db/repository';
import { getDb } from '../lib/db';
import { api } from '../lib/session';

const TOKEN_KEY = 'pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * In-app paths a notification may open. The `url` comes from the server
 * payload; anything not on this list is ignored rather than navigated to.
 */
function routeFor(url: unknown): '/' | '/parked' | '/sync' | null {
  if (typeof url !== 'string') return null;
  if (url === '/parked') return '/parked';
  if (url === '/sync') return '/sync';
  // Server notifications use web paths like /trips/12; the Today tab is the
  // on-trip equivalent.
  if (url === '/' || url.startsWith('/trips/') || url === '/dashboard') return '/';
  return null;
}

Notifications.addNotificationResponseReceivedListener((response) => {
  const target = routeFor(response.notification.request.content.data?.url);
  if (target) router.push(target);
});

/**
 * Ask for permission and register this device. Quietly does nothing on
 * emulators, when permission is refused, or when the build has no EAS project
 * id (push tokens cannot be minted without one).
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Trip alerts',
        // The enum is re-exported through `export *` chains the lint resolver does
        // not follow; tsc and the runtime both see it.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || !projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const db = await getDb();
    if ((await kvGet<string>(db, TOKEN_KEY)) === token) return;
    await api.request('/push/mobile-token', {
      method: 'POST',
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceName: Device.deviceName ?? undefined,
      },
    });
    await kvSet(db, TOKEN_KEY, token);
  } catch {
    // Push is an enhancement; never let it break sign-in or launch.
  }
}

/** Remove this device's token before signing out, so alerts stop arriving. */
export async function unregisterPush(): Promise<void> {
  try {
    const db = await getDb();
    const token = await kvGet<string>(db, TOKEN_KEY);
    if (!token) return;
    await api.request('/push/mobile-token', { method: 'DELETE', body: { token } });
    await kvDelete(db, TOKEN_KEY);
  } catch {
    // Signing out must still succeed offline; the server prunes dead tokens.
  }
}
