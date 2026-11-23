import prisma from '../config/database';
import { AppError } from '../errors/errors';
import type { CreateCompanionInput, UpdateCompanionInput, LinkCompanionToTripInput } from '../types/companion.types';
import { verifyTripAccess } from '../services/_shared/tripAccess';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { config } from '../config';

const UPLOADS_ROOT = path.resolve(config.upload.dir);
const AVATAR_DIR = path.join(UPLOADS_ROOT, 'avatars');

// Ensure avatar directory exists
async function ensureAvatarDir() {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

/**
 * Resolve a stored avatarUrl to the absolute file it names, or null if it is not
 * a local avatar. A `startsWith('/uploads/avatars/')` test alone is bypassable —
 * `/uploads/avatars/../../../../etc/passwd` passes it and path.join normalises
 * the `..` only afterwards — so the resolved path is checked for containment,
 * mirroring share.service.ts:378-383.
 */
function resolveAvatarFilePath(avatarUrl: string | null): string | null {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) {
    return null;
  }
  const absolute = path.resolve(UPLOADS_ROOT, avatarUrl.slice('/uploads/'.length));
  if (!absolute.startsWith(AVATAR_DIR + path.sep)) {
    return null;
  }
  return absolute;
}

export const companionService = {
  // Create the "Myself" companion for a user
  async createMyselfCompanion(userId: number, name: string) {
    // Check if "Myself" companion already exists
    const existing = await prisma.travelCompanion.findFirst({
      where: { userId, isMyself: true },
    });

    if (existing) {
      return existing;
    }

    return await prisma.travelCompanion.create({
      data: {
        name: `Myself (${name})`,
        isMyself: true,
        linkedUserId: userId,
        userId,
      },
    });
  },

  // Get the "Myself" companion for a user
  async getMyselfCompanion(userId: number) {
    return await prisma.travelCompanion.findFirst({
      where: { userId, isMyself: true },
    });
  },

  // Update the "Myself" companion name when username changes
  async updateMyselfCompanionName(userId: number, newName: string) {
    const myselfCompanion = await prisma.travelCompanion.findFirst({
      where: { userId, isMyself: true },
    });

    if (myselfCompanion) {
      return await prisma.travelCompanion.update({
        where: { id: myselfCompanion.id },
        data: { name: `Myself (${newName})` },
      });
    }

    return null;
  },

  // Create a new companion
  async createCompanion(userId: number, data: CreateCompanionInput) {
    return await prisma.travelCompanion.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        relationship: data.relationship,
        dietaryPreferences: data.dietaryPreferences || [],
        medicalNotes: data.medicalNotes,
        allergies: data.allergies || [],
        user: {
          connect: { id: userId },
        },
      },
    });
  },

  // Get all companions for a user
  async getCompanionsByUser(userId: number) {
    return await prisma.travelCompanion.findMany({
      where: { userId },
      include: {
        _count: {
          select: { tripAssignments: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  // Get a companion by ID
  async getCompanionById(userId: number, companionId: number) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
      include: {
        tripAssignments: {
          include: {
            trip: {
              select: {
                id: true,
                title: true,
                status: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
      },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    return companion;
  },

  // Update a companion
  async updateCompanion(userId: number, companionId: number, data: UpdateCompanionInput) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    return await prisma.travelCompanion.update({
      where: { id: companionId },
      data,
    });
  },

  // Delete a companion
  async deleteCompanion(userId: number, companionId: number) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    // The "myself" companion carries the trip owner's side of expenses (as payer and as split
    // participant). Deleting it would silently drop the payer of every expense and cascade away
    // the owner's shares, so it is refused while any expense still references it.
    if (companion.isMyself) {
      const used = await prisma.tripExpense.count({
        where: {
          OR: [{ paidByCompanionId: companionId }, { splits: { some: { companionId } } }],
        },
      });
      const settled = await prisma.tripSettlement.count({
        where: { OR: [{ fromCompanionId: companionId }, { toCompanionId: companionId }] },
      });
      if (used + settled > 0) {
        throw new AppError(
          'Your "Myself" companion is used in expense payers, splits or settlement payments and cannot be deleted',
          400
        );
      }
    }

    await prisma.travelCompanion.delete({
      where: { id: companionId },
    });
  },

  // Link a companion to a trip
  async linkCompanionToTrip(userId: number, data: LinkCompanionToTripInput) {
    // Verify user owns the trip
    await verifyTripAccess(userId, data.tripId);

    // Verify user owns the companion
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: data.companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    // Check if link already exists
    const existingLink = await prisma.tripCompanion.findFirst({
      where: {
        tripId: data.tripId,
        companionId: data.companionId,
      },
    });

    if (existingLink) {
      throw new AppError('Companion already linked to this trip', 400);
    }

    return await prisma.tripCompanion.create({
      data: {
        tripId: data.tripId,
        companionId: data.companionId,
      },
    });
  },

  // Unlink a companion from a trip
  async unlinkCompanionFromTrip(userId: number, tripId: number, companionId: number) {
    // Verify user owns the trip
    await verifyTripAccess(userId, tripId);

    const link = await prisma.tripCompanion.findFirst({
      where: {
        tripId,
        companionId,
      },
    });

    if (!link) {
      throw new AppError("That companion isn't on this trip.", 404);
    }

    await prisma.tripCompanion.delete({
      where: {
        tripId_companionId: {
          tripId,
          companionId,
        },
      },
    });
  },

  // Get all companions for a specific trip
  async getCompanionsByTrip(userId: number, tripId: number) {
    // Verify user owns the trip
    await verifyTripAccess(userId, tripId);

    const tripCompanions = await prisma.tripCompanion.findMany({
      where: { tripId },
      include: {
        companion: true,
      },
    }) as Array<{ companion: { id: number; name: string; userId: number } }>;

    return tripCompanions.map((tc) => tc.companion);
  },

  // Upload avatar for a companion
  async uploadAvatar(userId: number, companionId: number, file: Express.Multer.File) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    await ensureAvatarDir();

    // Delete old avatar if it exists and is a local file
    const oldFilePath = resolveAvatarFilePath(companion.avatarUrl);
    if (oldFilePath) {
      try {
        await fs.unlink(oldFilePath);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    // Generate unique filename. A random UUID (as photo.service.ts uses) keeps the
    // served path unguessable; `companion-<id>-<timestamp>` was enumerable.
    const filename = `${randomUUID()}.jpg`;
    const filepath = path.join(AVATAR_DIR, filename);

    // Resize and save as square avatar (256x256)
    await sharp(file.buffer)
      .resize(256, 256, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toFile(filepath);

    const avatarUrl = `/uploads/avatars/${filename}`;

    // Update companion with new avatar URL
    return await prisma.travelCompanion.update({
      where: { id: companionId },
      data: { avatarUrl },
    });
  },

  // Set Immich photo as avatar
  async setImmichAvatar(userId: number, companionId: number, immichAssetId: string) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    // Delete old avatar if it was a local file
    const oldFilePath = resolveAvatarFilePath(companion.avatarUrl);
    if (oldFilePath) {
      try {
        await fs.unlink(oldFilePath);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    // Set Immich thumbnail URL as avatar
    const avatarUrl = `/api/immich/assets/${immichAssetId}/thumbnail`;

    return await prisma.travelCompanion.update({
      where: { id: companionId },
      data: { avatarUrl },
    });
  },

  // Delete avatar for a companion
  async deleteAvatar(userId: number, companionId: number) {
    const companion = await prisma.travelCompanion.findFirst({
      where: { id: companionId, userId },
    });

    if (!companion) {
      throw new AppError("We couldn't find that companion.", 404);
    }

    // Delete file if it's a local avatar
    const filePath = resolveAvatarFilePath(companion.avatarUrl);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    return await prisma.travelCompanion.update({
      where: { id: companionId },
      data: { avatarUrl: null },
    });
  },
};
