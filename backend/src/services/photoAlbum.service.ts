import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../utils/errors';
import {
  CreateAlbumInput,
  UpdateAlbumInput,
  AddPhotosToAlbumInput,
  PhotoQueryOptions,
  PhotoSortBy,
  SortOrder,
} from '../types/photo.types';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission, convertDecimals, cleanupEntityLinks } from '../utils/serviceHelpers';
import { WithOptionalCoordinates } from '../types/prisma-helpers';

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs

// Helper function to convert Decimal fields in photo objects
function convertPhotoDecimals<T extends WithOptionalCoordinates>(photo: T): T;
function convertPhotoDecimals<T extends WithOptionalCoordinates>(photo: T | null): T | null;
function convertPhotoDecimals<T extends WithOptionalCoordinates>(photo: T | undefined): T | undefined;
function convertPhotoDecimals<T extends WithOptionalCoordinates>(photo: T | null | undefined): T | null | undefined;
function convertPhotoDecimals<T extends WithOptionalCoordinates>(
  photo: T | null | undefined
): T | null | undefined {
  if (photo === null || photo === undefined) {
    return photo;
  }
  return convertDecimals(photo);
}

// Interface for albums with optional cover photo containing coordinates
interface WithOptionalCoverPhoto {
  coverPhoto?: WithOptionalCoordinates | null;
}

// Helper to convert photos in album objects
function convertAlbumPhotoDecimals<T extends WithOptionalCoverPhoto>(album: T): T {
  return convertDecimals(album);
}

// Helper function to build orderBy clause for album photo assignments based on sort options
function buildAlbumPhotoOrderBy(
  sortBy?: string,
  sortOrder?: string
): Prisma.PhotoAlbumAssignmentOrderByWithRelationInput[] {
  const order: Prisma.SortOrder = sortOrder === SortOrder.ASC ? 'asc' : 'desc';

  switch (sortBy) {
    case PhotoSortBy.DATE:
      return [{ photo: { takenAt: order } }, { photo: { createdAt: order } }];
    case PhotoSortBy.CAPTION:
      return [{ photo: { caption: order } }, { photo: { takenAt: order } }];
    case PhotoSortBy.LOCATION:
      // Fallback to date for now (location sorting requires more complex query)
      return [{ photo: { takenAt: order } }, { photo: { createdAt: order } }];
    case PhotoSortBy.CREATED:
      return [{ createdAt: order }];
    default:
      // Default: order by assignment creation (most recently added first)
      return [{ createdAt: 'desc' }];
  }
}

