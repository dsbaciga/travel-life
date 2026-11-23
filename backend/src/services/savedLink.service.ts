import prisma from '../config/database';
import logger from '../config/logger';
import { AppError } from '../errors/errors';
import {
  BulkDeleteSavedLinksInput,
  CreateSavedLinkInput,
  ListSavedLinksQuery,
  UpdateSavedLinkInput,
} from '../types/savedLink.types';
import { verifyTripAccessWithPermission } from '../services/_shared/tripAccess';
import { cleanupEntityLinks } from '../services/_shared/entityLinkCleanup';
import linkMetadataService, { stripTrackingParams } from './linkMetadata.service';
import { Prisma } from '@prisma/client';

/**
 * Saved links are USER-scoped, not trip-scoped: a link exists in the inbox
 * before it is assigned to a trip. Ownership is therefore checked against
 * `userId`, with an ADDITIONAL trip-permission check whenever a link is
 * associated with a trip.
 */
async function findOwnedLink(userId: number, linkId: number) {
  const link = await prisma.savedLink.findFirst({
    where: { id: linkId, userId },
  });

  if (!link) {
    throw new AppError("We couldn't find that saved link.", 404);
  }

  return link;
}

class SavedLinkService {
  /**
   * Scrapes metadata and writes it onto the link.
   *
   * Deliberately swallows everything: metadata is a nicety, and a link whose
   * page is dead or unparseable is still worth keeping. Callers invoke this
   * fire-and-forget so link creation is never blocked on a slow remote host.
   */
  async populateMetadata(linkId: number): Promise<void> {
    const link = await prisma.savedLink.findUnique({ where: { id: linkId } });
    if (!link) return;

    try {
      const metadata = await linkMetadataService.fetch(link.url);

      if (!metadata) {
        await prisma.savedLink.update({
          where: { id: linkId },
          data: { metadataStatus: 'FAILED', metadataFetchedAt: new Date() },
        });
        return;
      }

      await prisma.savedLink.update({
        where: { id: linkId },
        data: {
          // A user-supplied title always wins over the scraped one.
          title: link.title ?? metadata.title,
          description: metadata.description,
          siteName: metadata.siteName,
          imageUrl: metadata.imageUrl,
          // Replace the submitted URL with where it actually landed, so
          // click-wrappers and shorteners resolve to the real page.
          url: metadata.resolvedUrl,
          metadataStatus: 'FETCHED',
          metadataFetchedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn('[SavedLink] Metadata population failed', {
        linkId,
        error: err instanceof Error ? err.message : String(err),
      });
      await prisma.savedLink
        .update({
          where: { id: linkId },
          data: { metadataStatus: 'FAILED', metadataFetchedAt: new Date() },
        })
        .catch(() => {
          /* row may have been deleted mid-fetch */
        });
    }
  }

  async createSavedLink(userId: number, data: CreateSavedLinkInput) {
    if (data.tripId != null) {
      await verifyTripAccessWithPermission(userId, data.tripId, 'edit');
    }

    // Strip analytics/ad-click params before anything else sees the URL, so the
    // stored value, the outbound fetch, and any future dedupe all agree.
    const url = stripTrackingParams(data.url);

    // Reject internal/private URLs up front so they never reach the fetcher.
    await linkMetadataService.assertFetchable(url);

    const link = await prisma.savedLink.create({
      data: {
        userId,
        tripId: data.tripId ?? null,
        url,
        title: data.title || null,
        notes: data.notes || null,
        source: 'MANUAL',
        metadataStatus: 'PENDING',
      },
    });

    // Fire-and-forget: the row is returned immediately as PENDING and the
    // client refetches once metadata lands (see pdfImport.service.ts:132-134).
    this.populateMetadata(link.id).catch((err) =>
      logger.error('[SavedLink] Background metadata fetch failed', err)
    );

    return link;
  }

  /**
   * Creates a link captured from a forwarded email.
   *
   * Separate from `createSavedLink` rather than widening its signature: the
   * email path has no trip (so no permission check), always sets source EMAIL,
   * and carries ingest provenance. Returns null instead of throwing when the
   * URL fails SSRF validation, because one bad URL in a message must not abort
   * the rest of the batch.
   */
  async createFromEmail(
    userId: number,
    rawUrl: string,
    emailIngestId: number
  ) {
    const url = stripTrackingParams(rawUrl);

    try {
      await linkMetadataService.assertFetchable(url);
    } catch (err) {
      logger.warn('[SavedLink] Skipping emailed URL that failed validation', {
        emailIngestId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const link = await prisma.savedLink.create({
      data: {
        userId,
        tripId: null, // Emailed links always land in the inbox for triage.
        url,
        source: 'EMAIL',
        metadataStatus: 'PENDING',
        emailIngestId,
      },
    });

    this.populateMetadata(link.id).catch((err) =>
      logger.error('[SavedLink] Background metadata fetch failed', err)
    );

    return link;
  }

  /**
   * Lists the user's links. `tripId: 'none'` selects the inbox (unassigned);
   * a numeric `tripId` selects one trip; omitted returns everything.
   */
  async getSavedLinks(userId: number, query: ListSavedLinksQuery) {
    const where: Prisma.SavedLinkWhereInput = { userId };

    if (query.tripId === 'none') {
      where.tripId = null;
    } else if (typeof query.tripId === 'number') {
      await verifyTripAccessWithPermission(userId, query.tripId, 'view');
      where.tripId = query.tripId;
    }

    return prisma.savedLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Lists links for a trip. Unlike `getSavedLinks`, this is permission-scoped
   * to the trip rather than the owner, so collaborators see them too.
   */
  async getSavedLinksByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    return prisma.savedLink.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSavedLinkById(userId: number, linkId: number) {
    return findOwnedLink(userId, linkId);
  }

  async updateSavedLink(
    userId: number,
    linkId: number,
    data: UpdateSavedLinkInput
  ) {
    const existing = await findOwnedLink(userId, linkId);

    const updateData: Prisma.SavedLinkUncheckedUpdateInput = {};
    let urlChanged = false;

    const normalizedUrl =
      data.url !== undefined ? stripTrackingParams(data.url) : undefined;

    if (normalizedUrl !== undefined && normalizedUrl !== existing.url) {
      await linkMetadataService.assertFetchable(normalizedUrl);
      updateData.url = normalizedUrl;
      // Stale metadata must not outlive the URL it described.
      updateData.metadataStatus = 'PENDING';
      updateData.title = null;
      updateData.description = null;
      updateData.siteName = null;
      updateData.imageUrl = null;
      urlChanged = true;
    }

    if (data.tripId !== undefined) {
      if (data.tripId === null) {
        // Returning a link to the inbox drops any entity links it had, since
        // EntityLink rows are hard-bound to a trip.
        if (existing.tripId !== null) {
          await cleanupEntityLinks(existing.tripId, 'SAVED_LINK', linkId);
        }
        updateData.tripId = null;
      } else {
        await verifyTripAccessWithPermission(userId, data.tripId, 'edit');
        if (existing.tripId !== null && existing.tripId !== data.tripId) {
          await cleanupEntityLinks(existing.tripId, 'SAVED_LINK', linkId);
        }
        updateData.tripId = data.tripId;
      }
    }

    // A user-set title survives a URL change; only clear it if they didn't set one.
    if (data.title !== undefined) {
      updateData.title = data.title || null;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes || null;
    }

    const updated = await prisma.savedLink.update({
      where: { id: linkId },
      data: updateData,
    });

    if (urlChanged) {
      this.populateMetadata(linkId).catch((err) =>
        logger.error('[SavedLink] Background metadata refetch failed', err)
      );
    }

    return updated;
  }

  async deleteSavedLink(userId: number, linkId: number) {
    const link = await findOwnedLink(userId, linkId);

    if (link.tripId !== null) {
      await cleanupEntityLinks(link.tripId, 'SAVED_LINK', linkId);
    }

    await prisma.savedLink.delete({ where: { id: linkId } });

    return { message: 'Saved link deleted successfully' };
  }

  /**
   * Deletes several links in one call.
   *
   * Ids are owner-scoped, so a selection may mix inbox links with links from
   * different trips. Deleting is all-or-nothing: an id the user doesn't own
   * 404s the whole request rather than silently deleting the rest.
   */
  async bulkDeleteSavedLinks(userId: number, data: BulkDeleteSavedLinksInput) {
    const ids = [...new Set(data.ids)];

    const links = await prisma.savedLink.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, tripId: true },
    });

    if (links.length !== ids.length) {
      throw new AppError("We couldn't find some of those saved links.", 404);
    }

    // EntityLink rows are hard-bound to a trip, so only assigned links can
    // have any.
    const assigned = links.filter(
      (link): link is { id: number; tripId: number } => link.tripId !== null
    );

    const deletedCount = await prisma.$transaction(async (tx) => {
      for (const link of assigned) {
        await cleanupEntityLinks(link.tripId, 'SAVED_LINK', link.id, tx);
      }

      const result = await tx.savedLink.deleteMany({
        where: { id: { in: ids }, userId },
      });

      return result.count;
    });

    return { success: true, deletedCount };
  }

  /**
   * Empties the inbox — every link not assigned to a trip.
   *
   * No entity-link cleanup is needed: an unassigned link has no trip, and
   * EntityLink rows cannot exist without one.
   */
  async deleteUnassignedSavedLinks(userId: number) {
    const result = await prisma.savedLink.deleteMany({
      where: { userId, tripId: null },
    });

    return { success: true, deletedCount: result.count };
  }

  /** Re-scrapes metadata on demand, e.g. after a page has been updated. */
  async refreshMetadata(userId: number, linkId: number) {
    await findOwnedLink(userId, linkId);

    await prisma.savedLink.update({
      where: { id: linkId },
      data: { metadataStatus: 'PENDING' },
    });

    await this.populateMetadata(linkId);

    return prisma.savedLink.findUnique({ where: { id: linkId } });
  }

  /** Count of unassigned links, for the inbox badge. */
  async getInboxCount(userId: number) {
    const count = await prisma.savedLink.count({
      where: { userId, tripId: null },
    });
    return { count };
  }
}

export default new SavedLinkService();
