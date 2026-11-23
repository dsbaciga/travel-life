import prisma from '../config/database';
import { AppError } from '../errors/errors';
import crypto from 'crypto';
import type {
  SendInvitationInput,
  UpdateCollaboratorInput,
  PermissionLevelType,
} from '../types/collaboration.types';

import { PermissionLevel, InvitationStatus } from '../types/collaboration.types';

// Default invitation expiry: 7 days
const INVITATION_EXPIRY_DAYS = 7;

/**
 * Generate a secure random token for invitations
 */
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get expiry date for invitations
 */
function getExpiryDate(days: number = INVITATION_EXPIRY_DAYS): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export const collaborationService = {
  /**
   * Verify user has owner or admin access to a trip
   */
  async verifyTripOwnerOrAdmin(userId: number, tripId: number): Promise<boolean> {
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId }, // Owner
          {
            collaborators: {
              some: {
                userId,
                permissionLevel: PermissionLevel.ADMIN,
              },
            },
          },
        ],
      },
    });

    return !!trip;
  },

  /**
   * Get user's permission level for a trip
   */
  async getUserPermissionLevel(
    userId: number,
    tripId: number
  ): Promise<{ isOwner: boolean; permissionLevel: PermissionLevelType | null }> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        collaborators: {
          where: { userId },
        },
      },
    });

    if (!trip) {
      return { isOwner: false, permissionLevel: null };
    }

    if (trip.userId === userId) {
      return { isOwner: true, permissionLevel: PermissionLevel.ADMIN };
    }

    if (trip.collaborators.length > 0) {
      const collaborator = trip.collaborators[0];
      return {
        isOwner: false,
        permissionLevel: collaborator.permissionLevel as PermissionLevelType,
      };
    }

    return { isOwner: false, permissionLevel: null };
  },

  /**
   * Send an invitation to collaborate on a trip
   */
  async sendInvitation(userId: number, tripId: number, data: SendInvitationInput) {
    // Verify user can manage collaborators (owner or admin)
    const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to invite collaborators', 403);
    }

    // Get trip details for response
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { user: { select: { id: true, username: true, email: true } } },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // Prevent non-owners from inviting at admin permission level
    if (data.permissionLevel === PermissionLevel.ADMIN && trip.userId !== userId) {
      throw new AppError('Only the trip owner can invite collaborators with admin permissions', 403);
    }

    // Check if invited email is the trip owner
    if (trip.user.email.toLowerCase() === data.email.toLowerCase()) {
      throw new AppError('Cannot invite the trip owner', 400);
    }

    // Check if user is already a collaborator
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      const existingCollaborator = await prisma.tripCollaborator.findUnique({
        where: {
          tripId_userId: {
            tripId,
            userId: existingUser.id,
          },
        },
      });

      if (existingCollaborator) {
        throw new AppError('User is already a collaborator on this trip', 400);
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.tripInvitation.findFirst({
      where: {
        tripId,
        email: data.email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
    });

    if (existingInvitation) {
      // Update existing invitation with new token and expiry
      const invitation = await prisma.tripInvitation.update({
        where: { id: existingInvitation.id },
        data: {
          token: generateInvitationToken(),
          permissionLevel: data.permissionLevel,
          message: data.message || null,
          expiresAt: getExpiryDate(),
        },
        include: {
          trip: {
            select: {
              id: true,
              title: true,
              description: true,
              startDate: true,
              endDate: true,
            },
          },
          invitedBy: {
            select: { id: true, username: true, email: true },
          },
        },
      });

      return invitation;
    }

    // Create new invitation
    const invitation = await prisma.tripInvitation.create({
      data: {
        tripId,
        invitedByUserId: userId,
        email: data.email.toLowerCase(),
        permissionLevel: data.permissionLevel,
        token: generateInvitationToken(),
        message: data.message || null,
        expiresAt: getExpiryDate(),
      },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
          },
        },
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    return invitation;
  },

  /**
   * Get all pending invitations for a user by email
   */
  async getPendingInvitationsForUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Mark expired invitations
    await prisma.tripInvitation.updateMany({
      where: {
        email: user.email.toLowerCase(),
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    const invitations = await prisma.tripInvitation.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            // Either an uploaded cover image or a photo from the trip's gallery
            coverImagePath: true,
            coverImageThumbnailPath: true,
            coverColor: true,
            coverPhoto: {
              select: {
                id: true,
                localPath: true,
                thumbnailPath: true,
              },
            },
          },
        },
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations;
  },

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string) {
    const invitation = await prisma.tripInvitation.findUnique({
      where: { token },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
            // Either an uploaded cover image or a photo from the trip's gallery
            coverImagePath: true,
            coverImageThumbnailPath: true,
            coverColor: true,
            coverPhoto: {
              select: {
                id: true,
                localPath: true,
                thumbnailPath: true,
              },
            },
          },
        },
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      await prisma.tripInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new AppError('Invitation has expired', 400);
    }

    return invitation;
  },

  /**
   * Accept an invitation
   */
  async acceptInvitation(userId: number, invitationId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const invitation = await prisma.tripInvitation.findFirst({
      where: {
        id: invitationId,
        email: user.email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
      include: {
        trip: true,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found or already responded to', 404);
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      await prisma.tripInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new AppError('Invitation has expired', 400);
    }

    // Check if already a collaborator
    const existingCollaborator = await prisma.tripCollaborator.findUnique({
      where: {
        tripId_userId: {
          tripId: invitation.tripId,
          userId,
        },
      },
    });

    if (existingCollaborator) {
      // Update invitation status and return existing
      await prisma.tripInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });
      throw new AppError('You are already a collaborator on this trip', 400);
    }

    // Create collaborator and update invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const collaborator = await tx.tripCollaborator.create({
        data: {
          tripId: invitation.tripId,
          userId,
          permissionLevel: invitation.permissionLevel,
        },
        include: {
          user: {
            select: { id: true, username: true, email: true, avatarUrl: true },
          },
          trip: {
            select: {
              id: true,
              title: true,
              description: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      });

      await tx.tripInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      return collaborator;
    });

    return result;
  },

  /**
   * Decline an invitation
   */
  async declineInvitation(userId: number, invitationId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const invitation = await prisma.tripInvitation.findFirst({
      where: {
        id: invitationId,
        email: user.email.toLowerCase(),
        status: InvitationStatus.PENDING,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found or already responded to', 404);
    }

    await prisma.tripInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.DECLINED,
        respondedAt: new Date(),
      },
    });

    return { message: 'Invitation declined' };
  },

  /**
   * Get all collaborators for a trip
   */
  async getCollaborators(userId: number, tripId: number) {
    // Verify user has access to this trip
    const { permissionLevel } = await this.getUserPermissionLevel(userId, tripId);
    if (!permissionLevel) {
      throw new AppError('Trip not found or access denied', 404);
    }

    const collaborators = await prisma.tripCollaborator.findMany({
      where: { tripId },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Also get the trip owner
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
    });

    return {
      owner: trip?.user,
      collaborators,
    };
  },

  /**
   * Get pending invitations for a trip (for trip owners/admins)
   */
  async getTripInvitations(userId: number, tripId: number) {
    // Verify user can manage collaborators
    const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to view invitations', 403);
    }

    // Mark expired invitations
    await prisma.tripInvitation.updateMany({
      where: {
        tripId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });

    const invitations = await prisma.tripInvitation.findMany({
      where: {
        tripId,
        status: InvitationStatus.PENDING,
      },
      include: {
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations;
  },

  /**
   * Update a collaborator's permission level
   */
  async updateCollaborator(
    userId: number,
    tripId: number,
    collaboratorUserId: number,
    data: UpdateCollaboratorInput
  ) {
    // Verify user can manage collaborators
    const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to manage collaborators', 403);
    }

    // Check if target is the trip owner
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (trip?.userId === collaboratorUserId) {
      throw new AppError('Cannot modify trip owner permissions', 400);
    }

    // Find the collaborator
    const collaborator = await prisma.tripCollaborator.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId: collaboratorUserId,
        },
      },
    });

    if (!collaborator) {
      throw new AppError('Collaborator not found', 404);
    }

    // Prevent non-owners from setting admin permissions
    if (data.permissionLevel === PermissionLevel.ADMIN && trip?.userId !== userId) {
      throw new AppError('Only the trip owner can grant admin permissions', 403);
    }

    const updated = await prisma.tripCollaborator.update({
      where: { id: collaborator.id },
      data: { permissionLevel: data.permissionLevel },
      include: {
        user: {
          select: { id: true, username: true, email: true, avatarUrl: true },
        },
      },
    });

    return updated;
  },

  /**
   * Remove a collaborator from a trip
   */
  async removeCollaborator(userId: number, tripId: number, collaboratorUserId: number) {
    // Allow self-removal (leaving a trip)
    const isSelfRemoval = userId === collaboratorUserId;

    if (!isSelfRemoval) {
      // Verify user can manage collaborators
      const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
      if (!hasAccess) {
        throw new AppError('You do not have permission to remove collaborators', 403);
      }
    }

    // Check if target is the trip owner
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (trip?.userId === collaboratorUserId) {
      throw new AppError('Cannot remove the trip owner', 400);
    }

    // Find the collaborator
    const collaborator = await prisma.tripCollaborator.findUnique({
      where: {
        tripId_userId: {
          tripId,
          userId: collaboratorUserId,
        },
      },
    });

    if (!collaborator) {
      throw new AppError('Collaborator not found', 404);
    }

    await prisma.tripCollaborator.delete({
      where: { id: collaborator.id },
    });

    return { message: 'Collaborator removed successfully' };
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(userId: number, tripId: number, invitationId: number) {
    // Verify user can manage collaborators
    const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to cancel invitations', 403);
    }

    const invitation = await prisma.tripInvitation.findFirst({
      where: {
        id: invitationId,
        tripId,
        status: InvitationStatus.PENDING,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    await prisma.tripInvitation.delete({
      where: { id: invitation.id },
    });

    return { message: 'Invitation cancelled' };
  },

  /**
   * Resend an invitation (generate new token and extend expiry)
   */
  async resendInvitation(userId: number, tripId: number, invitationId: number) {
    // Verify user can manage collaborators
    const hasAccess = await this.verifyTripOwnerOrAdmin(userId, tripId);
    if (!hasAccess) {
      throw new AppError('You do not have permission to resend invitations', 403);
    }

    const invitation = await prisma.tripInvitation.findFirst({
      where: {
        id: invitationId,
        tripId,
        status: { in: [InvitationStatus.PENDING, InvitationStatus.EXPIRED] },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    const updated = await prisma.tripInvitation.update({
      where: { id: invitation.id },
      data: {
        token: generateInvitationToken(),
        status: InvitationStatus.PENDING,
        expiresAt: getExpiryDate(),
      },
      include: {
        trip: {
          select: {
            id: true,
            title: true,
            description: true,
            startDate: true,
            endDate: true,
          },
        },
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    return updated;
  },

  /**
   * Get shared trips (trips where user is a collaborator, not owner)
   */
  async getSharedTrips(userId: number) {
    const collaborations = await prisma.tripCollaborator.findMany({
      where: { userId },
      include: {
        trip: {
          include: {
            user: {
              select: { id: true, username: true, email: true, avatarUrl: true },
            },
            coverPhoto: {
              select: {
                id: true,
                localPath: true,
                thumbnailPath: true,
              },
            },
            tagAssignments: {
              include: {
                tag: true,
              },
            },
          },
        },
      },
      orderBy: {
        trip: {
          startDate: 'desc',
        },
      },
    });

    return collaborations.map((c: (typeof collaborations)[number]) => ({
      ...c.trip,
      permissionLevel: c.permissionLevel,
      collaboratorSince: c.createdAt,
    }));
  },
};
