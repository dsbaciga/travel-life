import { useEffect, useMemo, useState } from "react";
import type { FoodLogPhoto } from "../types/foodLog";
import type { Photo } from "../types/photo";
import { getFullAssetUrl } from "../lib/config";
import { useImmichThumbnailCache } from "../hooks/useImmichThumbnail";
import { foodPhotoThumbPath } from "../utils/foodLogPhotos";
import FoodLogThumb from "./FoodLogThumb";
import PhotoLightbox from "./PhotoLightbox";

interface FoodLogPhotoStripProps {
  photos: FoodLogPhoto[];
  /** Used to build the accessible name, e.g. the dish. */
  label: string;
}

/** Widens the food log's photo subset to the full Photo the lightbox expects. */
function toLightboxPhoto(photo: FoodLogPhoto): Photo {
  return {
    ...photo,
    tripId: 0,
    source: photo.source as Photo["source"],
    mediaType: photo.mediaType as Photo["mediaType"],
    duration: null,
    takenAt: null,
    latitude: null,
    longitude: null,
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Row of small thumbnails. Clicking one opens it in the same lightbox the trip
 * photo gallery uses (zoom, arrow-key navigation between this entry's photos).
 */
export default function FoodLogPhotoStrip({ photos, label }: FoodLogPhotoStripProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { cache, loadThumbnails } = useImmichThumbnailCache();

  const shown = useMemo(
    () =>
      photos
        .map((photo) => ({ photo, thumb: foodPhotoThumbPath(photo) }))
        .filter((p): p is typeof p & { thumb: string } => p.thumb !== null),
    [photos]
  );
  const lightboxPhotos = useMemo(() => shown.map((s) => toLightboxPhoto(s.photo)), [shown]);

  // Immich images need an authenticated fetch; load them once the lightbox opens.
  useEffect(() => {
    if (selectedId !== null) loadThumbnails(lightboxPhotos);
    // loadThumbnails is recreated each render; keying on the selection is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, lightboxPhotos]);

  if (shown.length === 0) return null;

  const selected = lightboxPhotos.find((p) => p.id === selectedId) ?? null;

  const getPhotoUrl = (photo: Photo): string | null => {
    if (photo.source === "local") {
      return getFullAssetUrl(photo.localPath ?? photo.thumbnailPath);
    }
    return cache[photo.id] || null;
  };

  return (
    <>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Photos of ${label}`}>
        {shown.map(({ photo, thumb }, i) => {
          const alt = photo.caption || `${label}, photo ${i + 1}`;
          return (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setSelectedId(photo.id)}
                aria-label={`View ${alt}`}
                className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-gold/50"
              >
                <FoodLogThumb thumbnailPath={thumb} source={photo.source} alt={alt} />
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <PhotoLightbox
          photo={selected}
          photos={lightboxPhotos}
          getPhotoUrl={getPhotoUrl}
          onClose={() => setSelectedId(null)}
          onNavigate={(p) => setSelectedId(p.id)}
        />
      )}
    </>
  );
}
