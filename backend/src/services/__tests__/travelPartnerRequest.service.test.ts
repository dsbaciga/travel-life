/**
 * Travel Partner Request Service Tests
 *
 * These focus on the AUTHORIZATION and consent rules, because this feature exists
 * to close a privilege-escalation hole (BUGS.md: "Any user can force a travel
 * partner link and gain edit access to a victim's future trips").
 *
 * Test cases:
 * - TPR-001: Send request
 * - TPR-002: Send request - cannot request yourself
 * - TPR-003: Send request - re-sending does not create a duplicate pending request
 * - TPR-004: Send request - generic failure for an unknown recipient (no id enumeration)
 * - TPR-005: Send request - blocked while the caller already has a different partner
 * - TPR-006: Send request - blocked when the other user already asked first
 * - TPR-007: List requests - scoped to the caller, split incoming/outgoing
 * - TPR-008: Accept - establishes the partnership on BOTH users
 * - TPR-009: Accept - only the recipient may accept (requester cannot)
 * - TPR-010: Accept - refuses if the requester now has a different partner
 * - TPR-011: Decline - only the recipient may decline
 * - TPR-012: Cancel - only the requester may cancel
 * - TPR-013: Accept - opted-in side back-shares its OWN existing trips
 * - TPR-014: Accept - a side that did not opt in shares nothing
 * - TPR-015: Accept - back-sharing is idempotent (no duplicate collaborator rows)
 * - TPR-016: Accept - opting in shares ONLY your own trips (the security case)
 */

// Mock the database config
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  trip: {
    findMany: jest.fn(),
  },
  tripCollaborator: {
    createMany: jest.fn(),
  },
  travelPartnerRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { travelPartnerRequestService } from '../travelPartnerRequest.service';
import { TravelPartnerRequestStatusValues } from '../../types/travelPartnerRequest.types';
import { AppError } from '../../errors/errors';

/** Row shape returned by the `SELECT ... FOR UPDATE` lock query. */
interface LockedUserRow {
  id: number;
  travel_partner_id: number | null;
}

/**
 * The permission level lives in user_preferences, not on the locked users row. Tests declare it next
 * to the lock rows (`default_partner_permission`); the preferences lookup answers from this map.
 */
const permissionByUser = new Map<number, string | null>();

/** Args the service passes to `trip.findMany` when collecting trips to back-share. */
interface TripFindManyArgs {
  where: { userId: number; excludeFromAutoShare: boolean };
}

/** Args the service passes to `tripCollaborator.createMany`. */
interface CollaboratorCreateManyArgs {
  data: Array<{ tripId: number; userId: number; permissionLevel: string }>;
  skipDuplicates: boolean;
}

const REQUESTER_ID = 1;
const RECIPIENT_ID = 2;
const OTHER_USER_ID = 3;
const REQUEST_ID = 10;

const createMockRequest = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  requesterId: REQUESTER_ID,
  recipientId: RECIPIENT_ID,
  status: TravelPartnerRequestStatusValues.PENDING,
  message: null,
  shareExistingTrips: false,
  respondedAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  requester: { id: REQUESTER_ID, username: 'requester', avatarUrl: null },
  recipient: { id: RECIPIENT_ID, username: 'recipient', avatarUrl: null },
  ...overrides,
});

/**
 * Make `$queryRaw` behave like the row-lock query: return the locked row for each
 * user id it is asked about, in whatever order the service asks.
 */
const mockLockedUsers = (
  rows: Array<LockedUserRow & { default_partner_permission?: string | null }>
) => {
  permissionByUser.clear();
  for (const row of rows) {
    permissionByUser.set(row.id, row.default_partner_permission === undefined ? 'edit' : row.default_partner_permission);
  }
  const remaining: LockedUserRow[] = rows.map((row) => ({
    id: row.id,
    travel_partner_id: row.travel_partner_id,
  }));
  mockPrisma.$queryRaw.mockImplementation(async () => {
    const next = remaining.shift();
    return next ? [next] : [];
  });
};

/**
 * Stub the reads/writes `acceptRequest` performs after the partnership is written,
 * so the assertions can focus on WHOSE trips get shared.
 */
