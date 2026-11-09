import { Request, Response } from 'express';
import userService from '../services/user.service';
import { updateUserSettingsSchema } from '../types/userSettings.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { z } from 'zod';
import { emailService } from '../services/email.service';
import { validateUrlNotInternal, isLocalNetworkHostname } from '../security/urlValidation';
import { AppError } from '../errors/errors';
import { config } from '../config';
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

const llmSettingsSchema = z.object({
  llmApiKey: z.string().min(1).optional().nullable(),
  llmBaseUrl: z.string().url().optional().nullable(),
  llmModel: z.string().min(1).max(200).optional().nullable(),
});

// Keep in sync with MAPS_APPS in frontend/src/lib/mapsDeepLinks.ts.
// Null clears the preference (the UI then lists every app that fits the route).
const mapsSettingsSchema = z.object({
  preferredMapsApp: z
    .enum(['apple', 'google', 'citymapper', 'uber', 'lyft'])
    .optional()
    .nullable(),
});

// Known SMTP submission/relay ports. Allowing arbitrary ports turned the save
// and test-connection endpoints into an outbound TCP connect primitive against
// any internal host:port, with success/failure reflected back to the caller.
//
// The allowlist matters MORE now that LAN hosts are permitted below, because it
// is then the only thing bounding what can be probed — so it stays an
// allowlist, widened only to ports self-hosted relays actually listen on:
// 1025 (Mailpit/MailHog) and the 2465/2587 alternates used when 465/587 are
// taken or unavailable to an unprivileged process.
const ALLOWED_SMTP_PORTS: number[] = [25, 465, 587, 1025, 2465, 2525, 2587];
const SMTP_PORT_MESSAGE =
  'SMTP port must be one of 25, 465, 587, 1025, 2465, 2525, 2587';

/**
 * Apply the same internal-address checks the Immich and LLM handlers use to an
 * SMTP host, with the same local-network exemption: a relay on the operator's
 * own LAN is a normal self-hosted setup, and validating unconditionally
 * rejected exactly those hosts so they could be neither saved nor tested.
 */
async function validateSmtpHost(host: string): Promise<void> {
  // Hostname or IPv4 literal only — keeps credentials, ports and paths from
  // being smuggled through the host field into the URL parsed below.
  if (!/^[A-Za-z0-9._-]+$/.test(host)) {
    throw new AppError('Invalid SMTP host', 400);
  }
  if (config.security.allowPrivateIntegrationUrls && isLocalNetworkHostname(host)) return;
  await validateUrlNotInternal(`https://${host}`);
}

