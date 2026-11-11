import { getFullAssetUrl } from "../lib/config";
import type { FoodLogPhoto } from "../types/foodLog";

/**
 * Resolves a food log photo to displayable URLs.
 *
 * Local photos resolve straight to a file URL. Immich-backed photos need an
 * authenticated fetch, which the food log does not do, so they return null and
 * are skipped by the UI.
 */
export function foodPhotoUrls(photo: FoodLogPhoto): { thumb: string; full: string } | null {
  if (photo.source !== "local") return null;
  const full = getFullAssetUrl(photo.localPath);
  const thumb = getFullAssetUrl(photo.thumbnailPath) ?? full;
  return full && thumb ? { thumb, full } : null;
}
