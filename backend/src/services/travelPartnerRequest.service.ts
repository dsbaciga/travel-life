import prisma from '../config/database';
import { AppError } from '../errors/errors';
import logger from '../config/logger';
import { toSafePermissionLevel } from './_shared/tripPermissions';
import { getUserPreferences } from './_shared/userSettings';
import {
  TravelPartnerRequestStatusValues,
  type SendTravelPartnerRequestInput,
  type AcceptTravelPartnerRequestInput,
} from '../types/travelPartnerRequest.types';

/**
 * Travel partner requests — the consent half of the travel-partner feature.
 *
 * A travel partnership makes every new trip either user creates auto-shared with
 * the other as a collaborator (see trip.service.ts `createTrip`). That is a real
 * grant of access to lodging confirmations, expenses, journal entries and photos,
 * so it must be agreed to by both sides.
 *
 * `user.service.updateTravelPartnerSettings` therefore writes ONLY the caller's own
 * `travelPartnerId` (see the SECURITY note there — writing it bidirectionally used to
 * be a privilege-escalation primitive). This service supplies the missing half: a
 * request the recipient must accept, and `acceptRequest` is the ONE place allowed to
 * write both users' rows, precisely because the recipient consented by calling it.
 *
 * Modelled on collaboration.service / userInvitation.service, minus the token and
 * expiry: the recipient is an existing account responding from inside the app, so
 * there is no emailed accept-link to secure or age out.
 */

/**
 * Deliberately vague, in the style of userInvitation.service: the request is
 * addressed by numeric user id, so a distinct "no such user" message would turn
 * this endpoint into an id-enumeration oracle. Callers reach real ids through
 * GET /api/users/search, which is rate limited and needs 3+ characters.
 */
const GENERIC_SEND_FAILURE = 'Unable to send a travel partner request to that user';

/** The public projection of a user on a request. Deliberately excludes email. */
const requestUserSelect = {
  id: true,
  username: true,
  avatarUrl: true,
} as const;

const requestInclude = {
  requester: { select: requestUserSelect },
  recipient: { select: requestUserSelect },
} as const;

/** The transaction client shape the back-share helper needs. */
type ShareTransactionClient = {
  trip: {
    findMany: (args: {
      where: { userId: number; excludeFromAutoShare: boolean };
      select: { id: true };
    }) => Promise<Array<{ id: number }>>;
  };
  tripCollaborator: {
    createMany: (args: {
      data: Array<{ tripId: number; userId: number; permissionLevel: string }>;
      skipDuplicates: boolean;
    }) => Promise<{ count: number }>;
  };
};

/**
 * Back-share `ownerId`'s EXISTING trips with `granteeId`.
 *
 * The direction is the whole security property: this only ever reads trips where
 * `userId === ownerId`, so a user who opts in gives away their own history and
 * nothing else. It is called once per side, and only for the side that opted in.
 *
 * Two statements regardless of trip count (one SELECT, one bulk INSERT) rather than
 * a query per trip, and `skipDuplicates` makes it idempotent against trips the
 * grantee already collaborates on. Runs inside the accept transaction, so a partial
 * share cannot be left behind.
 *
 * `excludeFromAutoShare` is honoured: that flag is how a trip opts out of partner
 * auto-sharing at creation time, and it should mean the same thing here.
 */
