/**
 * UserInvitation Service Tests
 *
 * Test cases:
 * - UI-001: Send invitation
 * - UI-002: Send invitation to existing user (reject)
 * - UI-003: Get invitation by token
 * - UI-004: Accept invitation
 * - UI-005: Decline invitation
 * - UI-006: Get sent invitations (paginated)
 * - UI-007: Cancel a pending invitation
 * - UI-008: Resend invitation
 * - UI-009: Check email configuration
 */

// Mock the database config
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  userInvitation: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  travelCompanion: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock email service
const mockSendUserInvitation = jest.fn().mockResolvedValue(true);
const mockIsConfigured = jest.fn().mockReturnValue(true);
jest.mock('../email.service', () => ({
  emailService: {
    sendUserInvitation: mockSendUserInvitation,
    isConfigured: mockIsConfigured,
  },
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

// Mock config
jest.mock('../../config', () => ({
  config: {
    frontendUrl: 'http://localhost:3000',
    nodeEnv: 'test',
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashed_password'),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('a'.repeat(64)),
  }),
}));

import { userInvitationService } from '../userInvitation.service';

describe('UserInvitationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: $transaction executes the callback with mockPrisma
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return callback(mockPrisma);
    });
  });

  const createMockInvitation = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    invitedByUserId: 1,
    email: 'newuser@example.com',
    token: 'a'.repeat(64),
    message: null,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    createdAt: new Date(),
    respondedAt: null,
    acceptedUserId: null,
    invitedBy: { id: 1, username: 'testuser', email: 'test@example.com' },
    ...overrides,
  });

  // ============================================================
  // UI-001: Send invitation
  // ============================================================
  describe('UI-001: Send invitation', () => {
    it('should create and send an invitation', async () => {
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(invitingUser) // inviting user lookup
        .mockResolvedValueOnce(null); // check if recipient exists

      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null); // no existing invitation
      mockPrisma.userInvitation.create.mockResolvedValue(mockInvitation);

      const result = await userInvitationService.sendInvitation(1, {
        email: 'newuser@example.com',
      });

      expect(result.email).toBe('newuser@example.com');
      expect(result.emailSent).toBe(true);
      expect(mockSendUserInvitation).toHaveBeenCalled();
    });

    it('should update existing pending invitation', async () => {
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(invitingUser)
        .mockResolvedValueOnce(null);

      const existingInvitation = createMockInvitation();
      const updatedInvitation = createMockInvitation({ token: 'b'.repeat(64) });

      mockPrisma.userInvitation.findFirst.mockResolvedValue(existingInvitation);
      mockPrisma.userInvitation.update.mockResolvedValue(updatedInvitation);

      const result = await userInvitationService.sendInvitation(1, {
        email: 'newuser@example.com',
      });

      expect(mockPrisma.userInvitation.update).toHaveBeenCalled();
      expect(result.emailSent).toBe(true);
    });

    it('should include personal message when provided', async () => {
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(invitingUser)
        .mockResolvedValueOnce(null);

      const mockInvitation = createMockInvitation({ message: 'Join us!' });
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);
      mockPrisma.userInvitation.create.mockResolvedValue(mockInvitation);

      await userInvitationService.sendInvitation(1, {
        email: 'newuser@example.com',
        message: 'Join us!',
      });

      expect(mockPrisma.userInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            message: 'Join us!',
          }),
        })
      );
    });
  });

  // ============================================================
  // UI-002: Send invitation to existing user
  // ============================================================
  describe('UI-002: Send invitation to existing user', () => {
    it('should throw error when inviting an existing user', async () => {
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };
      const existingUser = { id: 2, username: 'existing', email: 'existing@example.com' };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(invitingUser) // inviting user lookup
        .mockResolvedValueOnce(existingUser); // existing user found

      await expect(
        userInvitationService.sendInvitation(1, { email: 'existing@example.com' })
      ).rejects.toThrow('Unable to send invitation to the provided email address');
    });

    it('should throw error when inviting user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        userInvitationService.sendInvitation(999, { email: 'test@example.com' })
      ).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // UI-003: Get invitation by token
  // ============================================================
  describe('UI-003: Get invitation by token', () => {
    it('should return invitation details for a valid token', async () => {
      const mockInvitation = createMockInvitation({
        invitedBy: { username: 'testuser' },
      });

      mockPrisma.userInvitation.findUnique.mockResolvedValue(mockInvitation);

      const result = await userInvitationService.getInvitationByToken('a'.repeat(64));

      expect(result.email).toBe('newuser@example.com');
      expect(result.isValid).toBe(true);
      expect(result.isExpired).toBe(false);
    });

    it('should throw 404 for non-existent token', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue(null);

      await expect(
        userInvitationService.getInvitationByToken('nonexistent')
      ).rejects.toThrow('Invitation not found');
    });

    it('should mark expired invitations as expired on access', async () => {
      const expiredInvitation = createMockInvitation({
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
        status: 'PENDING',
        invitedBy: { username: 'testuser' },
      });

      mockPrisma.userInvitation.findUnique.mockResolvedValue(expiredInvitation);
      mockPrisma.userInvitation.update.mockResolvedValue({
        ...expiredInvitation,
        status: 'EXPIRED',
      });

      const result = await userInvitationService.getInvitationByToken('a'.repeat(64));

      expect(result.status).toBe('EXPIRED');
      expect(result.isExpired).toBe(true);
      expect(result.isValid).toBe(false);
    });
  });

  // ============================================================
  // UI-004: Accept invitation
  // ============================================================
  describe('UI-004: Accept invitation', () => {
    it('should accept an invitation and create a user', async () => {
      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValueOnce(null); // email check

      const newUser = { id: 10, username: 'newuser', email: 'newuser@example.com', createdAt: new Date() };
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.travelCompanion.create.mockResolvedValue({});
      mockPrisma.userInvitation.update.mockResolvedValue({});

      const result = await userInvitationService.acceptInvitation({
        token: 'a'.repeat(64),
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePass123!',
      });

      expect(result.id).toBe(10);
      expect(result.username).toBe('newuser');
      expect(mockPrisma.travelCompanion.create).toHaveBeenCalled(); // "Myself" companion
    });

    it('should reject expired invitation', async () => {
      const expiredInvitation = createMockInvitation({
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      mockPrisma.userInvitation.findUnique.mockResolvedValue(expiredInvitation);
      mockPrisma.userInvitation.update.mockResolvedValue({});

      await expect(
        userInvitationService.acceptInvitation({
          token: 'a'.repeat(64),
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Invitation has expired');
    });

    it('should reject already-accepted invitation', async () => {
      const acceptedInvitation = createMockInvitation({ status: 'ACCEPTED' });
      mockPrisma.userInvitation.findUnique.mockResolvedValue(acceptedInvitation);

      await expect(
        userInvitationService.acceptInvitation({
          token: 'a'.repeat(64),
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Invitation is no longer valid');
    });

    it('should reject when email does not match', async () => {
      const mockInvitation = createMockInvitation({ email: 'invited@example.com' });
      mockPrisma.userInvitation.findUnique.mockResolvedValue(mockInvitation);

      await expect(
        userInvitationService.acceptInvitation({
          token: 'a'.repeat(64),
          username: 'newuser',
          email: 'wrong@example.com',
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Email does not match the invitation');
    });

    it('should reject when username already exists', async () => {
      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 5, username: 'newuser' }); // username taken

      await expect(
        userInvitationService.acceptInvitation({
          token: 'a'.repeat(64),
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Unable to create account with the provided information');
    });

    it('should throw 404 for non-existent token', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue(null);

      await expect(
        userInvitationService.acceptInvitation({
          token: 'a'.repeat(64),
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Invitation not found');
    });
  });

  // ============================================================
  // UI-005: Decline invitation
  // ============================================================
  describe('UI-005: Decline invitation', () => {
    it('should decline a pending invitation', async () => {
      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'DECLINED',
      });

      const result = await userInvitationService.declineInvitation('a'.repeat(64));

      expect(result.message).toBe('Invitation declined');
      expect(mockPrisma.userInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DECLINED' }),
        })
      );
    });

    it('should throw 404 for non-existent invitation', async () => {
      mockPrisma.userInvitation.findUnique.mockResolvedValue(null);

      await expect(
        userInvitationService.declineInvitation('nonexistent')
      ).rejects.toThrow('Invitation not found');
    });

    it('should reject declining a non-pending invitation', async () => {
      const acceptedInvitation = createMockInvitation({ status: 'ACCEPTED' });
      mockPrisma.userInvitation.findUnique.mockResolvedValue(acceptedInvitation);

      await expect(
        userInvitationService.declineInvitation('a'.repeat(64))
      ).rejects.toThrow('Invitation is no longer valid');
    });
  });

  // ============================================================
  // UI-006: Get sent invitations
  // ============================================================
  describe('UI-006: Get sent invitations', () => {
    it('should return paginated list of sent invitations', async () => {
      const invitations = [
        createMockInvitation({ id: 1, email: 'user1@example.com' }),
        createMockInvitation({ id: 2, email: 'user2@example.com' }),
      ];

      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.userInvitation.findMany.mockResolvedValue(invitations);
      mockPrisma.userInvitation.count.mockResolvedValue(2);

      const result = await userInvitationService.getSentInvitations(1, 1, 20);

      expect(result.invitations.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should expire pending invitations before listing', async () => {
      mockPrisma.userInvitation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.userInvitation.findMany.mockResolvedValue([]);
      mockPrisma.userInvitation.count.mockResolvedValue(0);

      await userInvitationService.getSentInvitations(1);

      expect(mockPrisma.userInvitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invitedByUserId: 1,
            status: 'PENDING',
            expiresAt: expect.any(Object),
          }),
        })
      );
    });
  });

  // ============================================================
  // UI-007: Cancel invitation
  // ============================================================
  describe('UI-007: Cancel invitation', () => {
    it('should cancel a pending invitation', async () => {
      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.userInvitation.delete.mockResolvedValue(mockInvitation);

      const result = await userInvitationService.cancelInvitation(1, 1);

      expect(result.message).toBe('Invitation cancelled');
      expect(mockPrisma.userInvitation.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw 404 when invitation not found or not pending', async () => {
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      await expect(
        userInvitationService.cancelInvitation(1, 999)
      ).rejects.toThrow('Invitation not found or already responded to');
    });
  });

  // ============================================================
  // UI-008: Resend invitation
  // ============================================================
  describe('UI-008: Resend invitation', () => {
    it('should resend an invitation with new token', async () => {
      const mockInvitation = createMockInvitation();
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };

      mockPrisma.userInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.user.findUnique.mockResolvedValue(invitingUser);
      mockPrisma.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        token: 'b'.repeat(64),
        invitedBy: invitingUser,
      });

      const result = await userInvitationService.resendInvitation(1, 1);

      expect(result.emailSent).toBe(true);
      expect(mockSendUserInvitation).toHaveBeenCalled();
    });

    it('should resend expired invitations (reactivate)', async () => {
      const expiredInvitation = createMockInvitation({ status: 'EXPIRED' });
      const invitingUser = { id: 1, username: 'testuser', email: 'test@example.com' };

      mockPrisma.userInvitation.findFirst.mockResolvedValue(expiredInvitation);
      mockPrisma.user.findUnique.mockResolvedValue(invitingUser);
      mockPrisma.userInvitation.update.mockResolvedValue({
        ...expiredInvitation,
        status: 'PENDING',
        invitedBy: invitingUser,
      });

      const result = await userInvitationService.resendInvitation(1, 1);

      expect(mockPrisma.userInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        })
      );
      expect(result.emailSent).toBe(true);
    });

    it('should throw 404 when invitation cannot be resent', async () => {
      mockPrisma.userInvitation.findFirst.mockResolvedValue(null);

      await expect(
        userInvitationService.resendInvitation(1, 999)
      ).rejects.toThrow('Invitation not found or cannot be resent');
    });

    it('should throw 404 when inviting user not found', async () => {
      const mockInvitation = createMockInvitation();
      mockPrisma.userInvitation.findFirst.mockResolvedValue(mockInvitation);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        userInvitationService.resendInvitation(1, 1)
      ).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // UI-009: Check email configuration
  // ============================================================
  describe('UI-009: Check email configuration', () => {
    it('should return true when email is configured', () => {
      mockIsConfigured.mockReturnValue(true);
      expect(userInvitationService.isEmailConfigured()).toBe(true);
    });

    it('should return false when email is not configured', () => {
      mockIsConfigured.mockReturnValue(false);
      expect(userInvitationService.isEmailConfigured()).toBe(false);
    });
  });
});
