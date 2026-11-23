import sharp from 'sharp';
import prisma from '../config/database';
import immichService from './immich.service';
import { resolveUploadPath } from './_shared/uploadPaths';
import { tripTint } from './_shared/vendored/tripTint';

/** The slice of a Photo needed to find an image to sample. */
export interface CoverPhotoSource {
  source: string;
  immichAssetId: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
}

/** The slice of a Trip needed to work out its cover colour. */
export interface CoverSource {
  userId: number;
  coverImagePath: string | null;
  coverImageThumbnailPath: string | null;
  coverPhoto: CoverPhotoSource | null;
}

const SAMPLE_SIZE = 64;

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The dominant colour of an image (a file path or an encoded buffer) as `#rrggbb`,
 * or null when it has no usable hue (grey, near-black, near-white) or cannot be
 * decoded. Greys are filtered here with the same rule the UI applies, so a
 * stored colour always produces a tint.
 */
export async function dominantColor(input: string | Buffer): Promise<string | null> {
  try {
    const { dominant } = await sharp(input)
      .rotate()
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
      .removeAlpha()
      .stats();
    const hex = toHex(dominant.r, dominant.g, dominant.b);
    return tripTint(hex, 'dark') ? hex : null;
  } catch (error) {
    console.warn('[TripCoverColor] Could not read cover colour:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function colorFromStoredPath(webPath: string | null): Promise<string | null> {
  if (!webPath) return null;
  const absolute = resolveUploadPath(webPath);
  return absolute ? dominantColor(absolute) : null;
}

async function colorFromPhoto(photo: CoverPhotoSource, ownerId: number): Promise<string | null> {
  if (photo.source === 'immich') {
    if (!photo.immichAssetId) return null;
    try {
      const { apiUrl, apiKey } = await immichService.getUserSettings(ownerId);
      const { stream } = await immichService.getAssetThumbnailStream(apiUrl, apiKey, photo.immichAssetId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
      return dominantColor(Buffer.concat(chunks));
    } catch (error) {
      console.warn('[TripCoverColor] Immich cover unavailable:', error instanceof Error ? error.message : error);
      return null;
    }
  }
  return (await colorFromStoredPath(photo.thumbnailPath)) ?? (await colorFromStoredPath(photo.localPath));
}

/**
 * Dominant colour of whatever the trip currently uses as its cover: the uploaded
 * image first (the two are mutually exclusive, so at most one exists), else the
 * library photo. Null when there is no cover or it cannot be sampled. Never throws.
 */
export async function computeCoverColor(trip: CoverSource): Promise<string | null> {
  const uploaded =
    (await colorFromStoredPath(trip.coverImageThumbnailPath)) ?? (await colorFromStoredPath(trip.coverImagePath));
  if (uploaded) return uploaded;
  if (trip.coverPhoto) return colorFromPhoto(trip.coverPhoto, trip.userId);
  return null;
}

/** Recomputes and stores one trip's cover colour. Returns the stored value. */
export async function refreshCoverColor(tripId: number): Promise<string | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      userId: true,
      coverImagePath: true,
      coverImageThumbnailPath: true,
      coverPhoto: { select: { source: true, immichAssetId: true, localPath: true, thumbnailPath: true } },
    },
  });
  if (!trip) return null;
  const coverColor = await computeCoverColor(trip);
  await prisma.trip.update({ where: { id: tripId }, data: { coverColor } });
  return coverColor;
}