async function backShareExistingTrips(
  tx: ShareTransactionClient,
  ownerId: number,
  granteeId: number,
  ownerDefaultPermission: string | null
): Promise<number> {
  const trips = await tx.trip.findMany({
    where: { userId: ownerId, excludeFromAutoShare: false },
    select: { id: true },
  });

  if (trips.length === 0) {
    return 0;
  }

  // Same permission resolution trip.service.ts uses when auto-adding a partner to a
  // newly created trip, so retroactive and future sharing cannot drift apart.
  const permissionLevel = toSafePermissionLevel(ownerDefaultPermission, 'edit');

  const result = await tx.tripCollaborator.createMany({
    data: trips.map((trip) => ({
      tripId: trip.id,
      userId: granteeId,
      permissionLevel,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export const travelPartnerRequestService = {
  /**
   * Send (or refresh) a travel partner request.
   *
   * Idempotent by construction: `travel_partner_requests` has a unique constraint on
   * (requester_id, recipient_id), so re-sending while one is already pending updates
   * that row instead of creating a duplicate.
   */
  async sendRequest(userId: number, data: SendTravelPartnerRequestInput) {
    // AUTHORIZATION: nobody may request themselves. Also enforced by a CHECK
    // constraint on the table.
    if (data.recipientId === userId) {
      throw new AppError('You cannot send a travel partner request to yourself', 400);
    }

    const [requester, recipient] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, travelPartnerId: true },
      }),
      prisma.user.findUnique({
        where: { id: data.recipientId },
        select: { id: true },
      }),
    ]);

    if (!requester) {
      throw new AppError('User not found', 404);
    }

    if (!recipient) {
      throw new AppError(GENERIC_SEND_FAILURE, 400);
    }

    // A user has a single travel partner. Requesting a second one while the first is
    // still set would, on acceptance, silently sever the existing partnership — the
    // exact behaviour that made the old bidirectional write dangerous. Make the user
    // clear it deliberately instead. Re-requesting the partner they already point at
    // is allowed: that is how an existing one-directional link becomes mutual.
    if (requester.travelPartnerId !== null && requester.travelPartnerId !== data.recipientId) {
      throw new AppError(
        'You already have a travel partner. Remove them before requesting a new one.',
        400
      );
    }

    // If they have already been asked by this user, point them at their inbox rather
    // than creating a crossing pair of requests.
    const reverseRequest = await prisma.travelPartnerRequest.findUnique({
      where: {
        requesterId_recipientId: {
          requesterId: data.recipientId,
          recipientId: userId,
        },
      },
      select: { status: true },
    });

    if (reverseRequest?.status === TravelPartnerRequestStatusValues.PENDING) {
      throw new AppError(
        'That user has already sent you a travel partner request — accept it instead',
        400
      );
    }

    // Upsert on the unique pair. A previously declined request is revived in place;
    // a still-pending one is simply refreshed. Either way there is never more than
    // one pending request between the same two users in the same direction.
    const request = await prisma.travelPartnerRequest.upsert({
      where: {
        requesterId_recipientId: {
          requesterId: userId,
          recipientId: data.recipientId,
        },
      },
      create: {
        requesterId: userId,
        recipientId: data.recipientId,
        message: data.message || null,
        shareExistingTrips: data.shareExistingTrips ?? false,
      },
      update: {
        status: TravelPartnerRequestStatusValues.PENDING,
        message: data.message || null,
        shareExistingTrips: data.shareExistingTrips ?? false,
        respondedAt: null,
      },
      include: requestInclude,
    });

    logger.info('Travel partner request sent', {
      requestId: request.id,
      requesterId: userId,
      recipientId: data.recipientId,
    });

    return request;
  },

  /**
   * List the caller's pending requests, in both directions.
   *
   * Scoped to the caller on both queries — there is no way to read someone else's.
   */
  async getRequests(userId: number) {
    const [incoming, outgoing] = await Promise.all([
      prisma.travelPartnerRequest.findMany({
        where: {
          recipientId: userId,
          status: TravelPartnerRequestStatusValues.PENDING,
        },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.travelPartnerRequest.findMany({
        where: {
          requesterId: userId,
          status: TravelPartnerRequestStatusValues.PENDING,
        },
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { incoming, outgoing };
  },

  /**
   * Accept a request, establishing the partnership on BOTH users.
   *
   * This is the only code path that writes another user's `travelPartnerId`, and it
   * is legitimate because:
   *   - the requester consented when they sent the request, and
   *   - the recipient consents by calling this, and only the recipient can (the
   *     lookup below is scoped to `recipientId: userId`).
   *
   * Existing trips are shared only where a side explicitly opted in, and each side's
   * opt-in only gives away that side's OWN trips:
   *   - `request.shareExistingTrips` — the requester's choice, made at send time.
   *   - `options.shareExistingTrips` — the recipient's choice, made right here.
   * So neither party can retroactively grant themselves access to the other's
   * history, which is the property that made the original bug a bug.
   */
  async acceptRequest(
    userId: number,
    requestId: number,
    options: AcceptTravelPartnerRequestInput = {}
  ) {
    return await prisma.$transaction(
      async (tx) => {
        // AUTHORIZATION: scoping the lookup to recipientId means a requester (or any
        // third party) accepting their own request finds nothing.
        const request = await tx.travelPartnerRequest.findFirst({
          where: {
            id: requestId,
            recipientId: userId,
            status: TravelPartnerRequestStatusValues.PENDING,
          },
        });

        if (!request) {
          throw new AppError('Travel partner request not found or already responded to', 404);
        }

        // Lock both rows in ascending id order to avoid deadlocks, mirroring
        // user.service.updateTravelPartnerSettings.
        const lockedIds = [request.requesterId, request.recipientId].sort((a, b) => a - b);
        const locked = new Map<
          number,
          { travelPartnerId: number | null; defaultPartnerPermission: string | null }
        >();

        for (const id of lockedIds) {
          const [row] = await tx.$queryRaw<
            Array<{
              id: number;
              travel_partner_id: number | null;
            }>
          >`
            SELECT id, travel_partner_id
            FROM users WHERE id = ${id} FOR UPDATE
          `;
          if (!row) {
            throw new AppError('User not found', 404);
          }
          // The permission level lives in user_preferences; the users row lock above is what serialises this.
          const prefs = await getUserPreferences(row.id, tx);
          locked.set(row.id, {
            travelPartnerId: row.travel_partner_id,
            defaultPartnerPermission: prefs.defaultPartnerPermission,
          });
        }

        // The requester consented to partnering with THIS user. If they have since
        // acquired a different partner, accepting would sever that partnership
        // without their consent — refuse rather than overwrite.
        const requesterPartnerId = locked.get(request.requesterId)?.travelPartnerId ?? null;
        if (requesterPartnerId !== null && requesterPartnerId !== request.recipientId) {
          throw new AppError(
            'This request can no longer be accepted because that user now has a different travel partner',
            409
          );
        }

        // Same rule for the accepting side. Overwriting the recipient's existing
        // partnership would leave the ex-partner's `travelPartnerId` still
        // pointing here — a one-way link whose new trips keep auto-sharing to
        // someone who is no longer their partner. Partnerships are severed
        // deliberately via travel partner settings, not as a side effect of
        // accepting an unrelated request.
        const recipientPartnerId = locked.get(request.recipientId)?.travelPartnerId ?? null;
        if (recipientPartnerId !== null && recipientPartnerId !== request.requesterId) {
          throw new AppError(
            'You already have a travel partner. Remove your current partner before accepting this request.',
            409
          );
        }

        // The consented bidirectional write. Each user keeps their own
        // `defaultPartnerPermission` — it governs their own trips and is theirs alone.
        await tx.user.update({
          where: { id: request.recipientId },
          data: { travelPartnerId: request.requesterId },
        });

        await tx.user.update({
          where: { id: request.requesterId },
          data: { travelPartnerId: request.recipientId },
        });

        await tx.travelPartnerRequest.update({
          where: { id: request.id },
          data: {
            status: TravelPartnerRequestStatusValues.ACCEPTED,
            respondedAt: new Date(),
          },
        });

        // Retroactive sharing — each side independently, each giving away only its own
        // trips. Still inside the transaction, so it cannot half-apply.
        let receivedTripCount = 0;
        if (request.shareExistingTrips) {
          receivedTripCount = await backShareExistingTrips(
            tx,
            request.requesterId,
            request.recipientId,
            locked.get(request.requesterId)?.defaultPartnerPermission ?? null
          );
        }

        let sharedTripCount = 0;
        if (options.shareExistingTrips === true) {
          sharedTripCount = await backShareExistingTrips(
            tx,
            request.recipientId,
            request.requesterId,
            locked.get(request.recipientId)?.defaultPartnerPermission ?? null
          );
        }

        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          select: {
            travelPartnerId: true,
            travelPartner: {
              select: {
                id: true,
                username: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        });

        const updatedPrefs = await getUserPreferences(userId, tx);

        logger.info('Travel partner request accepted', {
          requestId: request.id,
          requesterId: request.requesterId,
          recipientId: request.recipientId,
          sharedTripCount,
          receivedTripCount,
        });

        return {
          travelPartnerId: updatedUser?.travelPartnerId ?? null,
          defaultPartnerPermission: updatedPrefs.defaultPartnerPermission,
          travelPartner: updatedUser?.travelPartner ?? null,
          /** Existing trips of the accepting user now shared with the requester. */
          sharedTripCount,
          /** Existing trips of the requester now shared with the accepting user. */
          receivedTripCount,
        };
      },
      { isolationLevel: 'Serializable' }
    );
  },

  /**
   * Decline a request. AUTHORIZATION: recipient only — the lookup is scoped to
   * `recipientId: userId`, so a requester declining their own request gets a 404.
   */
  async declineRequest(userId: number, requestId: number) {
    const request = await prisma.travelPartnerRequest.findFirst({
      where: {
        id: requestId,
        recipientId: userId,
        status: TravelPartnerRequestStatusValues.PENDING,
      },
    });

    if (!request) {
      throw new AppError('Travel partner request not found or already responded to', 404);
    }

    await prisma.travelPartnerRequest.update({
      where: { id: request.id },
      data: {
        status: TravelPartnerRequestStatusValues.DECLINED,
        respondedAt: new Date(),
      },
    });

    logger.info('Travel partner request declined', {
      requestId: request.id,
      recipientId: userId,
    });

    return { message: 'Travel partner request declined' };
  },

  /**
   * Cancel a request you sent. AUTHORIZATION: requester only — the lookup is scoped
   * to `requesterId: userId`, so a recipient cannot cancel (they decline instead).
   */
  async cancelRequest(userId: number, requestId: number) {
    const request = await prisma.travelPartnerRequest.findFirst({
      where: {
        id: requestId,
        requesterId: userId,
        status: TravelPartnerRequestStatusValues.PENDING,
      },
    });

    if (!request) {
      throw new AppError('Travel partner request not found or already responded to', 404);
    }

    await prisma.travelPartnerRequest.delete({
      where: { id: request.id },
    });

    logger.info('Travel partner request cancelled', {
      requestId: request.id,
      requesterId: userId,
    });

    return { message: 'Travel partner request cancelled' };
  },
};

export default travelPartnerRequestService;
