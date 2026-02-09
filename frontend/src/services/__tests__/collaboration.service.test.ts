/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../lib/axios';
import collaborationService from '../collaboration.service';

describe('collaborationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ================================================================
  // User Invitations
  // ================================================================

  describe('getMyInvitations', () => {
    it('should call GET /invitations', async () => {
      const mockInvitations = [
        { id: 1, tripId: 10, status: 'pending' },
        { id: 2, tripId: 20, status: 'pending' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInvitations });

      const result = await collaborationService.getMyInvitations();

      expect(api.get).toHaveBeenCalledWith('/invitations');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockInvitations);
    });

    it('should return empty array when no invitations exist', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

      const result = await collaborationService.getMyInvitations();

      expect(result).toEqual([]);
    });
  });

  describe('getInvitationByToken', () => {
    it('should call GET /invitations/token/:token', async () => {
      const mockInvitation = { id: 1, tripId: 10, token: 'abc123', status: 'pending' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInvitation });

      const result = await collaborationService.getInvitationByToken('abc123');

      expect(api.get).toHaveBeenCalledWith('/invitations/token/abc123');
      expect(result).toEqual(mockInvitation);
    });

    it('should propagate errors for invalid token', async () => {
      const error = new Error('Invitation not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(collaborationService.getInvitationByToken('invalid')).rejects.toThrow('Invitation not found');
    });
  });

  describe('acceptInvitation', () => {
    it('should call POST /invitations/:invitationId/accept', async () => {
      const mockCollaborator = { id: 1, userId: 5, tripId: 10, permission: 'editor' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockCollaborator });

      const result = await collaborationService.acceptInvitation(1);

      expect(api.post).toHaveBeenCalledWith('/invitations/1/accept');
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCollaborator);
    });
  });

  describe('declineInvitation', () => {
    it('should call POST /invitations/:invitationId/decline', async () => {
      const mockResponse = { message: 'Invitation declined' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await collaborationService.declineInvitation(2);

      expect(api.post).toHaveBeenCalledWith('/invitations/2/decline');
      expect(result).toEqual(mockResponse);
    });
  });

  // ================================================================
  // Shared Trips
  // ================================================================

  describe('getSharedTrips', () => {
    it('should call GET /trips/shared', async () => {
      const mockTrips = [
        { id: 1, name: 'Shared Trip 1', permission: 'viewer' },
        { id: 2, name: 'Shared Trip 2', permission: 'editor' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrips });

      const result = await collaborationService.getSharedTrips();

      expect(api.get).toHaveBeenCalledWith('/trips/shared');
      expect(result).toEqual(mockTrips);
    });
  });

  // ================================================================
  // Trip Collaboration Management
  // ================================================================

  describe('getPermissionLevel', () => {
    it('should call GET /trips/:tripId/permission', async () => {
      const mockPermission = { permission: 'editor', isOwner: false };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPermission });

      const result = await collaborationService.getPermissionLevel(10);

      expect(api.get).toHaveBeenCalledWith('/trips/10/permission');
      expect(result).toEqual(mockPermission);
    });
  });

  describe('getCollaborators', () => {
    it('should call GET /trips/:tripId/collaborators', async () => {
      const mockResponse = {
        collaborators: [
          { id: 1, userId: 5, username: 'user1', permission: 'editor' },
          { id: 2, userId: 6, username: 'user2', permission: 'viewer' },
        ],
        pendingInvitations: [],
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await collaborationService.getCollaborators(10);

      expect(api.get).toHaveBeenCalledWith('/trips/10/collaborators');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors when trip not found', async () => {
      const error = new Error('Trip not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(collaborationService.getCollaborators(999)).rejects.toThrow('Trip not found');
    });
  });

  describe('updateCollaborator', () => {
    it('should call PATCH /trips/:tripId/collaborators/:userId with update data', async () => {
      const updateData = { permission: 'editor' };
      const mockCollaborator = { id: 1, userId: 5, tripId: 10, permission: 'editor' };
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockCollaborator });

      const result = await collaborationService.updateCollaborator(10, 5, updateData as any);

      expect(api.patch).toHaveBeenCalledWith('/trips/10/collaborators/5', updateData);
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCollaborator);
    });
  });

  describe('removeCollaborator', () => {
    it('should call DELETE /trips/:tripId/collaborators/:userId', async () => {
      const mockResponse = { message: 'Collaborator removed' };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await collaborationService.removeCollaborator(10, 5);

      expect(api.delete).toHaveBeenCalledWith('/trips/10/collaborators/5');
      expect(api.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors on removal failure', async () => {
      const error = new Error('Forbidden');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(collaborationService.removeCollaborator(10, 5)).rejects.toThrow('Forbidden');
    });
  });

  describe('leaveTrip', () => {
    it('should delegate to removeCollaborator with same tripId and userId', async () => {
      const mockResponse = { message: 'Left trip' };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await collaborationService.leaveTrip(10, 5);

      expect(api.delete).toHaveBeenCalledWith('/trips/10/collaborators/5');
      expect(result).toEqual(mockResponse);
    });
  });

  // ================================================================
  // Trip Invitations (owner/admin)
  // ================================================================

  describe('getTripInvitations', () => {
    it('should call GET /trips/:tripId/invitations', async () => {
      const mockInvitations = [
        { id: 1, email: 'user@example.com', status: 'pending' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInvitations });

      const result = await collaborationService.getTripInvitations(10);

      expect(api.get).toHaveBeenCalledWith('/trips/10/invitations');
      expect(result).toEqual(mockInvitations);
    });
  });

  describe('sendInvitation', () => {
    it('should call POST /trips/:tripId/invitations with invitation data', async () => {
      const invitationData = { email: 'friend@example.com', permission: 'editor' };
      const mockInvitation = { id: 3, tripId: 10, ...invitationData, status: 'pending' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInvitation });

      const result = await collaborationService.sendInvitation(10, invitationData as any);

      expect(api.post).toHaveBeenCalledWith('/trips/10/invitations', invitationData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockInvitation);
    });

    it('should propagate errors when user not found', async () => {
      const error = new Error('User not found');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(collaborationService.sendInvitation(10, {} as any)).rejects.toThrow('User not found');
    });
  });

  describe('cancelInvitation', () => {
    it('should call DELETE /trips/:tripId/invitations/:invitationId', async () => {
      const mockResponse = { message: 'Invitation cancelled' };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await collaborationService.cancelInvitation(10, 3);

      expect(api.delete).toHaveBeenCalledWith('/trips/10/invitations/3');
      expect(result).toEqual(mockResponse);
    });
  });

  describe('resendInvitation', () => {
    it('should call POST /trips/:tripId/invitations/:invitationId/resend', async () => {
      const mockInvitation = { id: 3, tripId: 10, status: 'pending' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInvitation });

      const result = await collaborationService.resendInvitation(10, 3);

      expect(api.post).toHaveBeenCalledWith('/trips/10/invitations/3/resend');
      expect(result).toEqual(mockInvitation);
    });
  });
});
