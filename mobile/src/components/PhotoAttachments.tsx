/**
 * Photos to attach to the entity being edited. "Add photo" asks whether to use
 * the camera or the photo library, then keeps the choices until the form saves.
 */
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { exifCoordinate, exifDate } from '@/domain/exif';
import { getCurrentPosition } from '@/tasks/location';
import { radius, spacing } from '@/lib/theme';
import { showActionSheet } from './ActionSheet';
import { AppText, Banner, Button, Row } from './ui';

export interface PickedPhoto {
  uri: string;
  latitude: number | null;
  longitude: number | null;
  takenAt: string;
}

/** Open the camera or the library and describe what came back (empty if cancelled). */
export async function pickPhotos(source: 'camera' | 'library'): Promise<PickedPhoto[] | 'denied'> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: true, quality: 0.9 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 6 });
  if (result.canceled || result.assets.length === 0) return [];

  // A fresh camera shot has no EXIF GPS until the OS writes it: use where the phone is now.
  const here = source === 'camera' ? await getCurrentPosition() : null;
  return result.assets.map((asset) => {
    const exif: Record<string, unknown> = asset.exif ?? {};
    return {
      uri: asset.uri,
      latitude: exifCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef) ?? here?.latitude ?? null,
      longitude: exifCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef) ?? here?.longitude ?? null,
      takenAt: exifDate(exif.DateTimeOriginal ?? exif.DateTime) ?? new Date().toISOString(),
    };
  });
}

interface Props {
  photos: readonly PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  /** Photos a meal can hold, to match the server's limit. */
  max?: number;
}

export default function PhotoAttachments({ photos, onChange, max = 12 }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const add = async (source: 'camera' | 'library') => {
    setMessage(null);
    const picked = await pickPhotos(source);
    if (picked === 'denied') {
      setMessage('Camera permission is needed to take a photo. You can still choose one from your library.');
      return;
    }
    onChange([...photos, ...picked].slice(0, max));
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="heading">Photos</AppText>
      {message ? <Banner tone="warning" text={message} /> : null}
      {photos.length > 0 ? (
        <Row>
          {photos.map((photo, index) => (
            <Pressable
              key={`${photo.uri}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              onPress={() => onChange(photos.filter((_, i) => i !== index))}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
              <View style={styles.remove}>
                <AppText variant="caption" color="#FFFFFF">
                  ✕
                </AppText>
              </View>
            </Pressable>
          ))}
        </Row>
      ) : null}
      <Button
        label={photos.length > 0 ? '+ Add another photo' : '📷 Add photo'}
        variant="secondary"
        disabled={photos.length >= max}
        onPress={() =>
          showActionSheet('Add a photo', [
            { label: 'Take a photo', onPress: () => add('camera') },
            { label: 'Choose from library', onPress: () => add('library') },
          ])
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
