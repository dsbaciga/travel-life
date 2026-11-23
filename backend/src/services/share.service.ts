import crypto from 'crypto';
import path from 'path';
import prisma from '../config/database';
import { config } from '../config';
import { AppError } from '../errors/errors';

/**
 * Share service — public trip sharing via unguessable share links.
 *
 * A trip owner can generate a share token (32 random bytes, hex-encoded) that
 * makes a SANITIZED, read-only view of the trip available to anyone with the
 * link — no authentication required.
 *
 * Design decisions:
 * - Disabling sharing keeps the token but sets shareEnabled=false, so
 *   re-enabling restores the same URL. Use rotate for a brand-new URL.
 * - The public payload is built explicitly field-by-field. Raw Prisma objects
 *   are NEVER spread into the response, so confirmation numbers, costs,
 *   booking references, seat numbers, and Immich data cannot leak.
 * - Only LOCAL photos are exposed (Immich assets require authenticated
 *   proxying). Photo binaries are streamed through a token-scoped public
 *   endpoint because the /uploads static route requires authentication.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareInfo {
  shareEnabled: boolean;
  shareToken: string | null;
  /** Frontend route path for the share link (no origin). */
  sharePath: string | null;
}

export interface PublicLocation {
  id: number;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  excludeFromMap: boolean;
}

export interface PublicActivity {
  id: number;
  name: string;
  category: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  locationName: string | null;
  notes: string | null;
}

export interface PublicTransportation {
  id: number;
  type: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startTimezone: string | null;
  endTimezone: string | null;
  from: string | null;
  to: string | null;
}

export interface PublicLodging {
  id: number;
  name: string;
  type: string;
  checkInDate: string;
  checkOutDate: string;
  timezone: string | null;
}

export interface PublicJournalEntry {
  id: number;
  title: string | null;
  content: string;
  date: string | null;
  entryType: string;
  mood: string | null;
}

export interface PublicPhoto {
  id: number;
  caption: string | null;
  takenAt: string | null;
  /** Starred by the owner; the favorites form the trip's highlight set. */
  isFavorite: boolean;
  /** API path that streams the full-size image (token-scoped, unauthenticated). */
  url: string;
  /** API path that streams the thumbnail (falls back to the full image). */
  thumbnailUrl: string;
}

