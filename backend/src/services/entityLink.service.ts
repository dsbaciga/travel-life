import prisma from '../config/database';
import logger from '../config/logger';
import { AppError } from '../utils/errors';
import { verifyTripAccessWithPermission } from '../utils/serviceHelpers';

// Type for Prisma transaction client
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Prisma-like filter types
interface EntityLinkWhereInput {
  tripId?: number;
  sourceType?: string;
  sourceId?: number;
  targetType?: string;
  targetId?: number;
  [key: string]: unknown;
}
import type {
  EntityType,
  LinkRelationship,
  CreateEntityLinkInput,
  BulkCreateEntityLinksInput,
  GetLinksFromEntityInput,
  GetLinksToEntityInput,
  DeleteEntityLinkInput,
  UpdateEntityLinkInput,
  BulkLinkPhotosInput,
  EntityLinkResponse,
  EnrichedEntityLink,
  EntityLinkSummary,
} from '../types/entityLink.types';

// Entity details return type
type EntityDetails = { id: number; name?: string; title?: string; caption?: string; thumbnailPath?: string; date?: string };

// Generic entity record type returned from findFirst/findUnique
type EntityRecord = { id: number } & Record<string, unknown>;

/**
 * Configuration for entity type operations
 * Maps entity types to their verification and details functions
 */
const ENTITY_CONFIG: Record<EntityType, {
  findInTrip: (tripId: number, entityId: number) => Promise<EntityRecord | null>;
  getDetails: (entityId: number) => Promise<EntityDetails | null>;
}> = {
  PHOTO: {
    findInTrip: (tripId, entityId) => prisma.photo.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const photo = await prisma.photo.findUnique({
        where: { id: entityId },
        select: { id: true, caption: true, thumbnailPath: true },
      });
      return photo ? { id: photo.id, caption: photo.caption || undefined, thumbnailPath: photo.thumbnailPath || undefined } : null;
    },
  },
  LOCATION: {
    findInTrip: (tripId, entityId) => prisma.location.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const location = await prisma.location.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      });
      return location ? { id: location.id, name: location.name } : null;
    },
  },
  ACTIVITY: {
    findInTrip: (tripId, entityId) => prisma.activity.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const activity = await prisma.activity.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      });
      return activity ? { id: activity.id, name: activity.name } : null;
    },
  },
  LODGING: {
    findInTrip: (tripId, entityId) => prisma.lodging.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const lodging = await prisma.lodging.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      });
      return lodging ? { id: lodging.id, name: lodging.name } : null;
    },
  },
  TRANSPORTATION: {
    findInTrip: (tripId, entityId) => prisma.transportation.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const transport = await prisma.transportation.findUnique({
        where: { id: entityId },
        select: { id: true, type: true, company: true },
      });
      return transport
        ? { id: transport.id, name: `${transport.type}${transport.company ? ` - ${transport.company}` : ''}` }
        : null;
    },
  },
  JOURNAL_ENTRY: {
    findInTrip: (tripId, entityId) => prisma.journalEntry.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const journal = await prisma.journalEntry.findUnique({
        where: { id: entityId },
        select: { id: true, title: true, date: true },
      });
      return journal ? { id: journal.id, title: journal.title || undefined, date: journal.date?.toISOString() } : null;
    },
  },
  PHOTO_ALBUM: {
    findInTrip: (tripId, entityId) => prisma.photoAlbum.findFirst({ where: { id: entityId, tripId } }),
    getDetails: async (entityId) => {
      const album = await prisma.photoAlbum.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      });
      return album ? { id: album.id, name: album.name } : null;
    },
  },
};

/**
 * Verifies that an entity exists within the specified trip
 * @throws AppError if entity not found or doesn't belong to trip
 */
async function verifyEntityInTrip(
  tripId: number,
  entityType: EntityType,
  entityId: number
): Promise<void> {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    throw new AppError(`Unknown entity type: ${entityType}`, 400);
  }

  const entity = await config.findInTrip(tripId, entityId);
  if (!entity) {
    throw new AppError(
      `${entityType} with ID ${entityId} not found in trip ${tripId}`,
      404
    );
  }
}

/**
 * Batch verify that multiple entities exist within a trip
 * Groups by entity type to minimize queries
 */