const smtpSettingsSchema = z.object({
  smtpProvider: z.string().min(1).optional().nullable(),
  smtpHost: z.string().min(1).optional().nullable(),
  smtpPort: z
    .number()
    .int()
    .refine((port) => ALLOWED_SMTP_PORTS.includes(port), { message: SMTP_PORT_MESSAGE })
    .optional()
    .nullable(),
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

const linkIngestSettingsSchema = z.object({
  // Extra addresses trusted to forward links. Capped so the list stays a
  // hand-maintained allowlist rather than an import of someone's contacts.
  linkIngestSenders: z.array(z.string().trim().email()).max(20),
});

export const userController = {
  getMe: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const user = await userService.getUserById(userId);
    res.json({ status: 'success', data: user });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = updateUserSettingsSchema.parse(req.body);
    const user = await userService.updateUserSettings(userId, data);
    res.json({ status: 'success', data: user });
  }),

  updateImmichSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = immichSettingsSchema.parse(req.body);

    // Enforce HTTPS for public/external Immich URLs.
    // HTTP and private/local addresses are only allowed when allowPrivateIntegrationUrls is enabled.
    if (data.immichApiUrl) {
      const url = new URL(data.immichApiUrl);
      const isLocalHost = isLocalNetworkHostname(url.hostname);
      const allowLocal = config.security.allowPrivateIntegrationUrls && isLocalHost;
      if (url.protocol !== 'https:' && !isLocalHost) {
        throw new AppError('Immich URL must use HTTPS for non-local connections', 400);
      }

      // SSRF validation: ensure the Immich URL doesn't point to internal/private IPs.
      // Only skipped for local addresses when allowPrivateIntegrationUrls is true.
      if (!allowLocal) {
        await validateUrlNotInternal(data.immichApiUrl);
      } else if (url.protocol !== 'https:') {
        logger.warn('Immich URL uses HTTP on local network — API key may be transmitted insecurely', {
          host: url.hostname,
        });
      }
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
    const userId = requireUserId(req);
    const settings = await userService.getImmichSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateWeatherSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const settings = await userService.getWeatherSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateAviationstackSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const settings = await userService.getAviationstackSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateOpenrouteserviceSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const settings = await userService.getOpenrouteserviceSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateLlmSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = llmSettingsSchema.parse(req.body);

    // Validate the LLM base URL. Local addresses (localhost, 127.x, 192.168.x, etc.)
    // are only allowed to bypass SSRF validation when allowPrivateIntegrationUrls is true.
    // HTTPS is required for any non-local address to protect transmitted API keys.
    if (data.llmBaseUrl) {
      const url = new URL(data.llmBaseUrl);
      const hostname = url.hostname.toLowerCase();
      const isLocalHost = isLocalNetworkHostname(hostname);
      const allowLocal = config.security.allowPrivateIntegrationUrls && isLocalHost;
      if (url.protocol !== 'https:' && !isLocalHost) {
        throw new AppError('LLM URL must use HTTPS for non-local connections', 400);
      }
      if (!allowLocal) {
        // SSRF validation: block private IPs (unless opted in), cloud metadata, DNS rebinding, etc.
        await validateUrlNotInternal(data.llmBaseUrl);
      } else if (url.protocol !== 'https:') {
        logger.warn('LLM URL uses HTTP on local network — API key may be transmitted insecurely', {
          host: hostname,
        });
      }
    }

    const user = await userService.updateLlmSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'LLM settings updated successfully',
        llmApiKeySet: !!user.llmApiKey,
        llmBaseUrl: user.llmBaseUrl,
        llmModel: user.llmModel,
        // Configured if user has their own API key, a local base URL (no-auth),
        // or a per-user model override that will ride on top of the global env key.
        llmConfigured: !!(user.llmApiKey || user.llmBaseUrl || user.llmModel),
      },
    });
  }),

  getLlmSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const settings = await userService.getLlmSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  getMapsSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const settings = await userService.getMapsSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateMapsSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = mapsSettingsSchema.parse(req.body);
    const settings = await userService.updateMapsSettings(userId, data);
    res.json({
      status: 'success',
      data: {
        message: 'Maps app preference updated successfully',
        ...settings,
      },
    });
  }),

  getLinkIngestSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const settings = await userService.getLinkIngestSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateLinkIngestSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = linkIngestSettingsSchema.parse(req.body);
    const settings = await userService.updateLinkIngestSettings(
      userId,
      data.linkIngestSenders
    );
    res.json({ status: 'success', data: settings });
  }),

  updateUsername: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const { query } = searchUsersQuerySchema.parse(req.query);
    const users = await userService.searchUsers(userId, query);
    res.json({ status: 'success', data: users });
  }),

  getTravelPartnerSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const settings = await userService.getTravelPartnerSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  renameTripType: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const typeName = decodeURIComponent(req.params.typeName);
    const updatedTypes = await userService.deleteTripType(userId, typeName);
    res.json({
      success: true,
      message: 'Trip type deleted successfully',
      tripTypes: updatedTypes,
    });
  }),

  renameCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const categoryName = decodeURIComponent(req.params.categoryName);
    const updatedCategories = await userService.deleteCategory(userId, categoryName);
    res.json({
      success: true,
      message: 'Category deleted successfully',
      categories: updatedCategories,
    });
  }),

  updateTravelPartnerSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
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
    const userId = requireUserId(req);
    const settings = await userService.getSmtpSettings(userId);
    res.json({ status: 'success', data: settings });
  }),

  updateSmtpSettings: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = smtpSettingsSchema.parse(req.body);

    if (data.smtpHost) {
      await validateSmtpHost(data.smtpHost);
    }

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
    const userId = requireUserId(req);
    const user = await userService.getUserById(userId);

    // Try user-level SMTP config first, then fall back to global
    const userSmtp = await userService.getEffectiveSmtpConfig(userId);

    // Re-validate the stored settings before opening a connection: rows can
    // predate the save-time checks or arrive via backup restore.
    if (userSmtp) {
      await validateSmtpHost(userSmtp.host);
      if (!ALLOWED_SMTP_PORTS.includes(userSmtp.port)) {
        throw new AppError(SMTP_PORT_MESSAGE, 400);
      }
    }

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