export interface PublicTripPayload {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  tripType: string | null;
  tripTypeEmoji: string | null;
  locations: PublicLocation[];
  activities: PublicActivity[];
  transportation: PublicTransportation[];
  lodging: PublicLodging[];
  journalEntries: PublicJournalEntry[];
  photos: PublicPhoto[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateShareToken = (): string => crypto.randomBytes(32).toString('hex');

const toShareInfo = (trip: { shareEnabled: boolean; shareToken: string | null }): ShareInfo => ({
  shareEnabled: trip.shareEnabled,
  shareToken: trip.shareToken,
  sharePath: trip.shareToken ? `/share/${trip.shareToken}` : null,
});

const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/** Owner-only guard: the trip must exist AND belong to the user. */
const requireOwnedTrip = async (userId: number, tripId: number) => {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true, shareToken: true, shareEnabled: true },
  });

  if (!trip) {
    throw new AppError("We couldn't find that trip, or you don't have permission to manage sharing.", 404);
  }

  return trip;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ShareService {
  /**
   * Enable sharing for a trip (owner only). Generates a token on first use;
   * re-enabling after a disable reuses the existing token.
   */
  async enableShare(userId: number, tripId: number): Promise<ShareInfo> {
    const trip = await requireOwnedTrip(userId, tripId);

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: {
        shareToken: trip.shareToken ?? generateShareToken(),
        shareEnabled: true,
      },
      select: { shareToken: true, shareEnabled: true },
    });

    return toShareInfo(updated);
  }

  /**
   * Rotate the share token (owner only). The old link stops working
   * immediately; sharing stays enabled with the new token.
   */
  async rotateShareToken(userId: number, tripId: number): Promise<ShareInfo> {
    const trip = await requireOwnedTrip(userId, tripId);

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: {
        shareToken: generateShareToken(),
        shareEnabled: true,
      },
      select: { shareToken: true, shareEnabled: true },
    });

    return toShareInfo(updated);
  }

  /**
   * Disable sharing (owner only). The token is KEPT (not nulled) so that
   * re-enabling restores the same URL; the public endpoint 404s while
   * shareEnabled is false. Rotate to invalidate the URL permanently.
   */
  async disableShare(userId: number, tripId: number): Promise<ShareInfo> {
    const trip = await requireOwnedTrip(userId, tripId);

    const updated = await prisma.trip.update({
      where: { id: trip.id },
      data: { shareEnabled: false },
      select: { shareToken: true, shareEnabled: true },
    });

    return toShareInfo(updated);
  }

  /**
   * Public, unauthenticated trip view. 404s unless a trip has this exact
   * token AND sharing is currently enabled.
   *
   * SECURITY: every field in the returned payload is copied explicitly.
   * Excluded on purpose: costs/currency, confirmation numbers, booking
   * references/URLs, seat numbers, companion/collaborator data, addresses of
   * lodging, Immich photos, and any user account information.
   */
  async getPublicTrip(token: string): Promise<PublicTripPayload> {
    const trip = await prisma.trip.findFirst({
      where: { shareToken: token, shareEnabled: true },
      include: {
        locations: {
          include: { category: { select: { name: true } } },
          orderBy: [{ visitDatetime: 'asc' }, { id: 'asc' }],
        },
        activities: {
          orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        },
        transportation: {
          include: {
            startLocation: { select: { name: true } },
            endLocation: { select: { name: true } },
          },
          orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }],
        },
        lodging: {
          orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }],
        },
        journalEntries: {
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        },
        photos: {
          where: { source: 'local', mediaType: 'image' },
          orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!trip) {
      throw new AppError("We couldn't find that shared trip.", 404);
    }

    // Activity -> location name, from the activity's own locationId
    const locationNameById = new Map<number, string>();
    for (const location of trip.locations) {
      locationNameById.set(location.id, location.name);
    }

    // Trip dates are DATE columns; expose only the date part to avoid
    // timezone-shifting on the client.
    const toDateOnly = (value: Date | null): string | null =>
      value ? value.toISOString().split('T')[0] : null;

    return {
      title: trip.title,
      description: trip.description,
      startDate: toDateOnly(trip.startDate),
      endDate: toDateOnly(trip.endDate),
      timezone: trip.timezone,
      tripType: trip.tripType,
      tripTypeEmoji: trip.tripTypeEmoji,
      locations: trip.locations.map((location) => ({
        id: location.id,
        name: location.name,
        category: location.category?.name ?? null,
        latitude: toNumberOrNull(location.latitude),
        longitude: toNumberOrNull(location.longitude),
        notes: location.notes,
        excludeFromMap: location.excludeFromMap,
      })),
      activities: trip.activities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        category: activity.category,
        allDay: activity.allDay,
        startTime: toIso(activity.startTime),
        endTime: toIso(activity.endTime),
        timezone: activity.timezone,
        locationName: (activity.locationId != null ? locationNameById.get(activity.locationId) : undefined) ?? null,
        notes: activity.notes,
      })),
      transportation: trip.transportation.map((transport) => ({
        id: transport.id,
        type: transport.type,
        scheduledStart: toIso(transport.scheduledStart),
        scheduledEnd: toIso(transport.scheduledEnd),
        startTimezone: transport.startTimezone,
        endTimezone: transport.endTimezone,
        from: transport.startLocation?.name ?? transport.startLocationText,
        to: transport.endLocation?.name ?? transport.endLocationText,
      })),
      lodging: trip.lodging.map((stay) => ({
        id: stay.id,
        name: stay.name,
        type: stay.type,
        checkInDate: stay.checkInDate.toISOString(),
        checkOutDate: stay.checkOutDate.toISOString(),
        timezone: stay.timezone,
      })),
      journalEntries: trip.journalEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        date: toDateOnly(entry.date),
        entryType: entry.entryType,
        mood: entry.mood,
      })),
      photos: trip.photos
        .filter((photo) => photo.localPath)
        .map((photo) => ({
          id: photo.id,
          caption: photo.caption,
          takenAt: toIso(photo.takenAt),
          isFavorite: photo.isFavorite,
          url: `/api/public/trips/${token}/photos/${photo.id}/file`,
          thumbnailUrl: photo.thumbnailPath
            ? `/api/public/trips/${token}/photos/${photo.id}/thumbnail`
            : `/api/public/trips/${token}/photos/${photo.id}/file`,
        })),
    };
  }

  /**
   * Resolve the absolute filesystem path for a LOCAL photo belonging to the
   * shared trip. 404s if the token is invalid/disabled, the photo does not
   * belong to that trip, or the photo is not a local file. Path traversal is
   * prevented by confining the resolved path to the uploads directory.
   */
  async getPublicPhotoFilePath(
    token: string,
    photoId: number,
    variant: 'full' | 'thumbnail'
  ): Promise<string> {
    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        source: 'local',
        mediaType: 'image',
        trip: { shareToken: token, shareEnabled: true },
      },
      select: { localPath: true, thumbnailPath: true },
    });

    if (!photo) {
      throw new AppError("We couldn't find that.", 404);
    }

    const stored = variant === 'thumbnail' ? (photo.thumbnailPath ?? photo.localPath) : photo.localPath;
    if (!stored || !stored.startsWith('/uploads/')) {
      throw new AppError("We couldn't find that.", 404);
    }

    // Stored paths look like /uploads/photos/<file>; the uploads root on disk
    // is config.upload.dir (default ./uploads relative to cwd).
    const uploadsRoot = path.resolve(config.upload.dir);
    const absolute = path.resolve(uploadsRoot, stored.slice('/uploads/'.length));

    if (!absolute.startsWith(uploadsRoot + path.sep)) {
      throw new AppError("We couldn't find that.", 404);
    }

    return absolute;
  }
}

export default new ShareService();
