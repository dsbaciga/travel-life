export interface ImmichAsset {
  id: string;
  deviceAssetId: string;
  ownerId: string;
  deviceId: string;
  type: 'IMAGE' | 'VIDEO';
  originalPath: string;
  originalFileName: string;
  resized: boolean;
  thumbhash: string | null;
  fileCreatedAt: string;
  fileModifiedAt: string;
  updatedAt: string;
  isFavorite: boolean;
  isArchived: boolean;
  // Documented as a "HH:MM:SS.sss" string, but some server versions/endpoints
  // have been observed returning it as a plain number of seconds.
  duration: string | number | null;
  thumbnailUrl?: string;
  fileUrl?: string;
  /** Set by the server when the browse request named a trip and the asset is already on it. */
  alreadyLinked?: boolean;
  exifInfo?: {
    latitude?: number;
    longitude?: number;
    dateTimeOriginal?: string;
    make?: string;
    model?: string;
    lensModel?: string;
    fNumber?: number;
    focalLength?: number;
    iso?: number;
    exposureTime?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface ImmichAlbum {
  id: string;
  ownerId: string;
  albumName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  albumThumbnailAssetId: string | null;
  shared: boolean;
  assets: ImmichAsset[];
  assetCount: number;
}

export interface ImmichSettings {
  immichApiUrl: string | null;
  immichApiKeySet: boolean;
  immichConfigured: boolean;
}

export interface ImmichConnectionTest {
  success: boolean;
  connected: boolean;
  message: string;
}

/** Server-side filters for browsing the Immich library. Dates are calendar days (YYYY-MM-DD). */
export interface ImmichFilters {
  dateFrom?: string;
  dateTo?: string;
  /** IANA zone the dates are read in; the server falls back to the user's zone. */
  timezone?: string;
  isFavorite?: boolean;
  type?: 'IMAGE' | 'VIDEO';
  albumId?: string;
  text?: string;
}

export interface ImmichBulkPreview {
  matching: number;
  alreadyLinked: number;
  toLink: number;
  capped: boolean;
  cap: number;
  pageSize: number;
  pages: number;
}

export interface ImmichBulkPageResult {
  linked: number;
  alreadyLinked: number;
  failed: number;
  errors: string[];
  nextPage: number | null;
}

export interface ImmichBulkSummary {
  linked: number;
  alreadyLinked: number;
  failed: number;
  errors: string[];
  /** True when the user stopped the import before it finished. */
  stopped: boolean;
}

export interface ImmichAlbumLink {
  id: number;
  immichAlbumId: string | null;
  immichAlbumSyncedAt: string | null;
}

export interface ImmichAlbumSyncResult {
  immichAlbumName: string;
  immichAssetCount: number;
  newlyLinked: number;
  addedToAlbum: number;
  alreadyInAlbum: number;
  failed: number;
  errors: string[];
  notInImmichAlbum: number | null;
  capped: boolean;
  syncedAt: string;
}

export interface ImmichAlbumExportPreview {
  albumName: string;
  immichAssetCount: number;
  skippedUploaded: number;
  linkedImmichAlbumId: string | null;
  willCreate: boolean;
}

export interface ImmichAlbumExportResult {
  immichAlbumId: string;
  created: boolean;
  added: number;
  alreadyInAlbum: number;
  failed: Array<{ id: string; error: string }>;
  skippedUploaded: number;
}
