import prisma from '../config/database';
import { AppError } from '../utils/errors';
import logger from '../config/logger';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config';
import { emailService } from './email.service';
import userService from './user.service';
import type { SendUserInvitationInput, AcceptInvitationInput } from '../types/userInvitation.types';
import { UserInvitationStatusValues } from '../types/userInvitation.types';

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

export const userInvitationService = {
  /**
   * Send an invitation to join the application
   */
  async sendInvitation(userId: number, data: SendUserInvitationInput) {
    // Get the inviting user
    const invitingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!invitingUser) {
      throw new AppError('User not found', 404);
    }

    // Check if user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('Unable to send invitation to the provided email address', 400);
    }

    const token = generateInvitationToken();
    const expiresAt = getExpiryDate();

    // Use a transaction to atomically check for existing invitation and create/update
    // This prevents race conditions where two concurrent requests could both find no
    // existing invitation and both create new ones
    const invitation = await prisma.$transaction(async (tx) => {
      const existingInvitation = await tx.userInvitation.findFirst({
        where: {
          email: data.email.toLowerCase(),
          status: UserInvitationStatusValues.PENDING,
        },
      });

      if (existingInvitation) {
        // Update existing invitation with new token and expiry
        return tx.userInvitation.update({
          where: { id: existingInvitation.id },
          data: {
            invitedByUserId: userId,
            token,
            message: data.message || null,
            expiresAt,
          },
          include: {
            invitedBy: {
              select: { id: true, username: true, email: true },
            },
          },
        });
      } else {
        // Create new invitation
        return tx.userInvitation.create({
          data: {
            invitedByUserId: userId,
            email: data.email.toLowerCase(),
            token,
            message: data.message || null,
            expiresAt,
          },
          include: {
            invitedBy: {
              select: { id: true, username: true, email: true },
            },
          },
        });
      }
    });

    // Send the invitation email (use per-user SMTP if configured, otherwise global)
    const acceptUrl = `${config.frontendUrl}/accept-invite?token=${token}`;
    const smtpOverride = await userService.getEffectiveSmtpConfig(userId) ?? undefined;

    const emailSent = await emailService.sendUserInvitation({
      recipientEmail: data.email,
      inviterName: invitingUser.username,
      inviterEmail: invitingUser.email,
      personalMessage: data.message,
      acceptUrl,
      expiresAt,
    }, smtpOverride);

    logger.info('User invitation sent', { invitedByUserId: userId, recipientEmail: data.email, invitationId: invitation.id });

    // Log acceptUrl in development for debugging, but never return it in the response
    if (config.nodeEnv === 'development') {
      logger.info('Development - invitation acceptUrl for debugging', { acceptUrl });
    }

    return {
      ...invitation,
      emailSent,
    };
  },

  /**
   * Get invitation details by token (public endpoint)
   */
  async getInvitationByToken(token: string) {
    const invitation = await prisma.userInvitation.findUnique({
      where: { token },
      include: {
        invitedBy: {
          select: { username: true },
        },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    const isExpired = invitation.expiresAt < new Date();

    // Determine the effective status (update DB if expired)
    // Note: We update expired status on read rather than using a cron job.
    // This is intentional - it's simpler and the side effect is idempotent.
    // The tradeoff is that expired invitations aren't marked until accessed,
    // which is acceptable for this use case.
    let effectiveStatus = invitation.status;
    if (isExpired && invitation.status === UserInvitationStatusValues.PENDING) {
      await prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { status: UserInvitationStatusValues.EXPIRED },
      });
      effectiveStatus = UserInvitationStatusValues.EXPIRED;
      logger.warn('Invitation auto-expired on access', { invitationId: invitation.id });
    }

    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      status: effectiveStatus,
      invitedBy: invitation.invitedBy,
      isExpired,
      isValid: !isExpired && effectiveStatus === UserInvitationStatusValues.PENDING,
    };
  },

  /**
   * Accept an invitation and create a new user account
   */
  async acceptInvitation(data: AcceptInvitationInput) {
    // Get the invitation
    const invitation = await prisma.userInvitation.findUnique({
      where: { token: data.token },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    // Check if already responded
    if (invitation.status !== UserInvitationStatusValues.PENDING) {
      throw new AppError('Invitation is no longer valid', 400);
    }

    // Check if expired
    if (invitation.expiresAt < new Date()) {
      await prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { status: UserInvitationStatusValues.EXPIRED },
      });
      throw new AppError('Invitation has expired', 400);
    }

    // Verify email matches
    if (invitation.email.toLowerCase() !== data.email.toLowerCase()) {
      throw new AppError('Email does not match the invitation', 400);
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUsername) {
      throw new AppError('Unable to create account with the provided information', 400);
    }

    // Check if email already exists (shouldn't happen, but just in case)
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingEmail) {
      throw new AppError('Unable to create account with the provided information', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user and update invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          username: data.username,
          email: data.email.toLowerCase(),
          passwordHash,
        },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
          passwordVersion: true,
        },
      });

      // Create "Myself" companion for the new user
      await tx.travelCompanion.create({
        data: {
          userId: user.id,
          name: user.username,
          email: user.email,
          isMyself: true,
        },
      });

      // Update invitation status
      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: UserInvitationStatusValues.ACCEPTED,
          respondedAt: new Date(),
          acceptedUserId: user.id,
        },
      });

      return user;
    });

    logger.info('User invitation accepted', { invitationId: invitation.id, newUserId: result.id, email: invitation.email });

    return result;
  },

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string) {
    const invitation = await prisma.userInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new AppError('Invitation not found', 404);
    }

    if (invitation.status !== UserInvitationStatusValues.PENDING) {
      throw new AppError('Invitation is no longer valid', 400);
    }

    await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        status: UserInvitationStatusValues.DECLINED,
        respondedAt: new Date(),
      },
    });

    logger.info('User invitation declined', { invitationId: invitation.id, email: invitation.email });

    return { message: 'Invitation declined' };
  },

  /**
   * Get all invitations sent by a user with pagination
   */
  async getSentInvitations(userId: number, page: number = 1, limit: number = 20) {
    // Mark expired invitations
    await prisma.userInvitation.updateMany({
      where: {
        invitedByUserId: userId,
        status: UserInvitationStatusValues.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: UserInvitationStatusValues.EXPIRED },
    });

    const skip = (page - 1) * limit;

    const [invitations, total] = await Promise.all([
      prisma.userInvitation.findMany({
        where: {
          invitedByUserId: userId,
        },
        select: {
          id: true,
          email: true,
          status: true,
          message: true,
          expiresAt: true,
          createdAt: true,
          respondedAt: true,
          acceptedUser: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userInvitation.count({ where: { invitedByUserId: userId } }),
    ]);

    return {
      invitations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(userId: number, invitationId: number) {
    const invitation = await prisma.userInvitation.findFirst({
      where: {
        id: invitationId,
        invitedByUserId: userId,
        status: UserInvitationStatusValues.PENDING,
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found or already responded to', 404);
    }

    await prisma.userInvitation.delete({
      where: { id: invitation.id },
    });

    logger.info('User invitation cancelled', { invitationId: invitationId, cancelledByUserId: userId });

    return { message: 'Invitation cancelled' };
  },

  /**
   * Resend an invitation (generate new token and extend expiry)
   */
  async resendInvitation(userId: number, invitationId: number) {
    const invitation = await prisma.userInvitation.findFirst({
      where: {
        id: invitationId,
        invitedByUserId: userId,
        status: { in: [UserInvitationStatusValues.PENDING, UserInvitationStatusValues.EXPIRED] },
      },
    });

    if (!invitation) {
      throw new AppError('Invitation not found or cannot be resent', 404);
    }

    // Get the inviting user
    const invitingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!invitingUser) {
      throw new AppError('User not found', 404);
    }

    const token = generateInvitationToken();
    const expiresAt = getExpiryDate();

    const updated = await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        token,
        status: UserInvitationStatusValues.PENDING,
        expiresAt,
      },
      include: {
        invitedBy: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    // Send the invitation email again (use per-user SMTP if configured)
    const acceptUrl = `${config.frontendUrl}/accept-invite?token=${token}`;
    const smtpOverrideResend = await userService.getEffectiveSmtpConfig(userId) ?? undefined;

    const emailSent = await emailService.sendUserInvitation({
      recipientEmail: invitation.email,
      inviterName: invitingUser.username,
      inviterEmail: invitingUser.email,
      personalMessage: invitation.message || undefined,
      acceptUrl,
      expiresAt,
    }, smtpOverrideResend);

    logger.info('User invitation resent', { invitationId: invitationId, email: invitation.email, resentByUserId: userId });

    // Log acceptUrl in development for debugging, but never return it in the response
    if (config.nodeEnv === 'development') {
      logger.info('Development - invitation acceptUrl for debugging', { acceptUrl });
    }

    return {
      ...updated,
      emailSent,
    };
  },

  /**
   * Check if email sending is configured
   */
  isEmailConfigured(): boolean {
    return emailService.isConfigured();
  },
};