class PhotoAlbumService {
  /**
   * Get all albums across all trips for a user with pagination
   */
  async getAllAlbums(
    userId: number,
    options?: { skip?: number; take?: number; tagIds?: number[] }
  ) {
    const skip = options?.skip ?? 0;
    const take = options?.take ?? 30;

    const where = {
      trip: {
        userId: userId,
        ...(options?.tagIds && options.tagIds.length > 0
          ? {
              tagAssignments: {
                some: {
                  tagId: {
                    in: options.tagIds,
                  },
                },
              },
            }
          : {}),
      },
    };

    const [albums, totalAlbums] = await Promise.all([
      prisma.photoAlbum.findMany({
        where,
        include: {
          trip: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              tagAssignments: {
                select: {
                  tag: {
                    select: {
                      id: true,
                      name: true,
                      color: true,
                      textColor: true,
                    },
                  },
                },
              },
            },
          },
          coverPhoto: true,
          _count: {
            select: { photoAssignments: true },
          },
          // Note: Location, Activity, and Lodging associations are fetched via EntityLink system
          photoAssignments: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            include: {
              photo: true,
            },
          },
        },
        orderBy: [
          { trip: { startDate: 'desc' } },
          { createdAt: 'desc' },
        ],
        skip,
        take,
      }),
      prisma.photoAlbum.count({ where }),
    ]);

    // Calculate total stats
    const totalPhotos = await prisma.photoAlbumAssignment.count({
      where: {
        album: where,
      },
    });

    // Group albums by trip (for tripCount)
    const tripIds = [...new Set(albums.map((a) => a.trip.id))];

    const loadedCount = skip + albums.length;
    const hasMore = loadedCount < totalAlbums;

    // Use first photo as cover if no explicit cover photo is set
    const albumsWithCovers = albums.map((album) => {
      const { photoAssignments, ...albumWithoutAssignments } = album;
      const coverPhoto = album.coverPhoto ?? (photoAssignments.length > 0 ? photoAssignments[0].photo : null);
      return {
        ...albumWithoutAssignments,
        coverPhoto,
      };
    });

    return {
      albums: albumsWithCovers.map(convertAlbumPhotoDecimals),
      totalAlbums,
      totalPhotos,
      tripCount: tripIds.length,
      hasMore,
    };
  }

  async createAlbum(userId: number, data: CreateAlbumInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Note: Location, Activity, and Lodging associations are handled via EntityLink system after creation
    const album = await prisma.photoAlbum.create({
      data: {
        tripId: data.tripId,
        name: data.name,
        description: data.description || null,
      },
      include: {
        _count: {
          select: { photoAssignments: true },
        },
      },
    });

    return convertDecimals(album);
  }

  async getAlbumsByTrip(
    userId: number,
    tripId: number,
    options?: { skip?: number; take?: number }
  ) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PhotoAlbumService] getAlbumsByTrip called:', { userId, tripId, options });
    }

    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    if (process.env.NODE_ENV === 'development') {
      console.log('[PhotoAlbumService] verifyTripAccessWithPermission passed');
    }

    const skip = options?.skip ?? 0;
    const take = options?.take ?? 30;

    const where = { tripId };

    const [albums, totalAlbums] = await Promise.all([
      prisma.photoAlbum.findMany({
        where,
        include: {
          _count: {
            select: { photoAssignments: true },
          },
          coverPhoto: true,
          // Note: Location, Activity, and Lodging associations are fetched via EntityLink system
          photoAssignments: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            include: {
              photo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.photoAlbum.count({ where }),
    ]);

    // Calculate unsorted photos count
    // Total photos in trip minus unique photos that are in any album
    const totalPhotosCount = await prisma.photo.count({
      where: { tripId },
    });

    // Get unique photo IDs that are in albums for this trip
    const photosInAlbums = await prisma.photoAlbumAssignment.findMany({
      where: {
        album: {
          tripId,
        },
      },
      select: {
        photoId: true,
      },
      distinct: ['photoId'],
    });

    const unsortedCount = totalPhotosCount - photosInAlbums.length;

    // Use first photo as cover if no explicit cover photo is set
    const albumsWithCovers = albums.map((album) => {
      const { photoAssignments, ...albumWithoutAssignments } = album;
      const coverPhoto = album.coverPhoto ?? (photoAssignments.length > 0 ? photoAssignments[0].photo : null);
      return {
        ...albumWithoutAssignments,
        coverPhoto,
      };
    });

    const loadedCount = skip + albums.length;
    const hasMore = loadedCount < totalAlbums;

    return {
      albums: albumsWithCovers.map(convertAlbumPhotoDecimals),
      totalAlbums,
      hasMore,
      unsortedCount,
      totalCount: totalPhotosCount,
    };
  }

  async getAlbumById(
    userId: number,
    albumId: number,
    options?: PhotoQueryOptions
  ) {
    const skip = options?.skip || 0;
    const take = options?.take || 40; // Default to 40 photos per page
    const orderBy = buildAlbumPhotoOrderBy(options?.sortBy, options?.sortOrder);

    // Verify user has view permission on the album's trip
    await verifyEntityAccessWithPermission('photoAlbum', albumId, userId, 'view');

    // Note: Location, Activity, and Lodging associations are fetched via EntityLink system
    const album = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      include: {
        trip: {
          select: {
            userId: true,
          },
        },
        photoAssignments: {
          include: {
            photo: true,
          },
          orderBy,
          skip,
          take,
        },
        _count: {
          select: { photoAssignments: true },
        },
      },
    });

    if (!album) {
      throw new AppError('Album not found', 404);
    }

    const loadedCount = skip + album.photoAssignments.length;
    const totalCount = album._count.photoAssignments;

    if (process.env.NODE_ENV === 'development') {
      console.log('[PhotoAlbumService] getAlbumById pagination:', {
        albumId,
        skip,
        take,
        returnedPhotos: album.photoAssignments.length,
        loadedCount,
        totalCount,
        hasMore: loadedCount < totalCount,
      });
    }

    return {
      ...album,
      photoAssignments: album.photoAssignments.map((assignment) => ({
        ...assignment,
        photo: convertPhotoDecimals(assignment.photo),
      })),
      hasMore: loadedCount < totalCount,
      total: totalCount,
    };
  }

  async updateAlbum(userId: number, albumId: number, data: UpdateAlbumInput) {
    // Verify user has edit permission on the album's trip
    const { entity: verifiedAlbum } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'photoAlbum',
      albumId,
      userId,
      'edit'
    );

    // Validate cover photo belongs to the same trip if provided
    if (data.coverPhotoId !== undefined && data.coverPhotoId !== null) {
      const coverPhoto = await prisma.photo.findFirst({
        where: {
          id: data.coverPhotoId,
          tripId: verifiedAlbum.tripId,
        },
      });

      if (!coverPhoto) {
        throw new AppError('Cover photo not found or does not belong to trip', 404);
      }
    }

    // Note: Location, Activity, and Lodging associations are handled via EntityLink system
    const updatedAlbum = await prisma.photoAlbum.update({
      where: { id: albumId },
      data: {
        name: data.name,
        description: data.description !== undefined ? data.description : undefined,
        coverPhotoId:
          data.coverPhotoId !== undefined ? data.coverPhotoId : undefined,
      },
      include: {
        _count: {
          select: { photoAssignments: true },
        },
        coverPhoto: true,
      },
    });

    return convertAlbumPhotoDecimals(updatedAlbum);
  }

  async deleteAlbum(userId: number, albumId: number) {
    // Verify user has edit permission on the album's trip
    const { entity: verifiedAlbum } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'photoAlbum',
      albumId,
      userId,
      'edit'
    );

    // Clean up entity links and delete atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await cleanupEntityLinks(verifiedAlbum.tripId, 'PHOTO_ALBUM', albumId, tx);
      await tx.photoAlbum.delete({
        where: { id: albumId },
      });
    });

    return { success: true };
  }

  async addPhotosToAlbum(
    userId: number,
    albumId: number,
    data: AddPhotosToAlbumInput
  ) {
    // Verify user has edit permission on the album's trip
    const { entity: verifiedAlbum } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'photoAlbum',
      albumId,
      userId,
      'edit'
    );

    // Verify all photos belong to the same trip
    const photos = await prisma.photo.findMany({
      where: {
        id: { in: data.photoIds },
        tripId: verifiedAlbum.tripId,
      },
    });

    if (photos.length !== data.photoIds.length) {
      throw new AppError(
        'One or more photos not found or do not belong to trip',
        400
      );
    }

    // Add photos to album (ignore duplicates)
    await prisma.photoAlbumAssignment.createMany({
      data: data.photoIds.map((photoId) => ({
        albumId,
        photoId,
      })),
      skipDuplicates: true,
    });

    return { success: true, addedCount: photos.length };
  }

  async removePhotoFromAlbum(
    userId: number,
    albumId: number,
    photoId: number
  ) {
    // Verify user has edit permission on the album's trip
    await verifyEntityAccessWithPermission('photoAlbum', albumId, userId, 'edit');

    await prisma.photoAlbumAssignment.delete({
      where: {
        albumId_photoId: {
          albumId,
          photoId,
        },
      },
    });

    return { success: true };
  }
}

export default new PhotoAlbumService();
