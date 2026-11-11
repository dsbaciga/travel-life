import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch } from 'react-native';

import { AppText, Banner, Button, Card, Chip, Row, Screen } from '@/components/ui';
import { kvSet } from '@/db/repository';
import { getDb } from '@/lib/db';
import { useActiveTrip, useKv } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { notifyLocalChange, useSync } from '@/lib/sync';
import { spacing, usePalette, useThemeStore } from '@/lib/theme';
import { isTracking, startTracking, stopTracking } from '@/tasks/location';
import { unregisterPush } from '@/tasks/notifications';

export default function SettingsScreen() {
  const palette = usePalette();
  const themePreference = useThemeStore((state) => state.preference);
  const setThemePreference = useThemeStore((state) => state.setPreference);
  const session = useSession((state) => state.session);
  const counts = useSync((state) => state.counts);
  const { data: trip } = useActiveTrip();
  const { data: vaultLock } = useKv<boolean>('vaultLock');
  const [tracking, setTracking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void isTracking().then(setTracking);
  }, []);

  const toggleVaultLock = async (enabled: boolean) => {
    setNotice(null);
    if (enabled) {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !enrolled) {
        setNotice('Set up a fingerprint, face unlock or screen lock on this phone first.');
        return;
      }
    }
    // Turning the lock OFF requires passing it, or anyone holding the phone could.
    const check = await LocalAuthentication.authenticateAsync({
      promptMessage: enabled ? 'Confirm to lock the vault' : 'Confirm to remove the vault lock',
    });
    if (!check.success) return;
    await kvSet(await getDb(), 'vaultLock', enabled);
    await notifyLocalChange();
  };

  const toggleTracking = async (enabled: boolean) => {
    setNotice(null);
    if (!enabled) {
      await stopTracking();
      setTracking(false);
      return;
    }
    if (!trip) {
      setNotice('Choose a trip before recording a route.');
      return;
    }
    const result = await startTracking(trip.id);
    setTracking(result === 'started');
    if (result !== 'started') {
      setNotice('Allow location "all the time" in system settings to record your route in the background.');
    }
  };

  const signOut = () => {
    const unsynced = counts.pending + counts.conflict + counts.failed;
    Alert.alert(
      'Sign out?',
      unsynced > 0
        ? `${unsynced} change${unsynced === 1 ? '' : 's'} made offline have not been uploaded and will be lost.`
        : 'Offline trip data is removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await stopTracking();
            await unregisterPush();
            await useSession.getState().signOut();
          },
        },
      ]
    );
  };

  return (
    <Screen>
      {notice ? <Banner text={notice} tone="warning" /> : null}

      <Card>
        <AppText variant="heading">{session?.user.username ?? 'Signed in'}</AppText>
        <AppText muted>{session?.user.email}</AppText>
        <AppText variant="caption" muted selectable>
          {session?.serverUrl.replace(/\/api$/, '')}
        </AppText>
        <AppText variant="caption" muted>
          Times use {session?.user.timezone ?? 'this phone’s timezone'} when a trip or item has none of its own.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Appearance</AppText>
        <AppText variant="caption" muted>
          Choose how Travel Life looks on your phone.
        </AppText>
        <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {(['system', 'light', 'dark'] as const).map((mode) => (
            <Chip
              key={mode}
              label={mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}
              selected={themePreference === mode}
              onPress={() => void setThemePreference(mode)}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText style={{ flex: 1 }}>Lock the vault with biometrics</AppText>
          <Switch
            accessibilityLabel="Lock the vault with biometrics"
            value={Boolean(vaultLock)}
            onValueChange={(next) => void toggleVaultLock(next)}
            trackColor={{ true: palette.primary, false: palette.border }}
          />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText style={{ flex: 1 }}>Record my route in the background</AppText>
          <Switch
            accessibilityLabel="Record my route in the background"
            value={tracking}
            onValueChange={(next) => void toggleTracking(next)}
            trackColor={{ true: palette.primary, false: palette.border }}
          />
        </Row>
        <AppText variant="caption" muted>
          Route recording logs a point roughly every 25 metres while you move and pauses when you are still. It powers the day map and locating photos that have no GPS.
        </AppText>
      </Card>

      <Button label="Sync status" variant="secondary" onPress={() => router.push('/sync')} />
      <Button label="Sign out" variant="danger" onPress={signOut} />
    </Screen>
  );
}
