export type PhotoSource = 'local' | 'immich';

export const MediaType = {
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type MediaType = typeof MediaType[keyof typeof MediaType];

export type Photo = {
  id: number;
  tripId: number;
  source: PhotoSource;
  mediaType: MediaType;
  immichAssetId: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  duration: number | null; // Video duration in seconds
  caption: string | null;
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
  albums?: {
    album: {
      id: number;
      name: string;
    };
  }[];
};

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export type PhotoAlbum = {
  id: number;
  tripId: number;
  name: string;
  description: string | null;
  coverPhotoId: number | null;
  /** Linked Immich album (manual sync); null when the album is not linked. */
  immichAlbumId?: string | null;
  immichAlbumSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  coverPhoto?: Photo;
  _count?: {
    photos: number;
    photoAssignments: number;
  };
};

export type AlbumWithPhotos = PhotoAlbum & {
  photos: {
    photo: Photo;
    addedAt: string;
  }[];
  hasMore?: boolean;
  total?: number;
};

export type UploadPhotoInput = {
  tripId: number;
  caption?: string;
  takenAt?: string;
  latitude?: number;
  longitude?: number;
};

export type LinkImmichPhotoInput = {
  tripId: number;
  immichAssetId: string;
  mediaType?: MediaType;
  duration?: number | null;
  caption?: string;
  takenAt?: string;
  latitude?: number;
  longitude?: number;
};

export type UpdatePhotoInput = {
  caption?: string | null;
  takenAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export type CreateAlbumInput = {
  tripId: number;
  name: string;
  description?: string;
  coverPhotoId?: number;
};

// Note: Location, Activity, and Lodging associations are handled via EntityLink system, not direct FKs
export type UpdateAlbumInput = {
  name?: string;
  description?: string | null;
  coverPhotoId?: number | null;
};

export type AddPhotosToAlbumInput = {
  photoIds: number[];
};

export type AlbumWithTrip = PhotoAlbum & {
  trip: {
    id: number;
    title: string;
    startDate: string | null;
    endDate: string | null;
    tagAssignments?: {
      tag: {
        id: number;
        name: string;
        color: string;
        textColor: string;
      };
    }[];
  };
};

export type AllAlbumsResponse = {
  albums: AlbumWithTrip[];
  totalAlbums: number;
  totalPhotos: number;
  tripCount: number;
  hasMore: boolean;
};
