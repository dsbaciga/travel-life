import { z } from 'zod';
import {
  optionalLatitude,
  optionalLongitude,
  optionalDatetime,
  optionalStringWithMax,
  optionalNumber,
} from '../utils/zodHelpers';

export const PhotoSource = {
  LOCAL: 'local',
  IMMICH: 'immich',
} as const;

export type PhotoSourceType = typeof PhotoSource[keyof typeof PhotoSource];

export const MediaType = {
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type MediaTypeType = typeof MediaType[keyof typeof MediaType];

export interface Photo {
  id: number;
  tripId: number;
  source: PhotoSourceType;
  mediaType: MediaTypeType;
  immichAssetId: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  duration: number | null; // Video duration in seconds
  caption: string | null;
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export interface PhotoAlbum {
  id: number;
  tripId: number;
  name: string;
  description: string | null;
  coverPhotoId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoWithDetails extends Photo {
  albums?: PhotoAlbum[];
}

// Type for photo input that may have album assignments (used in controllers)
// Note: Prisma returns Decimal for lat/lng, so we accept both number and Prisma's Decimal type
export interface PhotoWithOptionalAlbums {
  id: number;
  tripId: number;
  source: string;
  immichAssetId?: string | null;
  localPath?: string | null;
  thumbnailPath?: string | null;
  caption?: string | null;
  takenAt?: Date | null;
  latitude?: number | { toNumber(): number } | null;
  longitude?: number | { toNumber(): number } | null;
  albumAssignments?: Array<{
    album: PhotoAlbum | null;
    addedAt?: Date;
    createdAt?: Date;
  }>;
  [key: string]: unknown;
}

// Type for transformed photo output (used in controllers)
export interface TransformedPhoto extends Omit<PhotoWithOptionalAlbums, 'albumAssignments'> {
  albums?: Array<{ album: PhotoAlbum | null }>;
}

export interface AlbumWithPhotos extends PhotoAlbum {
  photos: Photo[];
  _count?: {
    photos: number;
  };
}

// Validation schemas
export const uploadPhotoSchema = z.object({
  tripId: z.number(),
  caption: z.string().max(1000).optional(),
  takenAt: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const linkImmichPhotoSchema = z.object({
  tripId: z.number(),
  immichAssetId: z.string().min(1),
  mediaType: z.enum(['image', 'video']).optional().default('image'),
  duration: z.number().int().min(0).optional().nullable(),
  caption: z.string().max(1000).optional(),
  takenAt: optionalDatetime(),
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
});

export const linkImmichPhotoBatchSchema = z.object({
  tripId: z.number(),
  assets: z.array(z.object({
    immichAssetId: z.string().min(1),
    mediaType: z.enum(['image', 'video']).optional().default('image'),
    duration: z.number().int().min(0).optional().nullable(),
    caption: z.string().max(1000).optional(),
    takenAt: optionalDatetime(),
    latitude: optionalLatitude(),
    longitude: optionalLongitude(),
  })).min(1),
});

export const updatePhotoSchema = z.object({
  caption: optionalStringWithMax(1000),
  takenAt: optionalDatetime(),
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
});

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export const createAlbumSchema = z.object({
  tripId: z.number(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  coverPhotoId: z.number().optional().nullable(),
});

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export const updateAlbumSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: optionalStringWithMax(2000),
  coverPhotoId: optionalNumber(),
});

export const addPhotosToAlbumSchema = z.object({
  photoIds: z.array(z.number()).min(1),
});

export const acceptAlbumSuggestionSchema = z.object({
  name: z.string().min(1).max(255),
  photoIds: z.array(z.number().int().positive()).min(1).max(1000),
});

// Photo sorting types
export const PhotoSortBy = {
  DATE: 'date',
  CAPTION: 'caption',
  LOCATION: 'location',
  CREATED: 'created',
} as const;

export type PhotoSortByType = typeof PhotoSortBy[keyof typeof PhotoSortBy];

export const SortOrder = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

export type SortOrderType = typeof SortOrder[keyof typeof SortOrder];

export interface PhotoQueryOptions {
  skip?: number;
  take?: number;
  sortBy?: PhotoSortByType;
  sortOrder?: SortOrderType;
}

export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
export type LinkImmichPhotoInput = z.infer<typeof linkImmichPhotoSchema>;
export type LinkImmichPhotoBatchInput = z.infer<typeof linkImmichPhotoBatchSchema>;
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
export type AddPhotosToAlbumInput = z.infer<typeof addPhotosToAlbumSchema>;
export type AcceptAlbumSuggestionInput = z.infer<typeof acceptAlbumSuggestionSchema>;
