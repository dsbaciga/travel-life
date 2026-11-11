import type { FoodLogPhoto } from "../types/foodLog";
import { foodPhotoFullUrl, foodPhotoThumbPath } from "../utils/foodLogPhotos";
import FoodLogThumb from "./FoodLogThumb";

interface FoodLogPhotoStripProps {
  photos: FoodLogPhoto[];
  /** Used to build the accessible name, e.g. the dish. */
  label: string;
}

/**
 * Row of small thumbnails. Local photos open full-size in a new tab; Immich
 * photos are shown without a link because their originals need an authenticated fetch.
 */
export default function FoodLogPhotoStrip({ photos, label }: FoodLogPhotoStripProps) {
  const shown = photos
    .map((photo) => ({ photo, thumb: foodPhotoThumbPath(photo), full: foodPhotoFullUrl(photo) }))
    .filter((p): p is typeof p & { thumb: string } => p.thumb !== null);
  if (shown.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Photos of ${label}`}>
      {shown.map(({ photo, thumb, full }, i) => {
        const image = (
          <FoodLogThumb
            thumbnailPath={thumb}
            source={photo.source}
            alt={photo.caption || `${label}, photo ${i + 1}`}
          />
        );
        return (
          <li key={photo.id}>
            {full ? (
              <a href={full} target="_blank" rel="noopener noreferrer">
                {image}
              </a>
            ) : (
              image
            )}
          </li>
        );
      })}
    </ul>
  );
}
