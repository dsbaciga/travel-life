import { formatInTimeZone } from 'date-fns-tz';
import { AppError } from '../errors/errors';
import prisma from '../config/database';
import type { Photo } from '@prisma/client';
import { getUserTimezone, resolveTimezone } from './_shared/timezoneResolution';

/** A photo thumbnail shown in the suggestion's hover preview grid. */
interface SuggestionPreviewPhoto {
  id: number;
  thumbnailPath: string | null;
  source: string;
  mediaType: string;
  caption: string | null;
}

interface AlbumSuggestion {
  name: string;
  /** Human-readable explanation of what the photos are and why they were grouped. */
  description: string;
  photoIds: number[];
  /** A representative sample (up to 9) for the client's 3x3 preview. */
  previewPhotos: SuggestionPreviewPhoto[];
  type: 'date' | 'location';
  confidence: number;
  metadata: {
    date?: string;
    locationName?: string;
    locationId?: number;
    startTime?: string;
    endTime?: string;
    photoCount?: number;
  };
}

/** Trip place used to name a photo cluster after somewhere the user actually recorded. */
interface NamedPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

const TIME_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours - the "same session" window
const LOCATION_RADIUS_M = 500; // photos this close count as the same place
const PLACE_MATCH_RADIUS_M = 1000; // how far a trip location may sit from a cluster and still name it
const PREVIEW_PHOTO_LIMIT = 9; // 3x3 grid on the client
const MAX_CAPTIONS_IN_DESCRIPTION = 2;
const CAPTION_EXCERPT_LENGTH = 60;

// Helper to calculate distance between two coordinates in meters (Haversine formula)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Group photos by time window (2 hours)
function groupPhotosByTime(photos: Photo[]): Map<string, Photo[]> {
  const groups = new Map<string, Photo[]>();

  // Sort photos by time
  const sortedPhotos = [...photos].sort((a, b) => {
    const timeA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
    const timeB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
    return timeA - timeB;
  });

  let currentGroup: Photo[] = [];
  let groupStartTime = 0;

  for (const photo of sortedPhotos) {
    if (!photo.takenAt) continue;

    const photoTime = new Date(photo.takenAt).getTime();

    if (currentGroup.length === 0) {
      currentGroup.push(photo);
      groupStartTime = photoTime;
    } else if (photoTime - groupStartTime <= TIME_WINDOW_MS) {
      currentGroup.push(photo);
    } else {
      // Start new group
      if (currentGroup.length >= 3) {
        const date = new Date(groupStartTime).toISOString().split('T')[0];
        const key = `date-${date}-${groupStartTime}`;
        groups.set(key, currentGroup);
      }
      currentGroup = [photo];
      groupStartTime = photoTime;
    }
  }

  // Don't forget the last group
  if (currentGroup.length >= 3) {
    const date = new Date(groupStartTime).toISOString().split('T')[0];
    const key = `date-${date}-${groupStartTime}`;
    groups.set(key, currentGroup);
  }

  return groups;
}

// Group photos by location (500m radius)
function groupPhotosByLocation(photos: Photo[]): Map<string, Photo[]> {
  const groups = new Map<string, Photo[]>();

  const geoPhotos = photos.filter(
    (p) => p.latitude != null && p.longitude != null
  );

  // Simple clustering - iterate and group
  const assigned = new Set<number>();

  for (const photo of geoPhotos) {
    if (assigned.has(photo.id)) continue;

    const cluster: Photo[] = [photo];
    assigned.add(photo.id);

    const lat1 = Number(photo.latitude);
    const lng1 = Number(photo.longitude);

    for (const other of geoPhotos) {
      if (assigned.has(other.id)) continue;

      const lat2 = Number(other.latitude);
      const lng2 = Number(other.longitude);

      const distance = calculateDistance(lat1, lng1, lat2, lng2);
      if (distance <= LOCATION_RADIUS_M) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }

    if (cluster.length >= 3) {
      const key = `location-${lat1.toFixed(4)}-${lng1.toFixed(4)}`;
      groups.set(key, cluster);
    }
  }

  return groups;
}

