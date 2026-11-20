import prisma from '../../config/database';
import type { EntityLinkResponse } from '../../types/entityLink.types';

/**
 * Compatibility layer for "this activity / lodging is at this place".
 *
 * That fact lives in `activities.location_id` / `lodging.location_id` (a real foreign key).
 * Clients written before the FK existed (installed Android app, cached web bundles) still read
 * and write it as an `EntityLink` row, so the link API shows the FK as a *synthetic* link
 * (`ACTIVITY|LODGING -> LOCATION`, `OCCURRED_AT`) and accepts the old link calls against it.
 *
 * Synthetic links have no row. Their id is negative and encodes the entity, so a client that
 * deletes "the link" by id still reaches the FK:
 *
 *   ACTIVITY id N -> -(2N)        LODGING id N -> -(2N + 1)
 */

export type LocationBearingType = 'ACTIVITY' | 'LODGING';

/** Id given to the synthetic link of an activity or lodging. Always negative. */
export function syntheticLocationLinkId(type: LocationBearingType, entityId: number): number {
  return type === 'ACTIVITY' ? -(entityId * 2) : -(entityId * 2 + 1);
}

/** Inverse of {@link syntheticLocationLinkId}; null when `linkId` is a real (positive) link id. */
export function decodeSyntheticLocationLinkId(
  linkId: number
): { type: LocationBearingType; entityId: number } | null {
  if (!Number.isInteger(linkId) || linkId >= -1) return null;
  const n = -linkId;
  return n % 2 === 0
    ? { type: 'ACTIVITY', entityId: n / 2 }
    : { type: 'LODGING', entityId: (n - 1) / 2 };
}

function toLink(
  type: LocationBearingType,
  row: { id: number; tripId: number; locationId: number | null; createdAt: Date }
): EntityLinkResponse {
  return {
    id: syntheticLocationLinkId(type, row.id),
    tripId: row.tripId,
    sourceType: type,
    sourceId: row.id,
    targetType: 'LOCATION',
    targetId: row.locationId as number,
    relationship: 'OCCURRED_AT',
    sortOrder: null,
    notes: null,
    createdAt: row.createdAt,
  };
}

export interface SyntheticLocationLinkFilter {
  /** Only the link of this entity (the "links from this activity/lodging" view). */
  entity?: { type: LocationBearingType; id: number };
  /** Only links that point at this location (the "links to this location" view). */
  locationId?: number;
}

/**
 * The FK-backed place of every activity and lodging of a trip, expressed as link rows.
 * Optionally narrowed to one entity or one location.
 */
export async function findSyntheticLocationLinks(
  tripId: number,
  filter: SyntheticLocationLinkFilter = {}
): Promise<EntityLinkResponse[]> {
  const { entity, locationId } = filter;
  const select = { id: true, tripId: true, locationId: true, createdAt: true } as const;
  const where = (idFilter?: number) => ({
    tripId,
    locationId: locationId ?? { not: null },
    ...(idFilter !== undefined ? { id: idFilter } : {}),
  });

  const [activities, lodgings] = await Promise.all([
    !entity || entity.type === 'ACTIVITY'
      ? prisma.activity.findMany({ where: where(entity?.id), select, orderBy: { id: 'asc' } })
      : Promise.resolve([]),
    !entity || entity.type === 'LODGING'
      ? prisma.lodging.findMany({ where: where(entity?.id), select, orderBy: { id: 'asc' } })
      : Promise.resolve([]),
  ]);

  return [
    ...activities.map((row) => toLink('ACTIVITY', row)),
    ...lodgings.map((row) => toLink('LODGING', row)),
  ];
}
