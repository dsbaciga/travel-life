import prisma from '../config/database';
import { AppError } from '../utils/errors';
import { UpdateUserSettingsInput } from '../types/userSettings.types';
import bcrypt from 'bcrypt';
import { companionService } from './companion.service';
import { invalidatePasswordVersionCache } from '../middleware/auth';
import { buildConditionalUpdateData } from '../utils/serviceHelpers';

class UserService {
  async getUserById(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        timezone: true,
        activityCategories: true,
        tripTypes: true,
        dietaryPreferences: true,
        useCustomMapStyle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  async updateUserSettings(userId: number, data: UpdateUserSettingsInput) {
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        timezone: true,
        activityCategories: true,
        tripTypes: true,
        dietaryPreferences: true,
        useCustomMapStyle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async updateImmichSettings(
    userId: number,
    data: { immichApiUrl?: string | null; immichApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        immichApiUrl: true,
        immichApiKey: true,
      },
    });

    return user;
  }

  async getImmichSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        immichApiUrl: true,
        immichApiKey: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

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
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        weatherApiKey: true,
      },
    });

    return user;
  }

  async getWeatherSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        weatherApiKey: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return {
      // Return whether key is set, but not the actual key for security
      weatherApiKeySet: !!user.weatherApiKey,
    };
  }

  async updateAviationstackSettings(
    userId: number,
    data: { aviationstackApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        aviationstackApiKey: true,
      },
    });

    return user;
  }

  async getAviationstackSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        aviationstackApiKey: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return {
      // Return whether key is set, but not the actual key for security
      aviationstackApiKeySet: !!user.aviationstackApiKey,
    };
  }

  async updateOpenrouteserviceSettings(
    userId: number,
    data: { openrouteserviceApiKey?: string | null }
  ) {
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        openrouteserviceApiKey: true,
      },
    });

    return user;
  }

  async getOpenrouteserviceSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        openrouteserviceApiKey: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return {
      // Return whether key is set, but not the actual key for security
      openrouteserviceApiKeySet: !!user.openrouteserviceApiKey,
    };
  }

  async getSmtpSettings(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        smtpProvider: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFrom: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

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
    const updateData = buildConditionalUpdateData(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        smtpProvider: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFrom: true,
      },
    });

    return user;
  }

  /**
   * Get the effective SMTP config for a user (user override > env var default)
   */
  async getEffectiveSmtpConfig(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFrom: true,
      },
    });

    // If user has SMTP configured, use it
    if (user?.smtpHost && user?.smtpUser && user?.smtpPassword) {
      return {
        host: user.smtpHost,
        port: user.smtpPort ?? 587,
        secure: user.smtpSecure ?? false,
        user: user.smtpUser,
        password: user.smtpPassword,
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
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        timezone: true,
        activityCategories: true,
        tripTypes: true,
        dietaryPreferences: true,
        useCustomMapStyle: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Update "Myself" companion name to match new username
    await companionService.updateMyselfCompanionName(userId, newUsername);

    return user;
  }

  /**
   * Rename a trip type and update all trips using the old name
   */
  async renameTripType(userId: number, oldName: string, newName: string) {
    return await prisma.$transaction(async (tx) => {
      // Get current trip types
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { tripTypes: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      const tripTypes = user.tripTypes as Array<{ name: string; emoji: string }>;
      const updatedTypes = tripTypes.map((t) =>
        t.name === oldName ? { ...t, name: newName } : t
      );

      // Update user's trip types
      await tx.user.update({
        where: { id: userId },
        data: { tripTypes: updatedTypes },
      });

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
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { tripTypes: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      const tripTypes = user.tripTypes as Array<{ name: string; emoji: string }>;
      const updatedTypes = tripTypes.filter((t) => t.name !== typeName);

      // Update user's trip types
      await tx.user.update({
        where: { id: userId },
        data: { tripTypes: updatedTypes },
      });

      // Clear trip type from all trips using it
      await tx.trip.updateMany({
        where: { userId, tripType: typeName },
        data: { tripType: null, tripTypeEmoji: null },
      });

      return updatedTypes;
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

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

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
   * Search users by email or username for travel partner selection
   * Excludes the current user from results
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
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
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
        defaultPartnerPermission: true,
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

    return {
      travelPartnerId: user.travelPartnerId,
      defaultPartnerPermission: user.defaultPartnerPermission,
      travelPartner: user.travelPartner,
    };
  }

  /**
   * Update travel partner settings
   * Implements bidirectional partnership - when User A sets User B as partner,
   * User B is also set to have User A as their partner
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

      // If setting a new partner, we need to lock multiple rows
      // Use deterministic ordering (ascending ID) to prevent deadlocks
      if (data.travelPartnerId !== undefined && data.travelPartnerId !== null) {
        // Collect all user IDs we need to lock, in ascending order to prevent deadlocks
        const primaryIds = [userId, data.travelPartnerId].sort((a, b) => a - b);

        // Lock primary users (current user and new partner) in deterministic order
        const lockedUsers = new Map<number, { id: number; travel_partner_id: number | null }>();
        for (const id of primaryIds) {
          const user = await lockAndFetchUser(id);
          if (!user) {
            throw new AppError(id === userId ? 'User not found' : 'Partner user not found', 404);
          }
          lockedUsers.set(id, user);
        }

        const currentUser = lockedUsers.get(userId)!;
        const partner = lockedUsers.get(data.travelPartnerId)!;

        // Collect any additional users we need to lock (old partners)
        const additionalLockIds: number[] = [];
        if (currentUser.travel_partner_id !== null &&
            currentUser.travel_partner_id !== data.travelPartnerId &&
            !lockedUsers.has(currentUser.travel_partner_id)) {
          additionalLockIds.push(currentUser.travel_partner_id);
        }
        if (partner.travel_partner_id !== null &&
            partner.travel_partner_id !== userId &&
            !lockedUsers.has(partner.travel_partner_id)) {
          additionalLockIds.push(partner.travel_partner_id);
        }

        // Lock additional users in ascending order
        for (const id of additionalLockIds.sort((a, b) => a - b)) {
          await lockAndFetchUser(id);
        }

        // Now perform all updates - all necessary locks are held

        // Clear current user's old partner if different
        if (currentUser.travel_partner_id !== null && currentUser.travel_partner_id !== data.travelPartnerId) {
          await tx.user.update({
            where: { id: currentUser.travel_partner_id },
            data: { travelPartnerId: null },
          });
        }

        // Clear new partner's old partner if different
        if (partner.travel_partner_id !== null && partner.travel_partner_id !== userId) {
          await tx.user.update({
            where: { id: partner.travel_partner_id },
            data: { travelPartnerId: null },
          });
        }

        // Update current user to point to new partner (with their permission preference)
        await tx.user.update({
          where: { id: userId },
          data: {
            travelPartnerId: data.travelPartnerId,
            ...(data.defaultPartnerPermission && { defaultPartnerPermission: data.defaultPartnerPermission }),
          },
        });

        // Update new partner to point back to current user
        // Note: Partner keeps their existing permission preference
        // We do NOT propagate the requesting user's permission to the partner
        await tx.user.update({
          where: { id: data.travelPartnerId },
          data: {
            travelPartnerId: userId,
          },
        });
      } else if (data.travelPartnerId === null) {
        // Clearing the partnership - lock both users in ascending order
        const currentUser = await lockAndFetchUser(userId);
        if (!currentUser) {
          throw new AppError('User not found', 404);
        }

        if (currentUser.travel_partner_id) {
          // Lock users in deterministic order
          const idsToLock = [userId, currentUser.travel_partner_id].sort((a, b) => a - b);
          for (const id of idsToLock) {
            if (id !== userId) { // Current user already locked
              await lockAndFetchUser(id);
            }
          }

          // Clear both sides
          await tx.user.update({
            where: { id: userId },
            data: { travelPartnerId: null },
          });
          await tx.user.update({
            where: { id: currentUser.travel_partner_id },
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
          await tx.user.update({
            where: { id: userId },
            data: { defaultPartnerPermission: data.defaultPartnerPermission },
          });
        }
      }

      // Return updated settings
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          travelPartnerId: true,
          defaultPartnerPermission: true,
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

      return {
        travelPartnerId: updatedUser?.travelPartnerId ?? null,
        defaultPartnerPermission: updatedUser?.defaultPartnerPermission ?? 'edit',
        travelPartner: updatedUser?.travelPartner ?? null,
      };
    }, {
      // Use serializable isolation level for maximum consistency
      isolationLevel: 'Serializable',
    });
  }
}

export default new UserService();
