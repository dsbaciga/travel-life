/**
 * Quick Capture & Create: the `+` sheet. Each option stamps the current time
 * and place and hands off to the right form with as much pre-filled as possible.
 */
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import type { SyncEntityMap } from '@travel-life/shared';

import { AppText, Banner, Card, EmptyState, Screen } from '@/components/ui';
import { createEntity, type LinkSpec } from '@/domain/mutations';
import { exifCoordinate, exifDate } from '@/domain/exif';
import { suggestLinks } from '@/domain/smart';
import { listEntities } from '@/db/repository';
import { getDb } from '@/lib/db';
import type { FormKind } from '@/lib/entityForms';
import { useActiveTrip } from '@/lib/hooks';
import { notifyLocalChange, syncNow } from '@/lib/sync';
import { getCurrentPosition, positionFailureMessage } from '@/tasks/location';

interface Option {
  key: string;
  icon: string;
  title: string;
  detail: string;
  run: () => void | Promise<void>;
}

export default function CaptureScreen() {
  const { data: trip } = useActiveTrip();
  const [message, setMessage] = useState<string | null>(null);

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" message="Pick a trip first, then capture into it." />
      </Screen>
    );
  }

  const openForm = (kind: FormKind, extra: Record<string, string> = {}) =>
    router.replace({
      pathname: '/entity/[kind]/[id]',
      params: { kind, id: 'new', tripId: String(trip.id), ...extra },
    });

  /** Snap or pick a photo: read EXIF, auto-link, queue the upload. */
  const capturePhoto = async (source: 'camera' | 'library') => {
    setMessage(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Camera permission is needed to take a photo.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: true, quality: 0.9 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true });
    if (result.canceled || result.assets.length === 0) return;

    const db = await getDb();
    const [locations, activities, lodging] = await Promise.all([
      listEntities(db, trip.id, 'LOCATION'),
      listEntities(db, trip.id, 'ACTIVITY'),
      listEntities(db, trip.id, 'LODGING'),
    ]);
    // A fresh camera shot has no EXIF GPS until the OS writes it; fall back to
    // where the phone is right now.
    const here = source === 'camera' ? await getCurrentPosition() : null;

    for (const asset of result.assets) {
      const exif: Record<string, unknown> = asset.exif ?? {};
      const latitude = exifCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef) ?? here?.latitude ?? null;
      const longitude = exifCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef) ?? here?.longitude ?? null;
      const takenAt = exifDate(exif.DateTimeOriginal ?? exif.DateTime) ?? new Date().toISOString();

      const links: LinkSpec[] = suggestLinks(
        'PHOTO',
        { locations, activities, lodging },
        latitude !== null && longitude !== null ? { latitude, longitude } : null,
        new Date(takenAt)
      ).map((s) => ({ targetType: s.targetType, targetId: s.targetId, relationship: s.relationship }));

      const photo: Omit<SyncEntityMap['PHOTO'], 'id' | 'tripId'> = {
        source: 'local',
        mediaType: 'image',
        localPath: null,
        thumbnailPath: null,
        caption: null,
        latitude,
        longitude,
        takenAt,
        pendingUri: asset.uri,
      };
      await createEntity(db, 'PHOTO', trip.id, photo, links);
    }
    await notifyLocalChange();
    void syncNow();
    router.back();
  };

  const dropPin = async () => {
    setMessage(null);
    const position = await getCurrentPosition();
    if (!position) {
      setMessage(positionFailureMessage('drop a pin where you are'));
      return;
    }
    openForm('LOCATION', {
      latitude: position.latitude.toFixed(6),
      longitude: position.longitude.toFixed(6),
    });
  };

  const spontaneousStop = async () => {
    const position = await getCurrentPosition();
    openForm(
      'ACTIVITY',
      position
        ? {
            latitude: position.latitude.toFixed(6),
            longitude: position.longitude.toFixed(6),
          }
        : {}
    );
  };

  const quickNote = () =>
    openForm('JOURNAL_ENTRY', {
      preset: JSON.stringify({ title: 'Quick note', entryType: 'daily' }),
    });

  const options: Option[] = [
    { key: 'stop', icon: '📍', title: 'New activity / spontaneous stop', detail: 'Stamped now, linked to where you are', run: spontaneousStop },
    { key: 'pin', icon: '📌', title: 'New location pin — “I’m here”', detail: 'Drops a pin at your current GPS position', run: dropPin },
    { key: 'camera', icon: '📷', title: 'Snap a photo', detail: 'Auto-linked to the current activity and place', run: () => capturePhoto('camera') },
    { key: 'library', icon: '🖼️', title: 'Add photos from library', detail: 'Uses each photo’s own time and GPS', run: () => capturePhoto('library') },
    { key: 'receipt', icon: '🧾', title: 'Scan receipt / add expense', detail: 'Reads the total, currency and merchant', run: () => router.replace('/receipt') },
    { key: 'meal', icon: '🍝', title: 'Log a meal', detail: 'Rating, dish and “order again?”', run: () => openForm('FOOD_LOG') },
    { key: 'note', icon: '📝', title: 'Quick journal note', detail: 'Tip: use the keyboard’s microphone to dictate', run: quickNote },
    { key: 'transit', icon: '🚆', title: 'Log transit', detail: 'A train, bus, ferry or taxi you just took', run: () => openForm('TRANSPORTATION') },
    { key: 'link', icon: '🔗', title: 'Save a link', detail: 'Keep a URL with this trip', run: () => openForm('SAVED_LINK') },
    { key: 'parked', icon: '🚗', title: 'Where I parked', detail: 'Pin, photo and meter timer', run: () => router.replace('/parked') },
  ];

  return (
    <Screen>
      <AppText muted>Adding to {trip.title}</AppText>
      {message ? <Banner text={message} tone="warning" /> : null}
      {options.map((option) => (
        <Card key={option.key} onPress={() => void option.run()} accessibilityLabel={option.title}>
          <AppText variant="heading">
            {option.icon} {option.title}
          </AppText>
          <AppText variant="caption" muted>
            {option.detail}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}
