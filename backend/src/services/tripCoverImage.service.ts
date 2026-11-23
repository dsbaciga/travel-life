import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { convertDecimals } from './_shared/decimalConversion';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config';
import { resolveUploadPath } from './_shared/uploadPaths';
import { dominantColor } from './tripCoverColor.service';

const UPLOADS_ROOT = path.resolve(config.upload.dir);
const COVER_DIR = path.join(UPLOADS_ROOT, 'covers');

// Cover images are decorative, so we only accept formats browsers can render directly
// after re-encoding. Validated via magic bytes, not the client-supplied mimetype.
const ALLOWED_COVER_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/tiff',
]);

const FULL_SIZE_MAX = 2400;
const THUMBNAIL_SIZE = 600;

/**
 * Validate file content using magic bytes (file signatures) rather than trusting
 * the extension or the client-supplied mimetype.
 */
async function validateImageContent(filePath: string): Promise<{ valid: boolean; mime: string | null }> {
  try {
    // Dynamic import for ESM-only file-type package
    const { fileTypeFromFile } = await import('file-type');
    const fileType = await fileTypeFromFile(filePath);

    if (!fileType) {
      return { valid: false, mime: null };
    }

    return { valid: ALLOWED_COVER_MIMES.has(fileType.mime), mime: fileType.mime };
  } catch (error) {
    console.error('[TripCoverImageService] Error validating file content:', error instanceof Error ? error.message : error);
    return { valid: false, mime: null };
  }
}

async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[TripCoverImageService] Failed to cleanup temp file ${tempPath}:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Delete cover image files from disk. Missing files are ignored — the DB row is the
 * source of truth and a partially cleaned upload should not block the update.
 */
async function deleteCoverFiles(paths: Array<string | null | undefined>): Promise<void> {
  for (const webPath of paths) {
    if (!webPath) continue;

    const absolute = resolveUploadPath(webPath);
    if (!absolute) {
      console.error(
        `[TripCoverImageService] Refusing to delete cover file outside the uploads directory: ${webPath}`
      );
      continue;
    }

    try {
      await fs.unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[TripCoverImageService] Failed to delete cover file ${webPath}:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

async function requireOwnedTrip(userId: number, tripId: number) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
    select: { id: true, coverPhotoId: true, coverImagePath: true, coverImageThumbnailPath: true },
  });

  if (!trip) {
    throw new AppError("We couldn't find that trip, or you can only view it.", 404);
  }

  return trip;
}

export const tripCoverImageService = {
  /**
   * Store an uploaded image as the trip's cover.
   *
   * The image is written to uploads/covers and referenced only by the trip row — it is
   * never inserted into the photos table, so it cannot appear in photos, memories,
   * albums, the photo map, or search results.
   *
   * Setting an uploaded cover clears coverPhotoId; the two are mutually exclusive, so
   * a real trip photo can replace this later via the normal "set as cover" flow.
   */
  async uploadCoverImage(userId: number, tripId: number, file: Express.Multer.File) {
    const tempFilePath = file.path;

    try {
      const existing = await requireOwnedTrip(userId, tripId);

      const validation = await validateImageContent(tempFilePath);
      if (!validation.valid) {
        throw new AppError(
          `Invalid file type. File content does not match an allowed image format.${validation.mime ? ` Detected: ${validation.mime}` : ''}`,
          400
        );
      }

      await fs.mkdir(COVER_DIR, { recursive: true });

      // Re-encode to JPEG so HEIC/TIFF/etc. uploads are browser-renderable and any
      // embedded metadata (including GPS/EXIF) is stripped from the stored file.
      const basename = `cover-${tripId}-${crypto.randomUUID()}`;
      const filename = `${basename}.jpg`;
      const thumbnailFilename = `thumb-${basename}.jpg`;

      await sharp(tempFilePath)
        .rotate()
        .resize(FULL_SIZE_MAX, FULL_SIZE_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(COVER_DIR, filename));

      await sharp(tempFilePath)
        .rotate()
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(path.join(COVER_DIR, thumbnailFilename));

      // Sampled from the finished thumbnail; an unreadable image just means no tint.
      const coverColor = await dominantColor(path.join(COVER_DIR, thumbnailFilename));

      const coverImagePath = `/uploads/covers/${filename}`;
      const coverImageThumbnailPath = `/uploads/covers/${thumbnailFilename}`;

      let updatedTrip;
      try {
        updatedTrip = await prisma.trip.update({
          where: { id: tripId },
          data: {
            coverImagePath,
            coverImageThumbnailPath,
            // An uploaded cover replaces a gallery-photo cover
            coverPhotoId: null,
            coverColor,
          },
          include: { coverPhoto: true },
        });
      } catch (error) {
        // Don't leave orphaned files behind if the DB write fails
        await deleteCoverFiles([coverImagePath, coverImageThumbnailPath]);
        throw error;
      }

      // Remove the previous upload only after the new one is committed
      await deleteCoverFiles([existing.coverImagePath, existing.coverImageThumbnailPath]);

      return convertDecimals(updatedTrip);
    } finally {
      await cleanupTempFile(tempFilePath);
    }
  },

  /**
   * Remove the trip's uploaded cover image and delete its files.
   */
  async deleteCoverImage(userId: number, tripId: number) {
    const existing = await requireOwnedTrip(userId, tripId);

    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: {
        coverImagePath: null,
        coverImageThumbnailPath: null,
        // The tint belongs to the cover being removed. A trip that (against the
        // exclusivity rule) still has a library cover keeps that cover's colour.
        ...(existing.coverPhotoId ? {} : { coverColor: null }),
      },
      include: { coverPhoto: true },
    });

    await deleteCoverFiles([existing.coverImagePath, existing.coverImageThumbnailPath]);

    return convertDecimals(updatedTrip);
  },

  /**
   * Delete cover image files for a trip without touching the row. Used when the trip
   * itself is being deleted (the row goes away with it) or when a gallery photo takes
   * over as the cover.
   */
  deleteCoverFilesForPaths: deleteCoverFiles,
};

export default tripCoverImageService;