async function batchVerifyEntitiesInTrip(
  tripId: number,
  entities: Array<{ entityType: EntityType; entityId: number }>
): Promise<void> {
  if (entities.length === 0) return;

  // Group entities by type
  const byType = new Map<EntityType, number[]>();
  for (const { entityType, entityId } of entities) {
    const existing = byType.get(entityType);
    if (existing) {
      existing.push(entityId);
    } else {
      byType.set(entityType, [entityId]);
    }
  }

  // Batch verify each type
  for (const [entityType, ids] of byType) {
    const uniqueIds = [...new Set(ids)];
    let foundCount = 0;

    switch (entityType) {
      case 'PHOTO':
        foundCount = await prisma.photo.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'LOCATION':
        foundCount = await prisma.location.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'ACTIVITY':
        foundCount = await prisma.activity.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'LODGING':
        foundCount = await prisma.lodging.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'TRANSPORTATION':
        foundCount = await prisma.transportation.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'JOURNAL_ENTRY':
        foundCount = await prisma.journalEntry.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      case 'PHOTO_ALBUM':
        foundCount = await prisma.photoAlbum.count({ where: { id: { in: uniqueIds }, tripId } });
        break;
      default:
        throw new AppError(`Unknown entity type: ${entityType}`, 400);
    }

    if (foundCount !== uniqueIds.length) {
      throw new AppError(
        `One or more ${entityType} entities not found in trip ${tripId}`,
        404
      );
    }
  }
}

/**
 * Batch fetch entity details for multiple entities
 * Returns a map of "entityType:entityId" -> EntityDetails
 */
