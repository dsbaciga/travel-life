import { Request, Response } from 'express';
import userService from '../services/user.service';
import { updateUserSettingsSchema } from '../types/userSettings.types';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';
import { emailService } from '../services/email.service';
import { validateUrlNotInternal } from '../utils/urlValidation';
import { AppError } from '../utils/errors';
import logger from '../config/logger';

const immichSettingsSchema = z.object({
  immichApiUrl: z.string().url().optional().nullable(),
  immichApiKey: z.string().min(1).optional().nullable(),
});

const weatherSettingsSchema = z.object({
  weatherApiKey: z.string().min(1).optional().nullable(),
});

const aviationstackSettingsSchema = z.object({
  aviationstackApiKey: z.string().min(1).optional().nullable(),
});

const openrouteserviceSettingsSchema = z.object({
  openrouteserviceApiKey: z.string().min(1).optional().nullable(),
});

const smtpSettingsSchema = z.object({
  smtpProvider: z.string().min(1).optional().nullable(),
  smtpHost: z.string().min(1).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional().nullable(),
  smtpUser: z.string().min(1).optional().nullable(),
  smtpPassword: z.string().min(1).optional().nullable(),
  smtpFrom: z.string().min(1).optional().nullable(),
});

const updateUsernameSchema = z.object({
  username: z.string().min(3).max(50),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

const searchUsersQuerySchema = z.object({
  query: z.string().min(3, 'Search query must be at least 3 characters'),
});

const travelPartnerSettingsSchema = z.object({
  travelPartnerId: z.number().int().positive().optional().nullable(),
  defaultPartnerPermission: z.enum(['view', 'edit', 'admin']).optional(),
});

export const userController = {
  getMe: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const user = await userService.getUserById(userId);
    res.json({ status: 'success', data: user });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = updateUserSettingsSchema.parse(req.body);
    const user = await userService.updateUserSettings(userId, data);
    res.json({ status: 'success', data: user });
  }),

  updateImmichSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = immichSettingsSchema.parse(req.body);

    // Enforce HTTPS for public/external Immich URLs.
    // HTTP is only allowed for local/private network addresses (development use).
    if (data.immichApiUrl) {
      const url = new URL(data.immichApiUrl);
      const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
                      url.hostname.startsWith('192.168.') ||
                      url.hostname.startsWith('10.') ||
                      /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) ||
                      url.hostname.endsWith('.local');
      if (url.protocol !== 'https:' && !isLocal) {
        throw new AppError('Immich URL must use HTTPS for non-local connections', 400);
      }
      if (url.protocol !== 'https:' && isLocal) {
        logger.warn('Immich URL uses HTTP on local network — API key may be transmitted insecurely', {
          host: url.hostname,
        });
      }
    }

    // SSRF validation: ensure the Immich URL doesn't point to internal/private IPs
    if (data.immichApiUrl) {
      await validateUrlNotInternal(data.immichApiUrl);
    }

    const user = await userService.updateImmichSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'Immich settings updated successfully',
        immichConfigured: !!(user.immichApiUrl && user.immichApiKey),
      },
    });
  }),

  getImmichSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getImmichSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateWeatherSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = weatherSettingsSchema.parse(req.body);
    const user = await userService.updateWeatherSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'Weather API key updated successfully',
        weatherApiKeySet: !!user.weatherApiKey,
      },
    });
  }),

  getWeatherSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getWeatherSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateAviationstackSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = aviationstackSettingsSchema.parse(req.body);
    const user = await userService.updateAviationstackSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'Aviationstack API key updated successfully',
        aviationstackApiKeySet: !!user.aviationstackApiKey,
      },
    });
  }),

  getAviationstackSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getAviationstackSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateOpenrouteserviceSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = openrouteserviceSettingsSchema.parse(req.body);
    const user = await userService.updateOpenrouteserviceSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'OpenRouteService API key updated successfully',
        openrouteserviceApiKeySet: !!user.openrouteserviceApiKey,
      },
    });
  }),

  getOpenrouteserviceSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getOpenrouteserviceSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateUsername: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = updateUsernameSchema.parse(req.body);
    const user = await userService.updateUsername(userId, data.username);
    res.json({
      status: 'success',
      data: {
        message: 'Username updated successfully',
        username: user.username,
      },
    });
  }),

  updatePassword: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = updatePasswordSchema.parse(req.body);
    await userService.updatePassword(userId, data.currentPassword, data.newPassword);
    res.json({
      status: 'success',
      data: {
        message: 'Password updated successfully',
      },
    });
  }),

  searchUsers: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { query } = searchUsersQuerySchema.parse(req.query);
    const users = await userService.searchUsers(userId, query);
    res.json({ status: 'success', data: users });
  }),

  getTravelPartnerSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getTravelPartnerSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  renameTripType: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { oldName, newName } = z.object({
      oldName: z.string().min(1),
      newName: z.string().min(1),
    }).parse(req.body);
    const updatedTypes = await userService.renameTripType(userId, oldName, newName);
    res.json({
      success: true,
      message: 'Trip type renamed successfully',
      tripTypes: updatedTypes,
    });
  }),

  deleteTripType: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const typeName = decodeURIComponent(req.params.typeName);
    const updatedTypes = await userService.deleteTripType(userId, typeName);
    res.json({
      success: true,
      message: 'Trip type deleted successfully',
      tripTypes: updatedTypes,
    });
  }),

  renameCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { oldName, newName } = z.object({
      oldName: z.string().min(1),
      newName: z.string().min(1),
    }).parse(req.body);
    const updatedCategories = await userService.renameCategory(userId, oldName, newName);
    res.json({
      success: true,
      message: 'Category renamed successfully',
      categories: updatedCategories,
    });
  }),

  deleteCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const categoryName = decodeURIComponent(req.params.categoryName);
    const updatedCategories = await userService.deleteCategory(userId, categoryName);
    res.json({
      success: true,
      message: 'Category deleted successfully',
      categories: updatedCategories,
    });
  }),

  updateTravelPartnerSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = travelPartnerSettingsSchema.parse(req.body);
    const settings = await userService.updateTravelPartnerSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'Travel partner settings updated successfully',
        ...settings,
      },
    });
  }),

  getSmtpSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const settings = await userService.getSmtpSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateSmtpSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = smtpSettingsSchema.parse(req.body);
    const user = await userService.updateSmtpSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'SMTP settings updated successfully',
        smtpConfigured: !!(user.smtpHost && user.smtpUser && user.smtpPassword),
      },
    });
  }),

  testSmtpSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const user = await userService.getUserById(userId);

    // Try user-level SMTP config first, then fall back to global
    const userSmtp = await userService.getEffectiveSmtpConfig(userId);
    const result = await emailService.sendTestEmail(user.email, userSmtp ?? undefined);

    if (result) {
      res.json({
        status: 'success',
        data: { message: `Test email sent to ${user.email}` },
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Failed to send test email. Check your SMTP settings.',
      });
    }
  }),
};
