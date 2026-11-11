/**
 * Where I parked (#123): a GPS pin, an optional photo and note, and a meter
 * countdown with a local notification before it runs out.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { buildMapsAppLinks, formatTimeInTimezone } from '@travel-life/shared';
import { Image } from 'expo-image';

import { showActionSheet } from '@/components/ActionSheet';
import { AppText, Banner, Button, Card, Chip, EmptyState, Field, Row, Screen } from '@/components/ui';
import { kvDelete, kvGet, kvSet } from '@/db/repository';
import { meterStatus, type ParkingPin } from '@/domain/smart';
import { getDb } from '@/lib/db';
import { useActiveTrip, useKv, useNow, useUserTimezone } from '@/lib/hooks';
import { notifyLocalChange } from '@/lib/sync';
import { getCurrentPosition, positionFailureMessage } from '@/tasks/location';

const METER_OPTIONS = [30, 60, 120, 180] as const;
/** Warn this long before the meter expires. */
const WARNING_MINUTES = 10;

const notificationKey = (tripId: number): string => `parking-notification:${tripId}`;

async function cancelMeterReminder(tripId: number): Promise<void> {
  const db = await getDb();
  const id = await kvGet<string>(db, notificationKey(tripId));
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  await kvDelete(db, notificationKey(tripId));
}

export default function ParkedScreen() {
  const now = useNow(15000);
  const userTimezone = useUserTimezone();
  const { data: trip } = useActiveTrip();
  const { data: pin } = useKv<ParkingPin>(trip ? `parking:${trip.id}` : 'parking:none');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [meterMinutes, setMeterMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
      </Screen>
    );
  }
  const key = `parking:${trip.id}`;

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets.length > 0) setPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const position = await getCurrentPosition();
      if (!position) {
        setError(positionFailureMessage('remember where you parked'));
        return;
      }
      const meterExpiresAt = meterMinutes ? new Date(Date.now() + meterMinutes * 60000).toISOString() : null;
      const next: ParkingPin = {
        ...position,
        savedAt: new Date().toISOString(),
        note: note.trim() || null,
        photoUri,
        meterExpiresAt,
      };
      const db = await getDb();
      await kvSet(db, key, next);

      await cancelMeterReminder(trip.id);
      if (meterMinutes && meterMinutes > WARNING_MINUTES) {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.granted) {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Parking meter running out',
              body: `About ${WARNING_MINUTES} minutes left on your meter.`,
              data: { url: '/parked' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: (meterMinutes - WARNING_MINUTES) * 60,
            },
          });
          await kvSet(db, notificationKey(trip.id), id);
        }
      }
      await notifyLocalChange();
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await cancelMeterReminder(trip.id);
    await kvDelete(await getDb(), key);
    await notifyLocalChange();
    router.back();
  };

  if (pin) {
    const meter = meterStatus(pin, now);
    const links = buildMapsAppLinks({
      destination: { name: 'My car', latitude: pin.latitude, longitude: pin.longitude },
      mode: 'walking',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return (
      <Screen>
        <Card>
          <AppText variant="heading">Parked at {formatTimeInTimezone(pin.savedAt, userTimezone)}</AppText>
          <AppText selectable muted>
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </AppText>
          {pin.note ? <AppText>{pin.note}</AppText> : null}
          {meter.label ? (
            <Chip
              label={meter.label}
              tone={meter.state === 'expired' ? 'danger' : meter.state === 'soon' ? 'warning' : 'success'}
            />
          ) : null}
          {pin.photoUri ? (
            <Image
              source={{ uri: pin.photoUri }}
              style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 8 }}
              contentFit="cover"
              accessibilityLabel="Photo of where the car is parked"
            />
          ) : null}
        </Card>
        <Button
          label="Walk back to the car"
          onPress={() =>
            showActionSheet(
              'Directions to your car',
              links.map((link) => ({ label: link.label, onPress: () => void Linking.openURL(link.url) }))
            )
          }
        />
        <Button label="I’m back — clear the pin" variant="secondary" onPress={() => void clear()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <Banner text={error} tone="warning" /> : null}
      <AppText muted>Saves your current GPS position so you can walk straight back.</AppText>
      <Field label="Note" placeholder="Level 3, row C" value={note} onChangeText={setNote} />
      <Row>
        <Button label={photoUri ? 'Retake photo' : '📷 Add a photo'} variant="secondary" compact onPress={() => void takePhoto()} />
        {photoUri ? <Chip label="Photo added" tone="success" /> : null}
      </Row>
      <AppText variant="label" muted>
        Parking meter
      </AppText>
      <Row>
        <Chip label="None" selected={meterMinutes === null} onPress={() => setMeterMinutes(null)} />
        {METER_OPTIONS.map((minutes) => (
          <Chip
            key={minutes}
            label={minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
            selected={meterMinutes === minutes}
            onPress={() => setMeterMinutes(minutes)}
          />
        ))}
      </Row>
      <Button label="Save parking spot" onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
