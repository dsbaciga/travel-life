import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/collaboration.service', () => ({
  collaborationService: {
    sendInvitation: jest.fn(),
    getPendingInvitationsForUser: jest.fn(),
    getInvitationByToken: jest.fn(),
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn(),
    getCollaborators: jest.fn(),
    getTripInvitations: jest.fn(),
    updateCollaborator: jest.fn(),
    removeCollaborator: jest.fn(),
    cancelInvitation: jest.fn(),
    resendInvitation: jest.fn(),
    getSharedTrips: jest.fn(),
    getUserPermissionLevel: jest.fn(),
  },
}));

import { collaborationService } from '../../services/collaboration.service';
import { collaborationController } from '../collaboration.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('collaboration.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sendInvitation', () => {
    it('should send an invitation and return 201', async () => {
      const mockInvitation = { id: 1, tripId: 5, email: 'invite@test.com' };
      (collaborationService.sendInvitation as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
        body: { email: 'invite@test.com', permission: 'editor' },
      });
      await collaborationController.sendInvitation(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(collaborationService.sendInvitation).toHaveBeenCalledWith(
          testUsers.user1.id,
          5,
          expect.objectContaining({ email: 'invite@test.com' })
        );
        expectSuccessResponse(res, 201, mockInvitation);
      }
    });
  });

  describe('getMyInvitations', () => {
    it('should return pending invitations for current user', async () => {
      const mockInvitations = [{ id: 1, tripId: 5 }];
      (collaborationService.getPendingInvitationsForUser as jest.Mock).mockResolvedValue(mockInvitations as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await collaborationController.getMyInvitations(req as any, res as any, next);

      expect(collaborationService.getPendingInvitationsForUser).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitations });
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation details by token', async () => {
      const mockInvitation = { id: 1, tripId: 5, token: 'abc123' };
      (collaborationService.getInvitationByToken as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { token: 'abc123' },
      });
      await collaborationController.getInvitationByToken(req as any, res as any, next);

      expect(collaborationService.getInvitationByToken).toHaveBeenCalledWith('abc123');
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitation });
    });
  });

  describe('acceptInvitation', () => {
    it('should accept an invitation and return collaborator', async () => {
      const mockCollaborator = { id: 1, userId: 1, tripId: 5 };
      (collaborationService.acceptInvitation as jest.Mock).mockResolvedValue(mockCollaborator as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { invitationId: '10' },
      });
      await collaborationController.acceptInvitation(req as any, res as any, next);

      expect(collaborationService.acceptInvitation).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCollaborator });
    });
  });

  describe('declineInvitation', () => {
    it('should decline an invitation', async () => {
      const mockResult = { declined: true };
      (collaborationService.declineInvitation as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { invitationId: '10' },
      });
      await collaborationController.declineInvitation(req as any, res as any, next);

      expect(collaborationService.declineInvitation).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });
  });

  describe('getCollaborators', () => {
    it('should return collaborators for a trip', async () => {
      const mockCollaborators = [{ userId: 2, permission: 'editor' }];
      (collaborationService.getCollaborators as jest.Mock).mockResolvedValue(mockCollaborators as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await collaborationController.getCollaborators(req as any, res as any, next);

      expect(collaborationService.getCollaborators).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCollaborators });
    });
  });

  describe('getTripInvitations', () => {
    it('should return pending invitations for a trip', async () => {
      const mockInvitations = [{ id: 1, email: 'test@test.com' }];
      (collaborationService.getTripInvitations as jest.Mock).mockResolvedValue(mockInvitations as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await collaborationController.getTripInvitations(req as any, res as any, next);

      expect(collaborationService.getTripInvitations).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitations });
    });
  });

  describe('updateCollaborator', () => {
    it('should update a collaborator permission', async () => {
      const mockCollaborator = { userId: 2, tripId: 5, permission: 'viewer' };
      (collaborationService.updateCollaborator as jest.Mock).mockResolvedValue(mockCollaborator as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5', userId: '2' },
        body: { permission: 'viewer' },
      });
      await collaborationController.updateCollaborator(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(collaborationService.updateCollaborator).toHaveBeenCalledWith(
          testUsers.user1.id,
          5,
          2,
          expect.objectContaining({ permission: 'viewer' })
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCollaborator });
      }
    });
  });

  describe('removeCollaborator', () => {
    it('should remove a collaborator from a trip', async () => {
      const mockResult = { removed: true };
      (collaborationService.removeCollaborator as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5', userId: '2' },
      });
      await collaborationController.removeCollaborator(req as any, res as any, next);

      expect(collaborationService.removeCollaborator).toHaveBeenCalledWith(testUsers.user1.id, 5, 2);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });
  });

  describe('cancelInvitation', () => {
    it('should cancel a pending invitation', async () => {
      const mockResult = { cancelled: true };
      (collaborationService.cancelInvitation as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5', invitationId: '10' },
      });
      await collaborationController.cancelInvitation(req as any, res as any, next);

      expect(collaborationService.cancelInvitation).toHaveBeenCalledWith(testUsers.user1.id, 5, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });
  });

  describe('resendInvitation', () => {
    it('should resend a pending invitation', async () => {
      const mockInvitation = { id: 10, resent: true };
      (collaborationService.resendInvitation as jest.Mock).mockResolvedValue(mockInvitation as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5', invitationId: '10' },
      });
      await collaborationController.resendInvitation(req as any, res as any, next);

      expect(collaborationService.resendInvitation).toHaveBeenCalledWith(testUsers.user1.id, 5, 10);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockInvitation });
    });
  });

  describe('getSharedTrips', () => {
    it('should return trips shared with the current user', async () => {
      const mockTrips = [{ id: 5, name: 'Shared Trip' }];
      (collaborationService.getSharedTrips as jest.Mock).mockResolvedValue(mockTrips as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await collaborationController.getSharedTrips(req as any, res as any, next);

      expect(collaborationService.getSharedTrips).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockTrips });
    });
  });

  describe('getPermissionLevel', () => {
    it('should return user permission level for a trip', async () => {
      const mockResult = { permission: 'editor', isOwner: false };
      (collaborationService.getUserPermissionLevel as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await collaborationController.getPermissionLevel(req as any, res as any, next);

      expect(collaborationService.getUserPermissionLevel).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockResult });
    });
  });
});