async function batchGetEntityDetails(
  entities: Array<{ entityType: EntityType; entityId: number }>
): Promise<Map<string, EntityDetails>> {
  const result = new Map<string, EntityDetails>();
  if (entities.length === 0) return result;

  // Group entities by type
  const byType = new Map<EntityType, number[]>();
  for (const { entityType, entityId } of entities) {
    const existing = byType.get(entityType);
    if (existing) {
      existing.push(entityId);
    } else {
      byType.set(entityType, [entityId]);
    }
  }

  // Batch fetch each type
  for (const [entityType, ids] of byType) {
    const uniqueIds = [...new Set(ids)];

    switch (entityType) {
      case 'PHOTO': {
        const photos = await prisma.photo.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, caption: true, thumbnailPath: true },
        });
        for (const photo of photos) {
          result.set(`PHOTO:${photo.id}`, {
            id: photo.id,
            caption: photo.caption || undefined,
            thumbnailPath: photo.thumbnailPath || undefined,
          });
        }
        break;
      }
      case 'LOCATION': {
        const locations = await prisma.location.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true },
        });
        for (const location of locations) {
          result.set(`LOCATION:${location.id}`, { id: location.id, name: location.name });
        }
        break;
      }
      case 'ACTIVITY': {
        const activities = await prisma.activity.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true },
        });
        for (const activity of activities) {
          result.set(`ACTIVITY:${activity.id}`, { id: activity.id, name: activity.name });
        }
        break;
      }
      case 'LODGING': {
        const lodgings = await prisma.lodging.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true },
        });
        for (const lodging of lodgings) {
          result.set(`LODGING:${lodging.id}`, { id: lodging.id, name: lodging.name });
        }
        break;
      }
      case 'TRANSPORTATION': {
        const transports = await prisma.transportation.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, type: true, company: true },
        });
        for (const transport of transports) {
          result.set(`TRANSPORTATION:${transport.id}`, {
            id: transport.id,
            name: `${transport.type}${transport.company ? ` - ${transport.company}` : ''}`,
          });
        }
        break;
      }
      case 'JOURNAL_ENTRY': {
        const journals = await prisma.journalEntry.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, title: true, date: true },
        });
        for (const journal of journals) {
          result.set(`JOURNAL_ENTRY:${journal.id}`, {
            id: journal.id,
            title: journal.title || undefined,
            date: journal.date?.toISOString(),
          });
        }
        break;
      }
      case 'PHOTO_ALBUM': {
        const albums = await prisma.photoAlbum.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true, name: true },
        });
        for (const album of albums) {
          result.set(`PHOTO_ALBUM:${album.id}`, { id: album.id, name: album.name });
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Determines the default relationship type based on source and target entity types
 */
function getDefaultRelationship(
  sourceType: EntityType,
  targetType: EntityType
): LinkRelationship {
  // Photo taken at a location
  if (sourceType === 'PHOTO' && targetType === 'LOCATION') {
    return 'TAKEN_AT';
  }
  // Photo featured in album or journal
  if (sourceType === 'PHOTO' && (targetType === 'PHOTO_ALBUM' || targetType === 'JOURNAL_ENTRY')) {
    return 'FEATURED_IN';
  }
  // Activity/lodging occurred at location
  if ((sourceType === 'ACTIVITY' || sourceType === 'LODGING') && targetType === 'LOCATION') {
    return 'OCCURRED_AT';
  }
  // Journal documents entities
  if (sourceType === 'JOURNAL_ENTRY') {
    return 'DOCUMENTS';
  }
  // Default
  return 'RELATED';
}

export const entityLinkService = {
  /**
   * Create a link between two entities
   */
  async createLink(
    userId: number,
    data: CreateEntityLinkInput
  ): Promise<EntityLinkResponse> {
    // Verify user owns the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify both entities exist in the trip
    await verifyEntityInTrip(data.tripId, data.sourceType, data.sourceId);
    await verifyEntityInTrip(data.tripId, data.targetType, data.targetId);

    // Prevent self-linking
    if (data.sourceType === data.targetType && data.sourceId === data.targetId) {
      throw new AppError('Cannot link an entity to itself', 400);
    }

    // Determine relationship if not provided
    const relationship = data.relationship || getDefaultRelationship(data.sourceType, data.targetType);

    // Check if link already exists
    const existingLink = await prisma.entityLink.findFirst({
      where: {
        tripId: data.tripId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
      },
    });

    if (existingLink) {
      throw new AppError('Link already exists between these entities', 400);
    }

    return await prisma.entityLink.create({
      data: {
        tripId: data.tripId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
        relationship,
        sortOrder: data.sortOrder,
        notes: data.notes,
      },
    });
  },

  /**
   * Bulk create links from one source to multiple targets
   */
  async bulkCreateLinks(
    userId: number,
    data: BulkCreateEntityLinksInput
  ): Promise<{ created: number; skipped: number }> {
    // Verify user owns the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify source entity exists
    await verifyEntityInTrip(data.tripId, data.sourceType, data.sourceId);

    // Batch verify all target entities exist
    const targetEntities = data.targets.map(target => ({
      entityType: target.targetType,
      entityId: target.targetId,
    }));
    await batchVerifyEntitiesInTrip(data.tripId, targetEntities);

    let created = 0;
    let skipped = 0;

    // Create links in a transaction using batch queries to avoid N+1
    await prisma.$transaction(async (tx: TransactionClient) => {
      // Get all existing links for this source using pair-wise OR conditions
      // (avoids cross-product matching that { in: [...types], in: [...ids] } would produce)
      const existingLinks = await tx.entityLink.findMany({
        where: {
          tripId: data.tripId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          OR: data.targets.map(t => ({
            targetType: t.targetType,
            targetId: t.targetId,
          })),
        },
        select: { targetType: true, targetId: true },
      });

      const existingSet = new Set(
        existingLinks.map(l => `${l.targetType}:${l.targetId}`)
      );

      // Filter to only new, non-self links
      const newLinks = data.targets
        .filter(t => !(data.sourceType === t.targetType && data.sourceId === t.targetId))
        .filter(t => !existingSet.has(`${t.targetType}:${t.targetId}`));

      skipped = data.targets.length - newLinks.length;

      if (newLinks.length > 0) {
        await tx.entityLink.createMany({
          data: newLinks.map(t => ({
            tripId: data.tripId,
            sourceType: data.sourceType,
            sourceId: data.sourceId,
            targetType: t.targetType,
            targetId: t.targetId,
            relationship: t.relationship || getDefaultRelationship(data.sourceType, t.targetType),
            sortOrder: t.sortOrder,
            notes: t.notes,
          })),
        });
        created = newLinks.length;
      }
    });

    return { created, skipped };
  },

  /**
   * Bulk link multiple photos to a single target entity
   */
  async bulkLinkPhotos(
    userId: number,
    data: BulkLinkPhotosInput
  ): Promise<{ created: number; skipped: number }> {
    // Verify user owns the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify target entity exists
    await verifyEntityInTrip(data.tripId, data.targetType, data.targetId);

    // Batch verify all photos exist
    const photoEntities = data.photoIds.map(photoId => ({
      entityType: 'PHOTO' as EntityType,
      entityId: photoId,
    }));
    await batchVerifyEntitiesInTrip(data.tripId, photoEntities);

    let created = 0;
    let skipped = 0;

    const relationship = data.relationship || getDefaultRelationship('PHOTO', data.targetType);

    await prisma.$transaction(async (tx: TransactionClient) => {
      // Get all existing links for these photos in one query
      const existingLinks = await tx.entityLink.findMany({
        where: {
          tripId: data.tripId,
          sourceType: 'PHOTO',
          sourceId: { in: data.photoIds },
          targetType: data.targetType,
          targetId: data.targetId,
        },
        select: { sourceId: true },
      });

      const existingPhotoIds = new Set(existingLinks.map(l => l.sourceId));

      // Filter to only photos that don't already have a link
      const newPhotoIds = data.photoIds.filter(id => !existingPhotoIds.has(id));

      skipped = data.photoIds.length - newPhotoIds.length;

      if (newPhotoIds.length > 0) {
        await tx.entityLink.createMany({
          data: newPhotoIds.map(photoId => ({
            tripId: data.tripId,
            sourceType: 'PHOTO',
            sourceId: photoId,
            targetType: data.targetType,
            targetId: data.targetId,
            relationship,
          })),
        });
        created = newPhotoIds.length;
      }
    });

    return { created, skipped };
  },

  /**
   * Get all links from a specific entity
   */
  async getLinksFrom(
    userId: number,
    data: GetLinksFromEntityInput
  ): Promise<EnrichedEntityLink[]> {
    await verifyTripAccessWithPermission(userId, data.tripId, 'view');

    const where: EntityLinkWhereInput = {
      tripId: data.tripId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
    };

    if (data.targetType) {
      where.targetType = data.targetType;
    }

    const links = await prisma.entityLink.findMany({
      where: where as any,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Batch fetch all target entity details
    const targetEntities = links.map(link => ({
      entityType: link.targetType as EntityType,
      entityId: link.targetId,
    }));
    const detailsMap = await batchGetEntityDetails(targetEntities);

    // Enrich with target entity details
    const enrichedLinks: EnrichedEntityLink[] = links.map(link => {
      const targetEntity = detailsMap.get(`${link.targetType}:${link.targetId}`);
      return {
        ...link,
        sourceType: link.sourceType as EntityType,
        targetType: link.targetType as EntityType,
        relationship: link.relationship as LinkRelationship,
        targetEntity: targetEntity || undefined,
      };
    });

    return enrichedLinks;
  },

  /**
   * Get all links to a specific entity
   */
  async getLinksTo(
    userId: number,
    data: GetLinksToEntityInput
  ): Promise<EnrichedEntityLink[]> {
    await verifyTripAccessWithPermission(userId, data.tripId, 'view');

    const where: EntityLinkWhereInput = {
      tripId: data.tripId,
      targetType: data.targetType,
      targetId: data.targetId,
    };

    if (data.sourceType) {
      where.sourceType = data.sourceType;
    }

    const links = await prisma.entityLink.findMany({
      where: where as any,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Batch fetch all source entity details
    const sourceEntities = links.map(link => ({
      entityType: link.sourceType as EntityType,
      entityId: link.sourceId,
    }));
    const detailsMap = await batchGetEntityDetails(sourceEntities);

    // Enrich with source entity details
    const enrichedLinks: EnrichedEntityLink[] = links.map(link => {
      const sourceEntity = detailsMap.get(`${link.sourceType}:${link.sourceId}`);
      return {
        ...link,
        sourceType: link.sourceType as EntityType,
        targetType: link.targetType as EntityType,
        relationship: link.relationship as LinkRelationship,
        sourceEntity: sourceEntity || undefined,
      };
    });

    return enrichedLinks;
  },

  /**
   * Get all links for an entity (both directions)
   */
  async getAllLinksForEntity(
    userId: number,
    tripId: number,
    entityType: EntityType,
    entityId: number
  ): Promise<{
    linksFrom: EnrichedEntityLink[];
    linksTo: EnrichedEntityLink[];
    summary: EntityLinkSummary;
  }> {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    let linksFrom: EnrichedEntityLink[];
    let linksTo: EnrichedEntityLink[];
    try {
      [linksFrom, linksTo] = await Promise.all([
        this.getLinksFrom(userId, { tripId, sourceType: entityType, sourceId: entityId }),
        this.getLinksTo(userId, { tripId, targetType: entityType, targetId: entityId }),
      ]);
    } catch (error) {
      console.error(`Failed to fetch links for entity ${entityType}:${entityId} in trip ${tripId}:`, error);
      throw new AppError('Failed to fetch entity links: ' + (error as Error).message, 500);
    }

    // Build summary counts
    const linkCounts: { [key in EntityType]?: number } = {};

    for (const link of linksFrom) {
      linkCounts[link.targetType] = (linkCounts[link.targetType] || 0) + 1;
    }
    for (const link of linksTo) {
      linkCounts[link.sourceType] = (linkCounts[link.sourceType] || 0) + 1;
    }

    return {
      linksFrom,
      linksTo,
      summary: {
        entityType,
        entityId,
        linkCounts,
        totalLinks: linksFrom.length + linksTo.length,
      },
    };
  },

  /**
   * Delete a specific link
   */
  async deleteLink(userId: number, data: DeleteEntityLinkInput): Promise<void> {
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    const link = await prisma.entityLink.findFirst({
      where: {
        tripId: data.tripId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
      },
    });

    if (!link) {
      throw new AppError('Link not found', 404);
    }

    await prisma.entityLink.delete({
      where: { id: link.id },
    });
  },

  /**
   * Delete a link by ID
   */
  async deleteLinkById(userId: number, tripId: number, linkId: number): Promise<void> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const link = await prisma.entityLink.findFirst({
      where: { id: linkId, tripId },
    });

    if (!link) {
      throw new AppError('Link not found', 404);
    }

    await prisma.entityLink.delete({
      where: { id: linkId },
    });
  },

  /**
   * Update a link (relationship and/or notes)
   */
  async updateLink(
    userId: number,
    tripId: number,
    linkId: number,
    data: UpdateEntityLinkInput
  ): Promise<EntityLinkResponse> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const link = await prisma.entityLink.findFirst({
      where: { id: linkId, tripId },
    });

    if (!link) {
      throw new AppError('Link not found', 404);
    }

    const updateData: { relationship?: string; notes?: string | null } = {};
    if (data.relationship !== undefined) {
      updateData.relationship = data.relationship;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    return await prisma.entityLink.update({
      where: { id: linkId },
      data: updateData as any,
    });
  },

  /**
   * Delete all links for an entity
   */
  async deleteAllLinksForEntity(
    userId: number,
    tripId: number,
    entityType: EntityType,
    entityId: number
  ): Promise<{ deleted: number }> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // Delete links where entity is source or target
    const result = await prisma.entityLink.deleteMany({
      where: {
        tripId,
        OR: [
          { sourceType: entityType, sourceId: entityId },
          { targetType: entityType, targetId: entityId },
        ],
      },
    });

    return { deleted: result.count };
  },

  /**
   * Get photos linked to an entity
   */
  async getPhotosForEntity(
    userId: number,
    tripId: number,
    entityType: EntityType,
    entityId: number
  ) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    // Get links where photos are linked to this entity
    const links = await prisma.entityLink.findMany({
      where: {
        tripId,
        sourceType: 'PHOTO',
        targetType: entityType,
        targetId: entityId,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Fetch the actual photos
    const photoIds = links.map((l) => l.sourceId);
    if (photoIds.length === 0) return [];

    const photos = await prisma.photo.findMany({
      where: { id: { in: photoIds } },
    });

    // Maintain sort order from links
    const photoMap = new Map(photos.map((p) => [p.id, p]));
    return photoIds.map((id) => photoMap.get(id)).filter((p): p is NonNullable<typeof p> => p !== undefined);
  },

  /**
   * Get all links targeting a specific entity type in a trip
   * Useful for building entity-to-location mappings for timeline
   */
  async getLinksByTargetType(
    userId: number,
    tripId: number,
    targetType: EntityType
  ): Promise<Array<{ sourceType: EntityType; sourceId: number; targetId: number }>> {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const links = await prisma.entityLink.findMany({
      where: {
        tripId,
        targetType,
      },
      select: {
        sourceType: true,
        sourceId: true,
        targetId: true,
      },
    });

    return links.map(link => ({
      sourceType: link.sourceType as EntityType,
      sourceId: link.sourceId,
      targetId: link.targetId,
    }));
  },

  /**
   * Get link summary for all entities in a trip
   * Useful for showing link indicators on entity cards
   */
  async getTripLinkSummary(
    userId: number,
    tripId: number
  ): Promise<Map<string, EntityLinkSummary>> {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    // Safety limit to prevent runaway queries on corrupted data
    const SAFETY_LIMIT = 10000;
    const links = await prisma.entityLink.findMany({
      where: { tripId },
      take: SAFETY_LIMIT,
    });

    if (links.length === SAFETY_LIMIT) {
      logger.warn(`Entity link summary for trip ${tripId} hit the ${SAFETY_LIMIT} row safety limit. Results may be incomplete.`);
    }

    const summaryMap = new Map<string, EntityLinkSummary>();

    for (const link of links) {
      // Count for source entity
      const sourceKey = `${link.sourceType}:${link.sourceId}`;
      let sourceSummary = summaryMap.get(sourceKey);
      if (!sourceSummary) {
        sourceSummary = {
          entityType: link.sourceType as EntityType,
          entityId: link.sourceId,
          linkCounts: {},
          totalLinks: 0,
        };
        summaryMap.set(sourceKey, sourceSummary);
      }
      sourceSummary.linkCounts[link.targetType as EntityType] =
        (sourceSummary.linkCounts[link.targetType as EntityType] || 0) + 1;
      sourceSummary.totalLinks++;

      // Count for target entity
      const targetKey = `${link.targetType}:${link.targetId}`;
      let targetSummary = summaryMap.get(targetKey);
      if (!targetSummary) {
        targetSummary = {
          entityType: link.targetType as EntityType,
          entityId: link.targetId,
          linkCounts: {},
          totalLinks: 0,
        };
        summaryMap.set(targetKey, targetSummary);
      }
      targetSummary.linkCounts[link.sourceType as EntityType] =
        (targetSummary.linkCounts[link.sourceType as EntityType] || 0) + 1;
      targetSummary.totalLinks++;
    }

    return summaryMap;
  },
};

/**
 * Clean up orphaned EntityLinks where the source or target entity no longer exists.
 * This is a safety net for any deletion paths that might miss cleanupEntityLinks().
 *
 * Checks each entity type referenced in EntityLinks and removes links where the
 * referenced entity no longer exists in the database.
 *
 * @param tripId - The trip ID to clean up orphaned links for
 * @returns The number of orphaned EntityLinks that were deleted
 */
export async function cleanupOrphanedEntityLinks(tripId: number): Promise<number> {
  // Get all entity links for this trip
  const links = await prisma.entityLink.findMany({
    where: { tripId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      targetType: true,
      targetId: true,
    },
  });

  if (links.length === 0) return 0;

  // Collect unique entity references to check, grouped by type
  const entityRefs = new Map<string, Set<number>>();
  for (const link of links) {
    const sourceKey = link.sourceType;
    const targetKey = link.targetType;
    if (!entityRefs.has(sourceKey)) entityRefs.set(sourceKey, new Set());
    if (!entityRefs.has(targetKey)) entityRefs.set(targetKey, new Set());
    entityRefs.get(sourceKey)!.add(link.sourceId);
    entityRefs.get(targetKey)!.add(link.targetId);
  }

  // For each entity type, query which IDs actually exist
  const existingIds = new Map<string, Set<number>>();

  for (const [entityType, ids] of entityRefs) {
    const idArray = [...ids];
    let foundIds: number[] = [];

    switch (entityType) {
      case 'PHOTO':
        foundIds = (await prisma.photo.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'LOCATION':
        foundIds = (await prisma.location.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'ACTIVITY':
        foundIds = (await prisma.activity.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'LODGING':
        foundIds = (await prisma.lodging.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'TRANSPORTATION':
        foundIds = (await prisma.transportation.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'JOURNAL_ENTRY':
        foundIds = (await prisma.journalEntry.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      case 'PHOTO_ALBUM':
        foundIds = (await prisma.photoAlbum.findMany({
          where: { id: { in: idArray } },
          select: { id: true },
        })).map(e => e.id);
        break;
      default:
        // Unknown entity type - skip (don't delete, could be a new type)
        logger.warn(`cleanupOrphanedEntityLinks: unknown entity type "${entityType}" - skipping`);
        existingIds.set(entityType, ids); // Treat all as existing to avoid false positives
        continue;
    }

    existingIds.set(entityType, new Set(foundIds));
  }

  // Find links where either source or target entity no longer exists
  const orphanedLinkIds: number[] = [];
  for (const link of links) {
    const sourceExists = existingIds.get(link.sourceType)?.has(link.sourceId) ?? false;
    const targetExists = existingIds.get(link.targetType)?.has(link.targetId) ?? false;

    if (!sourceExists || !targetExists) {
      orphanedLinkIds.push(link.id);
    }
  }

  if (orphanedLinkIds.length === 0) return 0;

  // Delete orphaned links
  const result = await prisma.entityLink.deleteMany({
    where: { id: { in: orphanedLinkIds } },
  });

  logger.info(`cleanupOrphanedEntityLinks: removed ${result.count} orphaned entity links for trip ${tripId}`);

  return result.count;
}
