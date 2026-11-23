import { Request, Response, NextFunction } from 'express';
import { userInvitationService } from '../services/userInvitation.service';
import userService from '../services/user.service';
import { sendUserInvitationSchema, acceptInvitationSchema } from '../types/userInvitation.types';
import { AppError } from '../errors/errors';
import { generateAccessToken, generateRefreshToken } from '../auth/jwt';
import { setRefreshTokenCookie } from '../http/cookies';
import { generateCsrfToken, setCsrfCookie } from '../security/csrf';
import { config } from '../config';

/**
 * SSO-only mode is only honored while OIDC is enabled (lockout guard).
 * Mirrors the guard in auth.controller.ts — kept identical on purpose.
 */
const passwordAuthDisabled = (): boolean =>
  config.auth.passwordLoginDisabled && config.oidc.enabled;

export const userInvitationController = {
  /**
   * Send an invitation to join the application
   * POST /api/user-invitations
   */
  async sendInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError('Sign in to continue.', 401);
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
      // Accepting an invitation creates a password-backed account and hands out
      // a full session, so it must honor SSO-only mode exactly like
      // register/login do — otherwise it is a bypass of DISABLE_PASSWORD_LOGIN.
      if (passwordAuthDisabled()) {
        throw new AppError('Password sign-up is turned off on this server. Use single sign-on.', 403);
      }

      const validatedData = acceptInvitationSchema.parse(req.body);
      const user = await userInvitationService.acceptInvitation(validatedData);

      // Mint via the canonical helpers so the payload (including the `id` claim)
      // and signing options cannot drift from auth/jwt.ts.
      const tokenPayload = {
        id: user.id,
        userId: user.id,
        email: user.email,
        passwordVersion: user.passwordVersion ?? 0,
      };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Set refresh token as httpOnly cookie (shared helper keeps options in sync)
      setRefreshTokenCookie(res, refreshToken);

      // Set CSRF token as accessible cookie for frontend.
      // Must go through setCsrfCookie so the token is bound to the session just
      // established above (see security/csrf.ts).
      setCsrfCookie(res, generateCsrfToken());

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
        throw new AppError('Sign in to continue.', 401);
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
        throw new AppError('Sign in to continue.', 401);
      }

      const invitationId = parseInt(req.params.invitationId, 10);
      if (isNaN(invitationId)) {
        throw new AppError("That invitation link isn't valid.", 400);
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
        throw new AppError('Sign in to continue.', 401);
      }

      const invitationId = parseInt(req.params.invitationId, 10);
      if (isNaN(invitationId)) {
        throw new AppError("That invitation link isn't valid.", 400);
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
        throw new AppError('Sign in to continue.', 401);
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
