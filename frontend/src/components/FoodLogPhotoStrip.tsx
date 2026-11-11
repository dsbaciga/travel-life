import type { FoodLogPhoto } from "../types/foodLog";
import { foodPhotoUrls } from "../utils/foodLogPhotos";

interface FoodLogPhotoStripProps {
  photos: FoodLogPhoto[];
  /** Used to build the accessible name, e.g. the dish. */
  label: string;
}

/** Row of small thumbnails; each opens the full-size image in a new tab. */
export default function FoodLogPhotoStrip({ photos, label }: FoodLogPhotoStripProps) {
  const shown = photos
    .map((photo) => ({ photo, urls: foodPhotoUrls(photo) }))
    .filter((p): p is { photo: FoodLogPhoto; urls: { thumb: string; full: string } } => p.urls !== null);
  if (shown.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Photos of ${label}`}>
      {shown.map(({ photo, urls }, i) => (
        <li key={photo.id}>
          <a href={urls.full} target="_blank" rel="noopener noreferrer">
            <img
              src={urls.thumb}
              alt={photo.caption || `${label}, photo ${i + 1}`}
              loading="lazy"
              className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