/** Average position of the geotagged photos in a group, or null if none are geotagged. */
function centroidOf(photos: Photo[]): { latitude: number; longitude: number } | null {
  const geoPhotos = photos.filter((p) => p.latitude != null && p.longitude != null);
  if (geoPhotos.length === 0) return null;

  const sum = geoPhotos.reduce(
    (acc, p) => ({
      latitude: acc.latitude + Number(p.latitude),
      longitude: acc.longitude + Number(p.longitude),
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: sum.latitude / geoPhotos.length,
    longitude: sum.longitude / geoPhotos.length,
  };
}

/**
 * The trip location closest to a cluster, so a suggestion can say "the Louvre"
 * instead of a pair of coordinates. Returns null when nothing is close enough.
 */
function findNearestPlace(photos: Photo[], places: NamedPlace[]): NamedPlace | null {
  const center = centroidOf(photos);
  if (!center || places.length === 0) return null;

  let nearest: NamedPlace | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const place of places) {
    const distance = calculateDistance(
      center.latitude,
      center.longitude,
      place.latitude,
      place.longitude
    );
    if (distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }

  return nearestDistance <= PLACE_MATCH_RADIUS_M ? nearest : null;
}

/** Earliest and latest capture times in a group, ignoring photos with no timestamp. */
function timeRangeOf(photos: Photo[]): { start: Date; end: Date } | null {
  const times = photos
    .filter((p) => p.takenAt)
    .map((p) => new Date(p.takenAt as Date).getTime())
    .sort((a, b) => a - b);

  if (times.length === 0) return null;
  return { start: new Date(times[0]), end: new Date(times[times.length - 1]) };
}

/** "3 photos", "9 photos (2 videos)" - what the group actually holds. */
function describeContents(photos: Photo[]): string {
  const videoCount = photos.filter((p) => p.mediaType === 'video').length;
  const imageCount = photos.length - videoCount;

  if (videoCount === 0) {
    return `${imageCount} photo${imageCount === 1 ? '' : 's'}`;
  }
  if (imageCount === 0) {
    return `${videoCount} video${videoCount === 1 ? '' : 's'}`;
  }
  return `${imageCount} photo${imageCount === 1 ? '' : 's'} and ${videoCount} video${
    videoCount === 1 ? '' : 's'
  }`;
}

/**
 * Captions are the only real signal of what is *in* the pictures, so quote a
 * couple of them verbatim rather than guessing at subjects.
 */
function describeCaptions(photos: Photo[]): string {
  const captions: string[] = [];
  const seen = new Set<string>();

  for (const photo of photos) {
    const caption = photo.caption?.trim();
    if (!caption) continue;

    const key = caption.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    captions.push(
      caption.length > CAPTION_EXCERPT_LENGTH
        ? `${caption.slice(0, CAPTION_EXCERPT_LENGTH).trimEnd()}...`
        : caption
    );
    if (captions.length === MAX_CAPTIONS_IN_DESCRIPTION) break;
  }

  if (captions.length === 0) return '';

  const quoted = captions.map((c) => `"${c}"`);
  const list = quoted.length === 1 ? quoted[0] : `${quoted[0]} and ${quoted[1]}`;
  return ` Captions mention ${list}.`;
}

/**
 * A representative sample for the preview grid: evenly spaced across the group
 * so the thumbnails show the whole span, not just its first few seconds.
 */
function pickPreviewPhotos(photos: Photo[]): SuggestionPreviewPhoto[] {
  const ordered = [...photos].sort((a, b) => {
    const timeA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
    const timeB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  const sample =
    ordered.length <= PREVIEW_PHOTO_LIMIT
      ? ordered
      : Array.from({ length: PREVIEW_PHOTO_LIMIT }, (_, i) =>
          ordered[Math.round((i * (ordered.length - 1)) / (PREVIEW_PHOTO_LIMIT - 1))]
        );

  return sample.map((photo) => ({
    id: photo.id,
    // Immich assets are proxied through our API, exactly as the photo endpoints do.
    thumbnailPath:
      photo.source === 'immich' && photo.immichAssetId
        ? `/api/immich/assets/${photo.immichAssetId}/thumbnail`
        : photo.thumbnailPath ?? photo.localPath,
    source: photo.source,
    mediaType: photo.mediaType,
    caption: photo.caption,
  }));
}

// Format a date for album name
function formatDateForAlbumName(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, 'MMMM d, yyyy');
}

/** "on Sunday, June 15 between 10:04 AM and 11:37 AM" */
function describeTimeRange(range: { start: Date; end: Date }, timezone: string): string {
  const day = formatInTimeZone(range.start, timezone, 'EEEE, MMMM d');
  const startTime = formatInTimeZone(range.start, timezone, 'h:mm a');
  const endTime = formatInTimeZone(range.end, timezone, 'h:mm a');

  if (startTime === endTime) {
    return `on ${day} at ${startTime}`;
  }
  return `on ${day} between ${startTime} and ${endTime}`;
}

/** "on June 15" or "between June 15 and June 17" for clusters that span days. */
function describeDateSpan(range: { start: Date; end: Date }, timezone: string): string {
  const startDay = formatInTimeZone(range.start, timezone, 'MMMM d');
  const endDay = formatInTimeZone(range.end, timezone, 'MMMM d');

  return startDay === endDay ? `on ${startDay}` : `between ${startDay} and ${endDay}`;
}

export const albumSuggestionService = {
  /**
   * Get album suggestions for a trip based on photo clustering
   */
  async getAlbumSuggestions(userId: number, tripId: number): Promise<AlbumSuggestion[]> {
    // Verify user owns the trip
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // Get all photos for this trip that are not already in an album
    const photos = await prisma.photo.findMany({
      where: {
        tripId,
        albumAssignments: { none: {} }, // Only unsorted photos
      },
    });

    if (photos.length < 3) {
      return [];
    }

    // Descriptions are shown to this user, so they read on this user's clock.
    const timezone = resolveTimezone(trip.timezone, await getUserTimezone(userId));

    // Trip locations let a cluster be described by name instead of coordinates.
    const tripLocations = await prisma.location.findMany({
      where: { tripId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    const places: NamedPlace[] = tripLocations.map((location) => ({
      id: location.id,
      name: location.name,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    }));

    const suggestions: AlbumSuggestion[] = [];

    // Group by date/time
    const dateGroups = groupPhotosByTime(photos);
    for (const groupPhotos of dateGroups.values()) {
      if (groupPhotos.length < 3) continue;

      const firstPhoto = groupPhotos[0];
      const date = firstPhoto.takenAt ? new Date(firstPhoto.takenAt) : new Date();
      const formattedDate = formatDateForAlbumName(date, timezone);

      const range = timeRangeOf(groupPhotos);
      const place = findNearestPlace(groupPhotos, places);
      const placeClause = place ? ` near ${place.name}` : '';
      const whenClause = range ? ` taken ${describeTimeRange(range, timezone)}` : '';

      suggestions.push({
        name: formattedDate,
        description:
          `${describeContents(groupPhotos)}${whenClause}${placeClause}. ` +
          'Grouped as one session because each shot was taken within 2 hours of the one before it.' +
          describeCaptions(groupPhotos),
        photoIds: groupPhotos.map((p) => p.id),
        previewPhotos: pickPreviewPhotos(groupPhotos),
        type: 'date',
        confidence: Math.min(0.5 + groupPhotos.length * 0.1, 0.95),
        metadata: {
          date: formatInTimeZone(date, timezone, 'yyyy-MM-dd'),
          photoCount: groupPhotos.length,
          ...(place ? { locationName: place.name, locationId: place.id } : {}),
          ...(range
            ? { startTime: range.start.toISOString(), endTime: range.end.toISOString() }
            : {}),
        },
      });
    }

    // Group by location
    const locationGroups = groupPhotosByLocation(photos);
    for (const groupPhotos of locationGroups.values()) {
      if (groupPhotos.length < 3) continue;

      // Name the cluster after the nearest recorded place, falling back to coordinates
      const firstPhoto = groupPhotos[0];
      const lat = Number(firstPhoto.latitude).toFixed(2);
      const lng = Number(firstPhoto.longitude).toFixed(2);
      const place = findNearestPlace(groupPhotos, places);
      const locationName = place ? place.name : `Location (${lat}, ${lng})`;

      const range = timeRangeOf(groupPhotos);
      const whenClause = range ? `, ${describeDateSpan(range, timezone)}` : '';
      const whereClause = place
        ? ` taken within ${LOCATION_RADIUS_M} m of ${place.name}`
        : ` taken around ${lat}, ${lng}`;

      suggestions.push({
        name: locationName,
        description:
          `${describeContents(groupPhotos)}${whereClause}${whenClause}. ` +
          `Grouped by place because every one of them falls inside the same ${LOCATION_RADIUS_M} m radius.` +
          describeCaptions(groupPhotos),
        photoIds: groupPhotos.map((p) => p.id),
        previewPhotos: pickPreviewPhotos(groupPhotos),
        type: 'location',
        confidence: Math.min(0.4 + groupPhotos.length * 0.1, 0.9),
        metadata: {
          locationName,
          photoCount: groupPhotos.length,
          ...(place ? { locationId: place.id } : {}),
          ...(range
            ? { startTime: range.start.toISOString(), endTime: range.end.toISOString() }
            : {}),
        },
      });
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Return top 5 suggestions
    return suggestions.slice(0, 5);
  },

  /**
   * Accept a suggestion and create an album
   */
  async acceptSuggestion(
    userId: number,
    tripId: number,
    suggestion: { name: string; photoIds: number[] }
  ): Promise<{ albumId: number }> {
    // Verify user owns the trip
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // Verify all photos belong to this trip (authorization check)
    const photosCount = await prisma.photo.count({
      where: {
        id: { in: suggestion.photoIds },
        tripId: tripId,
      },
    });

    if (photosCount !== suggestion.photoIds.length) {
      throw new AppError('Some photos do not belong to this trip', 400);
    }

    // Create the album
    const album = await prisma.photoAlbum.create({
      data: {
        name: suggestion.name,
        tripId,
        photoAssignments: {
          create: suggestion.photoIds.map((photoId, index) => ({
            photoId,
            sortOrder: index,
          })),
        },
      },
    });

    return { albumId: album.id };
  },
};

export default albumSuggestionService;