const mockAcceptTail = (settingsOverrides: Record<string, unknown> = {}) => {
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.travelPartnerRequest.update.mockResolvedValue(createMockRequest());
  mockPrisma.tripCollaborator.createMany.mockImplementation(
    async (args: CollaboratorCreateManyArgs) => ({ count: args.data.length })
  );
  mockPrisma.user.findUnique.mockResolvedValue({
    travelPartnerId: REQUESTER_ID,
    defaultPartnerPermission: 'edit',
    travelPartner: null,
    ...settingsOverrides,
  });
};

/** All `trip.findMany` calls made during an accept, in order. */
const tripFindManyCalls = (): TripFindManyArgs[] =>
  (mockPrisma.trip.findMany.mock.calls as Array<[TripFindManyArgs]>).map(([args]) => args);

/** All `tripCollaborator.createMany` calls made during an accept, in order. */
const collaboratorCreateManyCalls = (): CollaboratorCreateManyArgs[] =>
  (mockPrisma.tripCollaborator.createMany.mock.calls as Array<[CollaboratorCreateManyArgs]>).map(
    ([args]) => args
  );

/** Assert a rejection is an AppError and return it narrowed, without casting. */
const expectAppErrorFrom = async (
  promise: Promise<unknown>,
  expected: { message?: string; statusCode?: number } = {}
): Promise<AppError> => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof AppError)) {
    throw new Error(`Expected an AppError to be thrown, but received: ${String(caught)}`);
  }

  if (expected.message !== undefined) {
    expect(caught.message).toBe(expected.message);
  }
  if (expected.statusCode !== undefined) {
    expect(caught.statusCode).toBe(expected.statusCode);
  }

  return caught;
};

