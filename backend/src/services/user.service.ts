import prisma from '../config/database';
import config from '../config';
import { AppError } from '../errors/errors';
import { UpdateUserSettingsInput } from '../types/userSettings.types';
import bcrypt from 'bcrypt';
import { hashPassword } from '../auth/password';
import { companionService } from './companion.service';
import { invalidatePasswordVersionCache } from '../middleware/auth';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { encryptSecret, decryptSecret } from '../security/encryption';
import {
  findUserIntegrations,
  getUserIntegrations,
  getUserPreferences,
  updateUserIntegrations,
  updateUserPreferences,
  type UserPreferencesInput,
} from './_shared/userSettings';

/**
 * The profile payload of `/users/me` and the settings updates: identity from `users`, display
 * preferences from `user_preferences`, in the field order the API has always used.
 */
function toProfile(
  user: {
    id: number;
    username: string;
    email: string;
    avatarUrl: string | null;
    timezone: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  prefs: Awaited<ReturnType<typeof getUserPreferences>>
) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    activityCategories: prefs.activityCategories,
    tripTypes: prefs.tripTypes,
    dietaryPreferences: prefs.dietaryPreferences,
    useCustomMapStyle: prefs.useCustomMapStyle,
    baseCurrency: prefs.baseCurrency,
    measurementSystem: prefs.measurementSystem,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

const PROFILE_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

class UserService {
  async getUserById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_USER_SELECT,
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return toProfile(user, await getUserPreferences(userId));
  }

  async updateUserSettings(userId: number, data: UpdateUserSettingsInput) {
    const { timezone, ...preferenceData } = buildConditionalUpdateData(data);

    // `timezone` is part of the user's identity row, everything else is a preference.
    const user = await prisma.$transaction(async (tx) => {
      if (timezone !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { timezone }, select: { id: true } });
      }
      const prefs = await updateUserPreferences(userId, preferenceData as UserPreferencesInput, tx);
      const identity = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE_USER_SELECT });
      return toProfile(identity, prefs);
    });

    return user;
  }

  async updateImmichSettings(
    userId: number,
    data: { immichApiUrl?: string | null; immichApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        immichApiKey: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  async getImmichSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      immichApiUrl: user.immichApiUrl,
      // Return whether key is set, but not the actual key for security
      immichApiKeySet: !!user.immichApiKey,
      immichConfigured: !!(user.immichApiUrl && user.immichApiKey),
    };
  }

  async updateWeatherSettings(
    userId: number,
    data: { weatherApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        weatherApiKey: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  async getWeatherSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      // Return whether key is set, but not the actual key for security
      weatherApiKeySet: !!user.weatherApiKey,
    };
  }

  async updateAviationstackSettings(
    userId: number,
    data: { aviationstackApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        aviationstackApiKey: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  async getAviationstackSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      // Return whether key is set, but not the actual key for security
      aviationstackApiKeySet: !!user.aviationstackApiKey,
    };
  }

  async updateOpenrouteserviceSettings(
    userId: number,
    data: { openrouteserviceApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        openrouteserviceApiKey: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  async getOpenrouteserviceSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      // Return whether key is set, but not the actual key for security
      openrouteserviceApiKeySet: !!user.openrouteserviceApiKey,
    };
  }

  async updateLlmSettings(
    userId: number,
    data: { llmApiKey?: string | null; llmBaseUrl?: string | null; llmModel?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        llmApiKey: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  async getLlmSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      // Never return the actual key — only whether it's set
      llmApiKeySet: !!user.llmApiKey,
      llmBaseUrl: user.llmBaseUrl,
      llmModel: user.llmModel,
      // Configured if user set a base URL (local no-auth) or an API key
      llmConfigured: !!(user.llmApiKey || user.llmBaseUrl),
    };
  }

  /**
   * The external maps/rideshare app the "Directions" deep links default to.
   * Null means "no preference" — the UI lists every app that can handle the
   * route instead of highlighting one.
   */
  async getMapsSettings(userId: number) {
    const prefs = await getUserPreferences(userId);

    return { preferredMapsApp: prefs.preferredMapsApp };
  }

  async updateMapsSettings(
    userId: number,
    data: { preferredMapsApp?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data);

    const prefs = await updateUserPreferences(userId, updateData);

    return { preferredMapsApp: prefs.preferredMapsApp };
  }

  /**
   * Extra From addresses trusted to forward links to the ingest mailbox.
   * The user's own `email` is always accepted and is returned here for display,
   * but is not part of the editable list.
   */
  async getLinkIngestSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const prefs = await getUserPreferences(userId);
    const senders = Array.isArray(prefs.linkIngestSenders)
      ? prefs.linkIngestSenders.filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : [];

    return {
      // Always accepted, shown read-only so the UI can explain the rule.
      accountEmail: user.email,
      linkIngestSenders: senders,
      // The mailbox links are forwarded TO. Server-level config, not per-user.
      ingestMailbox: config.imap.user || null,
      ingestEnabled: Boolean(config.imap.user && config.imap.password),
    };
  }

  async updateLinkIngestSettings(userId: number, senders: string[]) {
    // Normalise so matching in emailIngest.service is a plain comparison.
    const normalized = Array.from(
      new Set(
        senders
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry.length > 0)
      )
    );

    await updateUserPreferences(userId, { linkIngestSenders: normalized });

    return this.getLinkIngestSettings(userId);
  }

  async getSmtpSettings(userId: number) {
    const user = await getUserIntegrations(userId);

    return {
      smtpProvider: user.smtpProvider,
      smtpHost: user.smtpHost,
      smtpPort: user.smtpPort,
      smtpSecure: user.smtpSecure,
      smtpUser: user.smtpUser,
      smtpFrom: user.smtpFrom,
      smtpPasswordSet: !!user.smtpPassword,
      smtpConfigured: !!(user.smtpHost && user.smtpUser && user.smtpPassword),
    };
  }

  async updateSmtpSettings(
    userId: number,
    data: {
      smtpProvider?: string | null;
      smtpHost?: string | null;
      smtpPort?: number | null;
      smtpSecure?: boolean | null;
      smtpUser?: string | null;
      smtpPassword?: string | null;
      smtpFrom?: string | null;
    }
  ) {
    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        smtpPassword: encryptSecret,
      },
    });

    return updateUserIntegrations(userId, updateData);
  }

  /**
   * Get the effective SMTP config for a user (user override > env var default)
   */
  async getEffectiveSmtpConfig(userId: number) {
    // A user that no longer exists simply has no override.
    const user = await findUserIntegrations(userId);

    const smtpPassword = decryptSecret(user?.smtpPassword);

    // If user has SMTP configured, use it
    if (user?.smtpHost && user?.smtpUser && smtpPassword) {
      return {
        host: user.smtpHost,
        port: user.smtpPort ?? 587,
        secure: user.smtpSecure ?? false,
        user: user.smtpUser,
        password: smtpPassword,
        from: user.smtpFrom ?? `Travel Life <${user.smtpUser}>`,
      };
    }

    // Fall back to global env var config
    return null;
  }

  async updateUsername(userId: number, newUsername: string) {
    // Check if username is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        username: newUsername,
        id: { not: userId },
      },
    });

    if (existingUser) {
      throw new AppError('Username is already taken', 400);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: newUsername },
      select: PROFILE_USER_SELECT,
    });

    // Update "Myself" companion name to match new username
    await companionService.updateMyselfCompanionName(userId, newUsername);

    return toProfile(user, await getUserPreferences(userId));
  }

  /**
   * Rename a trip type and update all trips using the old name
   */
  async renameTripType(userId: number, oldName: string, newName: string) {
    return await prisma.$transaction(async (tx) => {
      // Get current trip types
      const prefs = await getUserPreferences(userId, tx);

      const tripTypes = prefs.tripTypes as Array<{ name: string; emoji: string }>;
      const updatedTypes = tripTypes.map((t) =>
        t.name === oldName ? { ...t, name: newName } : t
      );

      // Update user's trip types
      await updateUserPreferences(userId, { tripTypes: updatedTypes }, tx);

      // Update all trips using the old name
      await tx.trip.updateMany({
        where: { userId, tripType: oldName },
        data: { tripType: newName },
      });

      return updatedTypes;
    });
  }

  /**
   * Delete a trip type and clear it from all trips using it
   */
  async deleteTripType(userId: number, typeName: string) {
    return await prisma.$transaction(async (tx) => {
      // Get current trip types
      const prefs = await getUserPreferences(userId, tx);

      const tripTypes = prefs.tripTypes as Array<{ name: string; emoji: string }>;
      const updatedTypes = tripTypes.filter((t) => t.name !== typeName);

      // Update user's trip types
      await updateUserPreferences(userId, { tripTypes: updatedTypes }, tx);

      // Clear trip type from all trips using it
      await tx.trip.updateMany({
        where: { userId, tripType: typeName },
        data: { tripType: null, tripTypeEmoji: null },
      });

      return updatedTypes;
    });
  }

  async renameCategory(userId: number, oldName: string, newName: string) {
    return await prisma.$transaction(async (tx) => {
      const prefs = await getUserPreferences(userId, tx);

      const categories = prefs.activityCategories as Array<{ name: string; emoji: string }>;
      const updatedCategories = categories.map((c) =>
        c.name === oldName ? { ...c, name: newName } : c
      );

      // Update user's categories
      await updateUserPreferences(userId, { activityCategories: updatedCategories }, tx);

      // Update all activities using the old category name
      await tx.activity.updateMany({
        where: { category: oldName, trip: { userId } },
        data: { category: newName },
      });

      return updatedCategories;
    });
  }

  async deleteCategory(userId: number, categoryName: string) {
    return await prisma.$transaction(async (tx) => {
      const prefs = await getUserPreferences(userId, tx);

      const categories = prefs.activityCategories as Array<{ name: string; emoji: string }>;
      const updatedCategories = categories.filter((c) => c.name !== categoryName);

      // Update user's categories
      await updateUserPreferences(userId, { activityCategories: updatedCategories }, tx);

      // Clear category from all activities using it
      await tx.activity.updateMany({
        where: { category: categoryName, trip: { userId } },
        data: { category: null },
      });

      return updatedCategories;
    });
  }

  async updatePassword(userId: number, currentPassword: string, newPassword: string) {
    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password. Routed through the shared helper so the cost factor is
    // configured in exactly one place (auth/password.ts).
    const passwordHash = await hashPassword(newPassword);

    // Evict cached passwordVersion BEFORE the write so concurrent auth requests
    // cache-miss and hit the DB, reducing the window for stale re-caching.
    invalidatePasswordVersionCache(userId);

    // Update password and increment passwordVersion to invalidate existing tokens
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 },
      },
    });

    // Evict again after the write for defense-in-depth. A narrow race remains
    // where a concurrent request re-caches the old value between the two
    // invalidations; the 60s cache TTL is the ultimate safeguard.
    invalidatePasswordVersionCache(userId);
  }

  /**
   * Search users by email or username for travel partner selection.
   * Excludes the current user from results.
   *
   * SECURITY: `email` is matched on EXACT equality only (so users can find a
   * known partner by typing their full address), never `contains`. A substring
   * match let a caller confirm any address — and by extension enumerate
   * registered users — from a partial guess. Username still matches on
   * substring, which is the intended discovery affordance.
   * The response also NEVER includes the email field.
   */
  async searchUsers(userId: number, query: string) {
    // Minimum 3 characters required (matches controller and frontend validation)
    if (!query || query.length < 3) {
      return [];
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { email: { equals: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
      },
      take: 10,
    });

    return users;
  }

  /**
   * Get travel partner settings for a user
   */
  async getTravelPartnerSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        travelPartnerId: true,
        travelPartner: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const prefs = await getUserPreferences(userId);

    return {
      travelPartnerId: user.travelPartnerId,
      defaultPartnerPermission: prefs.defaultPartnerPermission,
      travelPartner: user.travelPartner,
    };
  }

  /**
   * Update travel partner settings.
   *
   * SECURITY: this writes ONLY the requesting user's own row. It used to write
   * the partnership bidirectionally, which was a privilege-escalation primitive:
   * anyone could name a victim as their partner (IDs are discoverable via
   * /api/users/search) and trip.service.ts would then auto-grant them EDIT
   * collaborator rights on every trip that victim later created, with no
   * invitation, acceptance or notification step. It also silently severed the
   * victim's existing partnership. The partnership is therefore one-directional
   * until the other user sets it from their own account.
   *
   * Uses an interactive transaction with row-level locking (SELECT FOR UPDATE)
   * to prevent TOCTOU race conditions when multiple users try to set partnerships
   * concurrently.
   *
   * Note: Each user's defaultPartnerPermission is independent - User A can have
   * 'edit' while User B has 'view'. This allows each user to control what
   * permission level their partner gets on their trips.
   */
  async updateTravelPartnerSettings(
    userId: number,
    data: { travelPartnerId?: number | null; defaultPartnerPermission?: string }
  ) {
    // Validate basic constraints before starting transaction
    if (data.travelPartnerId === userId) {
      throw new AppError('Cannot set yourself as travel partner', 400);
    }

    // Use interactive transaction with row-level locking to prevent race conditions
    return await prisma.$transaction(async (tx) => {
      // Helper to lock a user row by ID and return their data
      const lockAndFetchUser = async (id: number) => {
        const [user] = await tx.$queryRaw<Array<{ id: number; travel_partner_id: number | null }>>`
          SELECT id, travel_partner_id FROM users WHERE id = ${id} FOR UPDATE
        `;
        return user;
      };

      // If setting a new partner, lock both rows in ascending ID order to
      // prevent deadlocks. The partner row is locked (never written) purely to
      // confirm it still exists for the duration of the transaction.
      if (data.travelPartnerId !== undefined && data.travelPartnerId !== null) {
        const primaryIds = [userId, data.travelPartnerId].sort((a, b) => a - b);

        for (const id of primaryIds) {
          const user = await lockAndFetchUser(id);
          if (!user) {
            throw new AppError(id === userId ? 'User not found' : 'Partner user not found', 404);
          }
        }

        // Update current user to point to new partner (with their permission preference).
        // Only this row is touched — see the SECURITY note on this method. The
        // target's own travelPartnerId is theirs alone to set.
        await tx.user.update({
          where: { id: userId },
          data: { travelPartnerId: data.travelPartnerId },
        });
        if (data.defaultPartnerPermission) {
          await updateUserPreferences(userId, { defaultPartnerPermission: data.defaultPartnerPermission }, tx);
        }
      } else if (data.travelPartnerId === null) {
        // Clearing the partnership - only this user's side
        const currentUser = await lockAndFetchUser(userId);
        if (!currentUser) {
          throw new AppError('User not found', 404);
        }

        if (currentUser.travel_partner_id) {
          await tx.user.update({
            where: { id: userId },
            data: { travelPartnerId: null },
          });
        }
      } else {
        // Just fetching/updating current user (no partner change)
        const currentUser = await lockAndFetchUser(userId);
        if (!currentUser) {
          throw new AppError('User not found', 404);
        }

        if (data.defaultPartnerPermission !== undefined) {
          // Just updating current user's permission level - only affects THIS user
          // Each user controls their own permission level independently
          await updateUserPreferences(userId, { defaultPartnerPermission: data.defaultPartnerPermission }, tx);
        }
      }

      // Return updated settings
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          travelPartnerId: true,
          travelPartner: {
            select: {
              id: true,
              username: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      const prefs = await getUserPreferences(userId, tx);

      return {
        travelPartnerId: updatedUser?.travelPartnerId ?? null,
        defaultPartnerPermission: prefs.defaultPartnerPermission,
        travelPartner: updatedUser?.travelPartner ?? null,
      };
    }, {
      // Use serializable isolation level for maximum consistency
      isolationLevel: 'Serializable',
    });
  }

}

export default new UserService();
