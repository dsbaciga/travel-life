import { getFullAssetUrl } from "../lib/config";
import type { FoodLogImmichAssetInput, FoodLogPhoto } from "../types/foodLog";
import type { ImmichAsset } from "../types/immich";

/**
 * Path to load a thumbnail from. Local photos fall back to the full image when
 * there is no thumbnail; Immich photos always have a (proxied, authenticated)
 * thumbnail path. Returns null when the photo has nothing displayable.
 */
export function foodPhotoThumbPath(photo: FoodLogPhoto): string | null {
  if (photo.thumbnailPath) return photo.thumbnailPath;
  return photo.source === "local" ? photo.localPath : null;
}

/**
 * Full-size URL, or null when there is none to link to. Immich originals sit
 * behind the authenticated proxy, so they cannot be opened with a plain link.
 */
export function foodPhotoFullUrl(photo: FoodLogPhoto): string | null {
  return photo.source === "local" ? getFullAssetUrl(photo.localPath) : null;
}

/** The authenticated-proxy thumbnail path for an Immich asset, as stored on a linked photo. */
export function immichThumbPath(assetId: string): string {
  return `/api/immich/assets/${assetId}/thumbnail`;
}

/** Maps a picked Immich asset to the attach request payload. */
export function immichAssetPayload(asset: ImmichAsset): FoodLogImmichAssetInput {
  return {
    immichAssetId: asset.id,
    takenAt: asset.exifInfo?.dateTimeOriginal ?? asset.fileCreatedAt ?? null,
    latitude: asset.exifInfo?.latitude ?? null,
    longitude: asset.exifInfo?.longitude ?? null,
  };
}