describe('TravelPartnerRequestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permissionByUser.clear();
    mockPrisma.userPreferences.findUnique.mockImplementation(async ({ where }: { where: { userId: number } }) => ({
      userId: where.userId,
      defaultPartnerPermission: permissionByUser.has(where.userId) ? permissionByUser.get(where.userId) : 'edit',
    }));
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma)
    );
  });

  // ============================================================
  // TPR-001: Send request
  // ============================================================
  describe('TPR-001: Send request', () => {
    it('should create a pending request without touching either user row', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(createMockRequest());

      const result = await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
        message: 'Lets travel together',
      });

      expect(result.status).toBe(TravelPartnerRequestStatusValues.PENDING);
      expect(mockPrisma.travelPartnerRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            requesterId_recipientId: {
              requesterId: REQUESTER_ID,
              recipientId: RECIPIENT_ID,
            },
          },
        })
      );

      // The whole point: sending grants nothing until the recipient accepts.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.tripCollaborator.createMany).not.toHaveBeenCalled();
    });

    it('should persist the requester shareExistingTrips opt-in on the row', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );

      await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
        shareExistingTrips: true,
      });

      const upsertArgs = mockPrisma.travelPartnerRequest.upsert.mock.calls[0][0] as {
        create: { shareExistingTrips: boolean };
        update: { shareExistingTrips: boolean };
      };
      expect(upsertArgs.create.shareExistingTrips).toBe(true);
      // A re-send must be able to turn the choice back off, not silently keep it on.
      expect(upsertArgs.update.shareExistingTrips).toBe(true);

      // Still nothing shared yet — the choice only takes effect on accept.
      expect(mockPrisma.tripCollaborator.createMany).not.toHaveBeenCalled();
    });

    it('should default shareExistingTrips to false when not requested', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(createMockRequest());

      await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
        shareExistingTrips: false,
      });

      const upsertArgs = mockPrisma.travelPartnerRequest.upsert.mock.calls[0][0] as {
        create: { shareExistingTrips: boolean };
      };
      expect(upsertArgs.create.shareExistingTrips).toBe(false);
    });
  });

  // ============================================================
  // TPR-002: Cannot request yourself
  // ============================================================
  describe('TPR-002: Send request - no self-request', () => {
    it('should reject a request addressed to the caller', async () => {
      await expectAppErrorFrom(
        travelPartnerRequestService.sendRequest(REQUESTER_ID, { recipientId: REQUESTER_ID }),
        {
          message: 'You cannot send a travel partner request to yourself',
          statusCode: 400,
        }
      );

      expect(mockPrisma.travelPartnerRequest.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TPR-003: No duplicate pending requests
  // ============================================================
  describe('TPR-003: Send request - no duplicate pending requests', () => {
    it('should upsert onto the unique (requester, recipient) pair rather than create', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(createMockRequest());

      await travelPartnerRequestService.sendRequest(REQUESTER_ID, { recipientId: RECIPIENT_ID });

      const upsertArgs = mockPrisma.travelPartnerRequest.upsert.mock.calls[0][0] as {
        update: { status: string; respondedAt: Date | null };
      };

      // Re-sending refreshes the existing row back to PENDING; there is no `create`
      // path that could produce a second pending row for the same pair.
      expect(upsertArgs.update.status).toBe(TravelPartnerRequestStatusValues.PENDING);
      expect(upsertArgs.update.respondedAt).toBeNull();
    });

    it('should still return a single pending request when re-sent', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID })
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(createMockRequest());

      const first = await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
      });
      const second = await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
      });

      expect(second.id).toBe(first.id);
      expect(mockPrisma.travelPartnerRequest.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // TPR-004: Generic failure for unknown recipients
  // ============================================================
  describe('TPR-004: Send request - unknown recipient', () => {
    it('should fail generically so user ids cannot be enumerated', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce(null);

      await expectAppErrorFrom(
        travelPartnerRequestService.sendRequest(REQUESTER_ID, { recipientId: 9999 }),
        {
          message: 'Unable to send a travel partner request to that user',
          statusCode: 400,
        }
      );
    });
  });

  // ============================================================
  // TPR-005: Blocked while the caller already has a different partner
  // ============================================================
  describe('TPR-005: Send request - caller already partnered', () => {
    it('should refuse when the caller already has a different travel partner', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: OTHER_USER_ID })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });

      await expectAppErrorFrom(
        travelPartnerRequestService.sendRequest(REQUESTER_ID, { recipientId: RECIPIENT_ID }),
        {
          message: 'You already have a travel partner. Remove them before requesting a new one.',
          statusCode: 400,
        }
      );

      expect(mockPrisma.travelPartnerRequest.upsert).not.toHaveBeenCalled();
    });

    it('should allow requesting the partner the caller already points at (making it mutual)', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: RECIPIENT_ID })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue(null);
      mockPrisma.travelPartnerRequest.upsert.mockResolvedValue(createMockRequest());

      const result = await travelPartnerRequestService.sendRequest(REQUESTER_ID, {
        recipientId: RECIPIENT_ID,
      });

      expect(result.id).toBe(REQUEST_ID);
    });
  });

  // ============================================================
  // TPR-006: Crossing requests
  // ============================================================
  describe('TPR-006: Send request - the other user already asked', () => {
    it('should point the caller at their inbox instead of creating a crossing pair', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: REQUESTER_ID, travelPartnerId: null })
        .mockResolvedValueOnce({ id: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findUnique.mockResolvedValue({
        status: TravelPartnerRequestStatusValues.PENDING,
      });

      await expectAppErrorFrom(
        travelPartnerRequestService.sendRequest(REQUESTER_ID, { recipientId: RECIPIENT_ID }),
        {
          message:
            'That user has already sent you a travel partner request — accept it instead',
          statusCode: 400,
        }
      );

      expect(mockPrisma.travelPartnerRequest.upsert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TPR-007: List requests
  // ============================================================
  describe('TPR-007: List requests', () => {
    it('should return pending incoming and outgoing requests scoped to the caller', async () => {
      const incoming = createMockRequest({ id: 11 });
      const outgoing = createMockRequest({ id: 12, requesterId: RECIPIENT_ID });
      mockPrisma.travelPartnerRequest.findMany
        .mockResolvedValueOnce([incoming])
        .mockResolvedValueOnce([outgoing]);

      const result = await travelPartnerRequestService.getRequests(RECIPIENT_ID);

      expect(result.incoming).toEqual([incoming]);
      expect(result.outgoing).toEqual([outgoing]);

      const [incomingCall, outgoingCall] = mockPrisma.travelPartnerRequest.findMany.mock.calls as [
        [{ where: Record<string, unknown> }],
        [{ where: Record<string, unknown> }],
      ];
      expect(incomingCall[0].where).toMatchObject({
        recipientId: RECIPIENT_ID,
        status: TravelPartnerRequestStatusValues.PENDING,
      });
      expect(outgoingCall[0].where).toMatchObject({
        requesterId: RECIPIENT_ID,
        status: TravelPartnerRequestStatusValues.PENDING,
      });
    });
  });

  // ============================================================
  // TPR-008: Accept establishes both sides
  // ============================================================
  describe('TPR-008: Accept request', () => {
    it('should write travelPartnerId on BOTH users and mark the request accepted', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(createMockRequest());
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.travelPartnerRequest.update.mockResolvedValue(
        createMockRequest({ status: TravelPartnerRequestStatusValues.ACCEPTED })
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        travelPartnerId: REQUESTER_ID,
        defaultPartnerPermission: 'edit',
        travelPartner: {
          id: REQUESTER_ID,
          username: 'requester',
          email: 'requester@example.com',
          avatarUrl: null,
        },
      });

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: { travelPartnerId: REQUESTER_ID },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: REQUESTER_ID },
        data: { travelPartnerId: RECIPIENT_ID },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);

      expect(mockPrisma.travelPartnerRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            status: TravelPartnerRequestStatusValues.ACCEPTED,
          }),
        })
      );

      expect(result.travelPartnerId).toBe(REQUESTER_ID);
    });

    it('should not overwrite either user defaultPartnerPermission', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(createMockRequest());
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.travelPartnerRequest.update.mockResolvedValue(createMockRequest());
      mockPrisma.user.findUnique.mockResolvedValue({
        travelPartnerId: REQUESTER_ID,
        defaultPartnerPermission: 'view',
        travelPartner: null,
      });

      await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID);

      const updateCalls = mockPrisma.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      for (const [args] of updateCalls) {
        expect(args.data).not.toHaveProperty('defaultPartnerPermission');
      }
    });
  });

  // ============================================================
  // TPR-013: Opted-in side back-shares its own existing trips
  // ============================================================
  describe('TPR-013: Accept request - retroactive sharing when opted in', () => {
    it('should share the requester existing trips when THEY opted in at send time', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null, default_partner_permission: 'view' },
        { id: RECIPIENT_ID, travel_partner_id: null, default_partner_permission: 'admin' },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: false,
      });

      // Exactly one side shared, and it read only the REQUESTER's trips.
      const findManyCalls = tripFindManyCalls();
      expect(findManyCalls).toHaveLength(1);
      expect(findManyCalls[0].where).toEqual({
        userId: REQUESTER_ID,
        excludeFromAutoShare: false,
      });

      // Granted to the recipient, at the trip OWNER's (requester's) permission level.
      const createManyCalls = collaboratorCreateManyCalls();
      expect(createManyCalls).toHaveLength(1);
      expect(createManyCalls[0].data).toEqual([
        { tripId: 101, userId: RECIPIENT_ID, permissionLevel: 'view' },
        { tripId: 102, userId: RECIPIENT_ID, permissionLevel: 'view' },
      ]);

      expect(result.receivedTripCount).toBe(2);
      expect(result.sharedTripCount).toBe(0);
    });

    it('should share the recipient existing trips when THEY opt in at accept time', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: false })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null, default_partner_permission: 'view' },
        { id: RECIPIENT_ID, travel_partner_id: null, default_partner_permission: 'admin' },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 201 }]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: true,
      });

      const findManyCalls = tripFindManyCalls();
      expect(findManyCalls).toHaveLength(1);
      expect(findManyCalls[0].where).toEqual({
        userId: RECIPIENT_ID,
        excludeFromAutoShare: false,
      });

      const createManyCalls = collaboratorCreateManyCalls();
      expect(createManyCalls[0].data).toEqual([
        { tripId: 201, userId: REQUESTER_ID, permissionLevel: 'admin' },
      ]);

      expect(result.sharedTripCount).toBe(1);
      expect(result.receivedTripCount).toBe(0);
    });

    it('should share both directions when both sides opted in, each at its own permission', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null, default_partner_permission: 'view' },
        { id: RECIPIENT_ID, travel_partner_id: null, default_partner_permission: 'admin' },
      ]);
      mockPrisma.trip.findMany
        .mockResolvedValueOnce([{ id: 101 }])
        .mockResolvedValueOnce([{ id: 201 }, { id: 202 }]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: true,
      });

      const createManyCalls = collaboratorCreateManyCalls();
      expect(createManyCalls).toHaveLength(2);
      expect(createManyCalls[0].data).toEqual([
        { tripId: 101, userId: RECIPIENT_ID, permissionLevel: 'view' },
      ]);
      expect(createManyCalls[1].data).toEqual([
        { tripId: 201, userId: REQUESTER_ID, permissionLevel: 'admin' },
        { tripId: 202, userId: REQUESTER_ID, permissionLevel: 'admin' },
      ]);

      expect(result.receivedTripCount).toBe(1);
      expect(result.sharedTripCount).toBe(2);
    });

    it('should fall back to edit when an owner has no valid defaultPartnerPermission', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null, default_partner_permission: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 101 }]);
      mockAcceptTail();

      await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: false,
      });

      expect(collaboratorCreateManyCalls()[0].data[0].permissionLevel).toBe('edit');
    });
  });

  // ============================================================
  // TPR-014: A side that did not opt in shares nothing
  // ============================================================
  describe('TPR-014: Accept request - no retroactive sharing by default', () => {
    it('should not touch existing trips when neither side opted in', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: false })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: false,
      });

      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.tripCollaborator.createMany).not.toHaveBeenCalled();
      expect(result.sharedTripCount).toBe(0);
      expect(result.receivedTripCount).toBe(0);
    });

    it('should default to no sharing when the accept call passes no options at all', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: false })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockAcceptTail();

      await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID);

      expect(mockPrisma.tripCollaborator.createMany).not.toHaveBeenCalled();
    });

    it('should issue no insert when the opted-in side owns no shareable trips', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID);

      expect(mockPrisma.tripCollaborator.createMany).not.toHaveBeenCalled();
      expect(result.receivedTripCount).toBe(0);
    });
  });

  // ============================================================
  // TPR-015: Idempotent — no duplicate collaborator rows
  // ============================================================
  describe('TPR-015: Accept request - back-sharing is idempotent', () => {
    it('should bulk insert with skipDuplicates rather than blind per-trip inserts', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 101 }, { id: 102 }, { id: 103 }]);
      // Simulate two of the three already having a collaborator row.
      mockPrisma.tripCollaborator.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.travelPartnerRequest.update.mockResolvedValue(createMockRequest());
      mockPrisma.user.findUnique.mockResolvedValue({
        travelPartnerId: REQUESTER_ID,
        defaultPartnerPermission: 'edit',
        travelPartner: null,
      });

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID);

      const createManyCalls = collaboratorCreateManyCalls();
      // One statement for all three trips, not one per trip.
      expect(createManyCalls).toHaveLength(1);
      expect(createManyCalls[0].data).toHaveLength(3);
      expect(createManyCalls[0].skipDuplicates).toBe(true);

      // Only the genuinely new row is counted; pre-existing ones are not duplicated.
      expect(result.receivedTripCount).toBe(1);
    });
  });

  // ============================================================
  // TPR-016: Opting in shares ONLY your own trips (security case)
  // ============================================================
  describe('TPR-016: Accept request - opting in never reaches the other side history', () => {
    it('should not grant the recipient anything when only the RECIPIENT opted in', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: false })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 201 }]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: true,
      });

      // The recipient opted in, so their OWN trips went out...
      const findManyCalls = tripFindManyCalls();
      expect(findManyCalls).toHaveLength(1);
      expect(findManyCalls[0].where.userId).toBe(RECIPIENT_ID);

      // ...and crucially the requester's trips were never read, so no collaborator
      // row was created FOR the recipient. Opting in cannot pull the other side's
      // history towards you.
      for (const call of tripFindManyCalls()) {
        expect(call.where.userId).not.toBe(REQUESTER_ID);
      }
      for (const call of collaboratorCreateManyCalls()) {
        for (const row of call.data) {
          expect(row.userId).not.toBe(RECIPIENT_ID);
        }
      }
      expect(result.receivedTripCount).toBe(0);
    });

    it('should not grant the requester anything when only the REQUESTER opted in', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 101 }]);
      mockAcceptTail();

      const result = await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: false,
      });

      // The recipient's trips were never read, and the requester gained nothing.
      for (const call of tripFindManyCalls()) {
        expect(call.where.userId).not.toBe(RECIPIENT_ID);
      }
      for (const call of collaboratorCreateManyCalls()) {
        for (const row of call.data) {
          expect(row.userId).not.toBe(REQUESTER_ID);
        }
      }
      expect(result.sharedTripCount).toBe(0);
    });

    it('should honour excludeFromAutoShare on every back-share query', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(
        createMockRequest({ shareExistingTrips: true })
      );
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: null },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);
      mockPrisma.trip.findMany.mockResolvedValue([{ id: 101 }]);
      mockAcceptTail();

      await travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID, {
        shareExistingTrips: true,
      });

      const findManyCalls = tripFindManyCalls();
      expect(findManyCalls).toHaveLength(2);
      for (const call of findManyCalls) {
        expect(call.where.excludeFromAutoShare).toBe(false);
      }
    });
  });

  // ============================================================
  // TPR-009: Only the recipient may accept
  // ============================================================
  describe('TPR-009: Accept request - recipient only', () => {
    it('should not let the requester accept their own request', async () => {
      // The service scopes the lookup to `recipientId: userId`, so for the
      // requester the row simply is not there.
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(null);

      await expectAppErrorFrom(
        travelPartnerRequestService.acceptRequest(REQUESTER_ID, REQUEST_ID),
        {
          message: 'This request was already answered or has been cancelled.',
          statusCode: 404,
        }
      );

      expect(mockPrisma.travelPartnerRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: REQUEST_ID,
          recipientId: REQUESTER_ID,
          status: TravelPartnerRequestStatusValues.PENDING,
        },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should not let an unrelated third party accept', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(null);

      await expectAppErrorFrom(
        travelPartnerRequestService.acceptRequest(OTHER_USER_ID, REQUEST_ID),
        { statusCode: 404 }
      );

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TPR-010: Requester's partnership is not silently severed
  // ============================================================
  describe('TPR-010: Accept request - stale request', () => {
    it('should refuse when the requester now has a different travel partner', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(createMockRequest());
      mockLockedUsers([
        { id: REQUESTER_ID, travel_partner_id: OTHER_USER_ID },
        { id: RECIPIENT_ID, travel_partner_id: null },
      ]);

      await expectAppErrorFrom(
        travelPartnerRequestService.acceptRequest(RECIPIENT_ID, REQUEST_ID),
        {
          message:
            'This request can no longer be accepted because that user now has a different travel partner',
          statusCode: 409,
        }
      );

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TPR-011: Only the recipient may decline
  // ============================================================
  describe('TPR-011: Decline request', () => {
    it('should decline when the caller is the recipient', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(createMockRequest());
      mockPrisma.travelPartnerRequest.update.mockResolvedValue(
        createMockRequest({ status: TravelPartnerRequestStatusValues.DECLINED })
      );

      const result = await travelPartnerRequestService.declineRequest(RECIPIENT_ID, REQUEST_ID);

      expect(result).toEqual({ message: 'Travel partner request declined' });
      expect(mockPrisma.travelPartnerRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TravelPartnerRequestStatusValues.DECLINED,
          }),
        })
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should not let the requester decline their own request', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(null);

      await expectAppErrorFrom(
        travelPartnerRequestService.declineRequest(REQUESTER_ID, REQUEST_ID),
        { statusCode: 404 }
      );

      expect(mockPrisma.travelPartnerRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: REQUEST_ID,
          recipientId: REQUESTER_ID,
          status: TravelPartnerRequestStatusValues.PENDING,
        },
      });
      expect(mockPrisma.travelPartnerRequest.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // TPR-012: Only the requester may cancel
  // ============================================================
  describe('TPR-012: Cancel request', () => {
    it('should cancel when the caller is the requester', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(createMockRequest());
      mockPrisma.travelPartnerRequest.delete.mockResolvedValue(createMockRequest());

      const result = await travelPartnerRequestService.cancelRequest(REQUESTER_ID, REQUEST_ID);

      expect(result).toEqual({ message: 'Travel partner request cancelled' });
      expect(mockPrisma.travelPartnerRequest.delete).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
      });
    });

    it('should not let the recipient cancel (they decline instead)', async () => {
      mockPrisma.travelPartnerRequest.findFirst.mockResolvedValue(null);

      await expectAppErrorFrom(
        travelPartnerRequestService.cancelRequest(RECIPIENT_ID, REQUEST_ID),
        { statusCode: 404 }
      );

      expect(mockPrisma.travelPartnerRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: REQUEST_ID,
          requesterId: RECIPIENT_ID,
          status: TravelPartnerRequestStatusValues.PENDING,
        },
      });
      expect(mockPrisma.travelPartnerRequest.delete).not.toHaveBeenCalled();
    });
  });
});
