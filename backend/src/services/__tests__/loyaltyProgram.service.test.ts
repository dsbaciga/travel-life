/**
 * LoyaltyProgram Service Tests
 *
 * Test cases:
 * - LP-001: Create a program (empty optional strings stored as NULL)
 * - LP-002: List only the caller's programs
 * - LP-003: Get by id (owner only, 404 otherwise)
 * - LP-004: Update (partial, owner only)
 * - LP-005: Delete (owner only)
 * - LP-006: assertOwnedBy rejects another user's program
 * - LP-007: Validation schemas
 */

const mockPrisma = {
  loyaltyProgram: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import loyaltyProgramService from '../loyaltyProgram.service';
import {
  createLoyaltyProgramSchema,
  updateLoyaltyProgramSchema,
} from '../../types/loyaltyProgram.types';

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 1,
  name: 'SkyMiles',
  type: 'AIRLINE',
  providerName: 'Delta Air Lines',
  providerCode: 'DL',
  alliance: 'SkyTeam',
  aliases: ['Delta'],
  membershipNumber: '9876543210',
  tier: 'Gold',
  pointsBalance: 12500,
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
});

describe('LoyaltyProgramService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create (LP-001)', () => {
    it('creates a program scoped to the user and returns the full number to its owner', async () => {
      mockPrisma.loyaltyProgram.create.mockResolvedValue(makeProgram());

      const result = await loyaltyProgramService.create(1, {
        name: 'SkyMiles',
        type: 'AIRLINE',
        providerName: 'Delta Air Lines',
        providerCode: 'DL',
        alliance: '',
        aliases: ['Delta'],
        membershipNumber: '9876543210',
        tier: 'Gold',
        pointsBalance: 12500,
      });

      expect(mockPrisma.loyaltyProgram.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          alliance: null,
          notes: null,
          aliases: ['Delta'],
          membershipNumber: '9876543210',
        }),
      });
      expect(result.membershipNumber).toBe('9876543210');
      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('defaults aliases to an empty list', async () => {
      mockPrisma.loyaltyProgram.create.mockResolvedValue(makeProgram({ aliases: [] }));

      await loyaltyProgramService.create(1, {
        name: 'Bonvoy',
        type: 'HOTEL',
        providerName: 'Marriott',
        membershipNumber: '123',
      });

      expect(mockPrisma.loyaltyProgram.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ aliases: [], pointsBalance: null }),
      });
    });
  });

  describe('getAll (LP-002)', () => {
    it('only queries the callers programs', async () => {
      mockPrisma.loyaltyProgram.findMany.mockResolvedValue([makeProgram()]);

      const result = await loyaltyProgramService.getAll(7);

      expect(mockPrisma.loyaltyProgram.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getById (LP-003)', () => {
    it('scopes the lookup to the user', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(makeProgram());

      await loyaltyProgramService.getById(1, 1);

      expect(mockPrisma.loyaltyProgram.findFirst).toHaveBeenCalledWith({ where: { id: 1, userId: 1 } });
    });

    it('throws 404 when the program is not found for this user', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(null);

      await expect(loyaltyProgramService.getById(2, 1)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('update (LP-004)', () => {
    it('updates only the supplied fields', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(makeProgram());
      mockPrisma.loyaltyProgram.update.mockResolvedValue(makeProgram({ tier: 'Platinum' }));

      const result = await loyaltyProgramService.update(1, 1, { tier: 'Platinum' });

      expect(mockPrisma.loyaltyProgram.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { tier: 'Platinum' },
      });
      expect(result.tier).toBe('Platinum');
    });

    it('throws 404 and does not update another users program', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(null);

      await expect(loyaltyProgramService.update(2, 1, { tier: 'x' })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPrisma.loyaltyProgram.update).not.toHaveBeenCalled();
    });
  });

  describe('delete (LP-005)', () => {
    it('deletes an owned program', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(makeProgram());
      mockPrisma.loyaltyProgram.delete.mockResolvedValue(makeProgram());

      await loyaltyProgramService.delete(1, 1);

      expect(mockPrisma.loyaltyProgram.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws 404 for a program the user does not own', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(null);

      await expect(loyaltyProgramService.delete(2, 1)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.loyaltyProgram.delete).not.toHaveBeenCalled();
    });
  });

  describe('assertOwnedBy (LP-006)', () => {
    it('resolves for an owned program', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue({ id: 1 });

      await expect(loyaltyProgramService.assertOwnedBy(1, 1)).resolves.toBeUndefined();
      expect(mockPrisma.loyaltyProgram.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, userId: 1 } })
      );
    });

    it('rejects a program belonging to someone else', async () => {
      mockPrisma.loyaltyProgram.findFirst.mockResolvedValue(null);

      await expect(loyaltyProgramService.assertOwnedBy(2, 1)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('validation schemas (LP-007)', () => {
    const valid = {
      name: 'SkyMiles',
      type: 'AIRLINE',
      providerName: 'Delta Air Lines',
      membershipNumber: '123',
    };

    it('accepts a minimal program', () => {
      expect(createLoyaltyProgramSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects an unknown type, a blank number and a negative balance', () => {
      expect(createLoyaltyProgramSchema.safeParse({ ...valid, type: 'CRUISE' }).success).toBe(false);
      expect(createLoyaltyProgramSchema.safeParse({ ...valid, membershipNumber: '' }).success).toBe(false);
      expect(createLoyaltyProgramSchema.safeParse({ ...valid, pointsBalance: -1 }).success).toBe(false);
    });

    it('lets optional columns be cleared on update but never the required ones', () => {
      expect(
        updateLoyaltyProgramSchema.safeParse({ tier: null, alliance: null, pointsBalance: null, notes: null })
          .success
      ).toBe(true);
      expect(updateLoyaltyProgramSchema.safeParse({ membershipNumber: null }).success).toBe(false);
      expect(updateLoyaltyProgramSchema.safeParse({ providerName: null }).success).toBe(false);
    });
  });
});
