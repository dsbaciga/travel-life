import { Request, Response, NextFunction } from 'express';
import { userInvitationService } from '../services/userInvitation.service';
import userService from '../services/user.service';
import { sendUserInvitationSchema, acceptInvitationSchema } from '../types/userInvitation.types';
import { AppError } from '../utils/errors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export const userInvitationController = {
  /**
   * Send an invitation to join the application
   * POST /api/user-invitations
   */
  async sendInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const validatedData = sendUserInvitationSchema.parse(req.body);
      const invitation = await userInvitationService.sendInvitation(userId, validatedData);

      res.status(201).json({
        status: 'success',
        data: invitation,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get invitation details by token (public endpoint)
   * GET /api/user-invitations/token/:token
   */
  async getInvitationByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const invitation = await userInvitationService.getInvitationByToken(token);

      res.json({
        status: 'success',
        data: invitation,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Accept an invitation and create account
   * POST /api/user-invitations/accept
   */
  async acceptInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = acceptInvitationSchema.parse(req.body);
      const user = await userInvitationService.acceptInvitation(validatedData);

      // Generate tokens for the new user
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
      );

      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
      );

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        domain: config.cookie.domain,
        path: config.cookie.path,
        maxAge: config.cookie.maxAge,
      });

      // Set CSRF token as accessible cookie for frontend
      // IMPORTANT: Must use 'csrf-token' (hyphen) to match CSRF_COOKIE_NAME in utils/csrf.ts
      const csrfToken = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', csrfToken, {
        httpOnly: false,
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        domain: config.cookie.domain,
        path: config.cookie.path,
        maxAge: config.cookie.maxAge,
      });

      res.status(201).json({
        status: 'success',
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Decline an invitation
   * POST /api/user-invitations/decline/:token
   */
  async declineInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      const result = await userInvitationService.declineInvitation(token);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all invitations sent by the current user
   * GET /api/user-invitations?page=1&limit=20
   */
  async getSentInvitations(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      // Parse pagination params with defaults
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

      const result = await userInvitationService.getSentInvitations(userId, page, limit);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cancel a pending invitation
   * DELETE /api/user-invitations/:invitationId
   */
  async cancelInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const invitationId = parseInt(req.params.invitationId, 10);
      if (isNaN(invitationId)) {
        throw new AppError('Invalid invitation ID', 400);
      }

      const result = await userInvitationService.cancelInvitation(userId, invitationId);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Resend an invitation
   * POST /api/user-invitations/:invitationId/resend
   */
  async resendInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      const invitationId = parseInt(req.params.invitationId, 10);
      if (isNaN(invitationId)) {
        throw new AppError('Invalid invitation ID', 400);
      }

      const invitation = await userInvitationService.resendInvitation(userId, invitationId);

      res.json({
        status: 'success',
        data: invitation,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Check if email is configured
   * GET /api/user-invitations/email-status
   */
  async getEmailStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Authentication required', 401);
      }

      // Check both global (env var) SMTP and per-user SMTP settings
      const globalConfigured = userInvitationService.isEmailConfigured();
      const userSmtpConfig = await userService.getEffectiveSmtpConfig(userId);
      const isConfigured = globalConfigured || !!userSmtpConfig;

      res.json({
        status: 'success',
        data: {
          emailConfigured: isConfigured,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
