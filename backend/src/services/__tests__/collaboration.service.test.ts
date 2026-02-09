/**
 * Collaboration Service Tests
 *
 * Test cases:
 * - COL-001: Verify trip owner or admin access
 * - COL-002: Get user permission level
 * - COL-003: Send invitation
 * - COL-004: Send invitation - no permission
 * - COL-005: Send invitation - cannot invite owner
 * - COL-006: Send invitation - user already collaborator
 * - COL-007: Send invitation - existing pending invitation (resend)
 * - COL-008: Accept invitation
 * - COL-009: Accept invitation - not found
 * - COL-010: Accept invitation - expired
 * - COL-011: Decline invitation
 * - COL-012: Get collaborators
 * - COL-013: Get collaborators - no access
 * - COL-014: Update collaborator permissions
 * - COL-015: Update collaborator - cannot modify owner
 * - COL-016: Remove collaborator
 * - COL-017: Remove collaborator - self removal
 * - COL-018: Cancel invitation
 * - COL-019: Get pending invitations for user
 */

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) { this.value = String(value); }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
      valueOf(): number { return this.toNumber(); }
    },
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock crypto for token generation
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'mock-invitation-token-hex'),
  })),
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  tripCollaborator: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tripInvitation: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((callback: unknown) => {
    if (typeof callback === 'function') {
      return (callback as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    }
    return Promise.resolve(callback);
  }),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import { collaborationService } from '../collaboration.service';

describe('CollaborationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup $transaction mock
    mockPrisma.$transaction.mockImplementation((callback: unknown) => {
      if (typeof callback === 'function') {
        return (callback as (tx: typeof mockPrisma) => unknown)(mockPrisma);
      }
      return Promise.resolve(callback);
    });
  });

  const mockTrip = {
    id: 100,
    userId: 1,
    title: 'Test Trip',
    description: 'A test trip',
    startDate: new Date('2024-07-01'),
    endDate: new Date('2024-07-15'),
    privacyLevel: 'Private',
    user: { id: 1, username: 'owner', email: 'owner@example.com' },
    collaborators: [],
  };

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    avatarUrl: null,
  };

  const mockCollaborator = {
    id: 1,
    tripId: 100,
    userId: 2,
    permissionLevel: 'edit',
    createdAt: new Date(),
    user: { id: 2, username: 'collaborator', email: 'collab@example.com', avatarUrl: null },
  };

  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  const mockInvitation = {
    id: 1,
    tripId: 100,
    invitedByUserId: 1,
    email: 'invitee@example.com',
    permissionLevel: 'edit',
    token: 'mock-token',
    status: 'pending',
    message: null,
    expiresAt: futureDate,
    respondedAt: null,
    createdAt: new Date(),
    trip: {
      id: 100,
      title: 'Test Trip',
      description: 'A test trip',
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-07-15'),
    },
    invitedBy: { id: 1, username: 'owner', email: 'owner@example.com' },
  };

  // ============================================================
  // COL-001: Verify trip owner or admin access
  // ============================================================
  describe('COL-001: Verify trip owner or admin access', () => {
    it('should return true for trip owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);

      const result = await collaborationService.verifyTripOwnerOrAdmin(1, 100);

      expect(result).toBe(true);
    });

    it('should return false when user has no access', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      const result = await collaborationService.verifyTripOwnerOrAdmin(999, 100);

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // COL-002: Get user permission level
  // ============================================================
  describe('COL-002: Get user permission level', () => {
    it('should return owner with admin permission', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        collaborators: [],
      });

      const result = await collaborationService.getUserPermissionLevel(1, 100);

      expect(result.isOwner).toBe(true);
      expect(result.permissionLevel).toBe('admin');
    });

    it('should return collaborator permission level', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        userId: 1,
        collaborators: [{ permissionLevel: 'edit' }],
      });

      const result = await collaborationService.getUserPermissionLevel(2, 100);

      expect(result.isOwner).toBe(false);
      expect(result.permissionLevel).toBe('edit');
    });

    it('should return null when trip not found', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue(null);

      const result = await collaborationService.getUserPermissionLevel(1, 999);

      expect(result.isOwner).toBe(false);
      expect(result.permissionLevel).toBeNull();
    });

    it('should return null when user has no access', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        collaborators: [],
      });

      const result = await collaborationService.getUserPermissionLevel(999, 100);

      expect(result.isOwner).toBe(false);
      expect(result.permissionLevel).toBeNull();
    });
  });

  // ============================================================
  // COL-003: Send invitation
  // ============================================================
  describe('COL-003: Send invitation', () => {
    it('should create a new invitation', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.user.findUnique.mockResolvedValue(null); // invitee not registered
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(null); // no existing invitation
      mockPrisma.tripInvitation.create.mockResolvedValue(mockInvitation);

      const result = await collaborationService.sendInvitation(1, 100, {
        email: 'invitee@example.com',
        permissionLevel: 'edit',
      });

      expect(mockPrisma.tripInvitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: 100,
          invitedByUserId: 1,
          email: 'invitee@example.com',
          permissionLevel: 'edit',
        }),
        include: expect.any(Object),
      });
      expect(result.email).toBe('invitee@example.com');
    });
  });

  // ============================================================
  // COL-004: Send invitation - no permission
  // ============================================================
  describe('COL-004: Send invitation - no permission', () => {
    it('should throw error when user does not have permission', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        collaborationService.sendInvitation(999, 100, {
          email: 'test@example.com',
          permissionLevel: 'view',
        })
      ).rejects.toThrow('You do not have permission to invite collaborators');
    });
  });

  // ============================================================
  // COL-005: Send invitation - cannot invite owner
  // ============================================================
  describe('COL-005: Send invitation - cannot invite owner', () => {
    it('should throw error when inviting the trip owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);

      await expect(
        collaborationService.sendInvitation(1, 100, {
          email: 'owner@example.com',
          permissionLevel: 'edit',
        })
      ).rejects.toThrow('Cannot invite the trip owner');
    });
  });

  // ============================================================
  // COL-006: Send invitation - user already collaborator
  // ============================================================
  describe('COL-006: Send invitation - user already collaborator', () => {
    it('should throw error when user is already a collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 2,
        email: 'collab@example.com',
      });
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(mockCollaborator);

      await expect(
        collaborationService.sendInvitation(1, 100, {
          email: 'collab@example.com',
          permissionLevel: 'edit',
        })
      ).rejects.toThrow('User is already a collaborator on this trip');
    });
  });

  // ============================================================
  // COL-007: Send invitation - existing pending invitation
  // ============================================================
  describe('COL-007: Send invitation - existing pending invitation', () => {
    it('should update existing pending invitation', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.tripInvitation.update.mockResolvedValue({
        ...mockInvitation,
        token: 'new-token',
      });

      const result = await collaborationService.sendInvitation(1, 100, {
        email: 'invitee@example.com',
        permissionLevel: 'edit',
      });

      expect(mockPrisma.tripInvitation.update).toHaveBeenCalledWith({
        where: { id: mockInvitation.id },
        data: expect.objectContaining({
          token: expect.any(String),
          permissionLevel: 'edit',
        }),
        include: expect.any(Object),
      });
      expect(result.token).toBe('new-token');
    });
  });

  // ============================================================
  // COL-008: Accept invitation
  // ============================================================
  describe('COL-008: Accept invitation', () => {
    it('should accept an invitation and create collaborator', async () => {
      const inviteeUser = { id: 2, email: 'invitee@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(inviteeUser);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(null);

      const createdCollaborator = {
        ...mockCollaborator,
        user: { id: 2, username: 'invitee', email: 'invitee@example.com', avatarUrl: null },
        trip: mockInvitation.trip,
      };
      mockPrisma.tripCollaborator.create.mockResolvedValue(createdCollaborator);
      mockPrisma.tripInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'accepted',
      });

      const result = await collaborationService.acceptInvitation(2, 1);

      expect(mockPrisma.tripCollaborator.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: 100,
          userId: 2,
          permissionLevel: 'edit',
        }),
        include: expect.any(Object),
      });
      expect(result.userId).toBe(2);
    });
  });

  // ============================================================
  // COL-009: Accept invitation - not found
  // ============================================================
  describe('COL-009: Accept invitation - not found', () => {
    it('should throw error when invitation not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(null);

      await expect(
        collaborationService.acceptInvitation(1, 999)
      ).rejects.toThrow('Invitation not found or already responded to');
    });

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        collaborationService.acceptInvitation(999, 1)
      ).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // COL-010: Accept invitation - expired
  // ============================================================
  describe('COL-010: Accept invitation - expired', () => {
    it('should throw error when invitation has expired', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue({
        ...mockInvitation,
        expiresAt: pastDate,
      });
      mockPrisma.tripInvitation.update.mockResolvedValue({});

      await expect(
        collaborationService.acceptInvitation(1, 1)
      ).rejects.toThrow('Invitation has expired');
    });
  });

  // ============================================================
  // COL-011: Decline invitation
  // ============================================================
  describe('COL-011: Decline invitation', () => {
    it('should decline an invitation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.tripInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'declined',
      });

      const result = await collaborationService.declineInvitation(1, 1);

      expect(mockPrisma.tripInvitation.update).toHaveBeenCalledWith({
        where: { id: mockInvitation.id },
        data: expect.objectContaining({
          status: 'declined',
          respondedAt: expect.any(Date),
        }),
      });
      expect(result.message).toBe('Invitation declined');
    });

    it('should throw error when invitation not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(null);

      await expect(
        collaborationService.declineInvitation(1, 999)
      ).rejects.toThrow('Invitation not found or already responded to');
    });
  });

  // ============================================================
  // COL-012: Get collaborators
  // ============================================================
  describe('COL-012: Get collaborators', () => {
    it('should return collaborators and owner for a trip', async () => {
      // getUserPermissionLevel mock
      mockPrisma.trip.findUnique
        .mockResolvedValueOnce({ ...mockTrip, collaborators: [] }) // permission check
        .mockResolvedValueOnce({ ...mockTrip }); // get owner

      mockPrisma.tripCollaborator.findMany.mockResolvedValue([mockCollaborator]);

      const result = await collaborationService.getCollaborators(1, 100);

      expect(result.owner).toBeDefined();
      expect(result.collaborators).toHaveLength(1);
      expect(result.collaborators[0].userId).toBe(2);
    });
  });

  // ============================================================
  // COL-013: Get collaborators - no access
  // ============================================================
  describe('COL-013: Get collaborators - no access', () => {
    it('should throw error when user has no access', async () => {
      // getUserPermissionLevel returns null
      mockPrisma.trip.findUnique.mockResolvedValue(null);

      await expect(
        collaborationService.getCollaborators(999, 100)
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // COL-014: Update collaborator permissions
  // ============================================================
  describe('COL-014: Update collaborator permissions', () => {
    it('should update collaborator permission level', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(mockCollaborator);
      const updated = { ...mockCollaborator, permissionLevel: 'view' };
      mockPrisma.tripCollaborator.update.mockResolvedValue(updated);

      const result = await collaborationService.updateCollaborator(1, 100, 2, {
        permissionLevel: 'view',
      });

      expect(mockPrisma.tripCollaborator.update).toHaveBeenCalledWith({
        where: { id: mockCollaborator.id },
        data: { permissionLevel: 'view' },
        include: expect.any(Object),
      });
      expect(result.permissionLevel).toBe('view');
    });
  });

  // ============================================================
  // COL-015: Update collaborator - cannot modify owner
  // ============================================================
  describe('COL-015: Update collaborator - cannot modify owner', () => {
    it('should throw error when trying to modify trip owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);

      await expect(
        collaborationService.updateCollaborator(1, 100, 1, {
          permissionLevel: 'view',
        })
      ).rejects.toThrow('Cannot modify trip owner permissions');
    });

    it('should throw error when non-owner tries to grant admin', async () => {
      // User 3 is admin collaborator, not owner
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(mockCollaborator);

      await expect(
        collaborationService.updateCollaborator(3, 100, 2, {
          permissionLevel: 'admin',
        })
      ).rejects.toThrow('Only the trip owner can grant admin permissions');
    });
  });

  // ============================================================
  // COL-016: Remove collaborator
  // ============================================================
  describe('COL-016: Remove collaborator', () => {
    it('should remove a collaborator from a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(mockCollaborator);
      mockPrisma.tripCollaborator.delete.mockResolvedValue(mockCollaborator);

      const result = await collaborationService.removeCollaborator(1, 100, 2);

      expect(mockPrisma.tripCollaborator.delete).toHaveBeenCalledWith({
        where: { id: mockCollaborator.id },
      });
      expect(result.message).toBe('Collaborator removed successfully');
    });

    it('should throw error when trying to remove trip owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);

      await expect(
        collaborationService.removeCollaborator(1, 100, 1)
      ).rejects.toThrow('Cannot remove the trip owner');
    });

    it('should throw error when collaborator not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue(null);

      await expect(
        collaborationService.removeCollaborator(1, 100, 999)
      ).rejects.toThrow('Collaborator not found');
    });
  });

  // ============================================================
  // COL-017: Remove collaborator - self removal
  // ============================================================
  describe('COL-017: Remove collaborator - self removal', () => {
    it('should allow a collaborator to remove themselves', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue(mockTrip);
      mockPrisma.tripCollaborator.findUnique.mockResolvedValue({
        ...mockCollaborator,
        userId: 2,
      });
      mockPrisma.tripCollaborator.delete.mockResolvedValue(mockCollaborator);

      const result = await collaborationService.removeCollaborator(2, 100, 2);

      // Should NOT check verifyTripOwnerOrAdmin for self-removal
      expect(mockPrisma.trip.findFirst).not.toHaveBeenCalled();
      expect(result.message).toBe('Collaborator removed successfully');
    });
  });

  // ============================================================
  // COL-018: Cancel invitation
  // ============================================================
  describe('COL-018: Cancel invitation', () => {
    it('should cancel a pending invitation', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.tripInvitation.delete.mockResolvedValue(mockInvitation);

      const result = await collaborationService.cancelInvitation(1, 100, 1);

      expect(mockPrisma.tripInvitation.delete).toHaveBeenCalledWith({
        where: { id: mockInvitation.id },
      });
      expect(result.message).toBe('Invitation cancelled');
    });

    it('should throw error when invitation not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripInvitation.findFirst.mockResolvedValue(null);

      await expect(
        collaborationService.cancelInvitation(1, 100, 999)
      ).rejects.toThrow('Invitation not found');
    });

    it('should throw error when user has no permission', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        collaborationService.cancelInvitation(999, 100, 1)
      ).rejects.toThrow('You do not have permission to cancel invitations');
    });
  });

  // ============================================================
  // COL-019: Get pending invitations for user
  // ============================================================
  describe('COL-019: Get pending invitations for user', () => {
    it('should return pending invitations for a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.tripInvitation.findMany.mockResolvedValue([mockInvitation]);

      const result = await collaborationService.getPendingInvitationsForUser(1);

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe('invitee@example.com');
    });

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        collaborationService.getPendingInvitationsForUser(999)
      ).rejects.toThrow('User not found');
    });

    it('should expire old invitations before returning', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.tripInvitation.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.tripInvitation.findMany.mockResolvedValue([]);

      const result = await collaborationService.getPendingInvitationsForUser(1);

      expect(mockPrisma.tripInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          email: mockUser.email.toLowerCase(),
          status: 'pending',
          expiresAt: { lt: expect.any(Date) },
        },
        data: { status: 'expired' },
      });
      expect(result).toEqual([]);
    });
  });
});
