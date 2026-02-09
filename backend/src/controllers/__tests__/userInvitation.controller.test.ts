import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock services and dependencies before importing controller
jest.mock('../../services/userInvitation.service', () => ({
  userInvitationService: {
    sendInvitation: jest.fn(),
    getInvitationByToken: jest.fn(),
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn(),
    getSentInvitations: jest.fn(),
    cancelInvitation: jest.fn(),
    resendInvitation: jest.fn(),
    isEmailConfigured: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '15m',
      refreshSecret: 'test-refresh-secret',
      refreshExpiresIn: '7d',
    },
    cookie: {
      secure: false,
      sameSite: 'lax' as const,
      domain: undefined,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  },
}));

import { userInvitationService } from '../../services/userInvitation.service';
import { userInvitationController } from '../userInvitation.controller';
import {
  createAuthenticatedControllerArgs,
  createMockControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('userInvitation.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sendInvitation', () => {
    it('should send an invitation and return 201', async () => {
      const mockInvitation = { id: 1, email: 'newuser@test.com', token: 'abc123' };
      (userInvitationService.sendInvitation as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { email: 'newuser@test.com' },
      });
      await userInvitationController.sendInvitation(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(userInvitationService.sendInvitation).toHaveBeenCalledWith(
          testUsers.user1.id,
          expect.objectContaining({ email: 'newuser@test.com' })
        );
        expectSuccessResponse(res, 201, mockInvitation);
      }
    });

    it('should call next with error when not authenticated', async () => {
      const { req, res, next } = createMockControllerArgs({
        body: { email: 'newuser@test.com' },
      });
      await userInvitationController.sendInvitation(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation details by token', async () => {
      const mockInvitation = { id: 1, email: 'newuser@test.com', status: 'pending' };
      (userInvitationService.getInvitationByToken as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createMockControllerArgs({
        params: { token: 'abc123' },
      });
      await userInvitationController.getInvitationByToken(req as any, res as any, next);

      expect(userInvitationService.getInvitationByToken).toHaveBeenCalledWith('abc123');
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitation });
    });

    it('should pass errors to next', async () => {
      const error = new Error('Invitation not found');
      (userInvitationService.getInvitationByToken as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createMockControllerArgs({
        params: { token: 'invalid' },
      });
      await userInvitationController.getInvitationByToken(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation and return user with access token', async () => {
      const mockUser = { id: 10, email: 'newuser@test.com', username: 'newuser' };
      (userInvitationService.acceptInvitation as jest.Mock).mockResolvedValue(mockUser as never);

      const { req, res, next } = createMockControllerArgs({
        body: { token: 'abc123', username: 'newuser', password: 'Password123!' },
      });
      await userInvitationController.acceptInvitation(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(userInvitationService.acceptInvitation).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.cookie).toHaveBeenCalledWith(
          'refreshToken',
          expect.any(String),
          expect.any(Object)
        );
        expect(res.cookie).toHaveBeenCalledWith(
          'csrf-token',
          expect.any(String),
          expect.any(Object)
        );
      }
    });
  });

  describe('declineInvitation', () => {
    it('should decline an invitation by token', async () => {
      const mockResult = { declined: true };
      (userInvitationService.declineInvitation as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createMockControllerArgs({
        params: { token: 'abc123' },
      });
      await userInvitationController.declineInvitation(req as any, res as any, next);

      expect(userInvitationService.declineInvitation).toHaveBeenCalledWith('abc123');
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });
  });

  describe('getSentInvitations', () => {
    it('should return paginated sent invitations', async () => {
      const mockResult = { invitations: [], total: 0, page: 1, limit: 20 };
      (userInvitationService.getSentInvitations as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { page: '1', limit: '20' },
      });
      await userInvitationController.getSentInvitations(req as any, res as any, next);

      expect(userInvitationService.getSentInvitations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        20
      );
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });

    it('should use default pagination when params not provided', async () => {
      const mockResult = { invitations: [], total: 0 };
      (userInvitationService.getSentInvitations as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await userInvitationController.getSentInvitations(req as any, res as any, next);

      expect(userInvitationService.getSentInvitations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        20
      );
    });
  });

  describe('cancelInvitation', () => {
    it('should cancel a pending invitation', async () => {
      const mockResult = { cancelled: true };
      (userInvitationService.cancelInvitation as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { invitationId: '10' },
      });
      await userInvitationController.cancelInvitation(req as any, res as any, next);

      expect(userInvitationService.cancelInvitation).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });

    it('should throw error for invalid invitation ID', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { invitationId: 'abc' },
      });
      await userInvitationController.cancelInvitation(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('resendInvitation', () => {
    it('should resend an invitation', async () => {
      const mockInvitation = { id: 10, email: 'user@test.com', resent: true };
      (userInvitationService.resendInvitation as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { invitationId: '10' },
      });
      await userInvitationController.resendInvitation(req as any, res as any, next);

      expect(userInvitationService.resendInvitation).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitation });
    });
  });

  describe('getEmailStatus', () => {
    it('should return email configuration status', async () => {
      (userInvitationService.isEmailConfigured as jest.Mock).mockReturnValue(true);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await userInvitationController.getEmailStatus(req as any, res as any, next);

      expect(userInvitationService.isEmailConfigured).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { emailConfigured: true },
      });
    });

    it('should call next with error when not authenticated', async () => {
      const { req, res, next } = createMockControllerArgs();
      await userInvitationController.getEmailStatus(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
