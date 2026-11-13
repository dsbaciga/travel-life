import { useImmichThumbnail } from "../hooks/useImmichThumbnail";

interface FoodLogThumbProps {
  thumbnailPath: string | null;
  /** 'local' loads directly; 'immich' is fetched with auth into a blob URL. */
  source: string;
  alt: string;
  className?: string;
}

const DEFAULT_CLASS =
  "h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-dusk-700";

/**
 * A food photo thumbnail for either kind of photo. Immich thumbnails need an
 * authenticated fetch, which `useImmichThumbnail` handles (and cleans up).
 * While loading, or if the fetch fails, a neutral placeholder keeps the layout stable.
 */
export default function FoodLogThumb({
  thumbnailPath,
  source,
  alt,
  className = DEFAULT_CLASS,
}: FoodLogThumbProps) {
  const url = useImmichThumbnail(thumbnailPath, source);

  if (!url) {
    return (
      <div
        role="img"
        aria-label={`${alt} (not loaded)`}
        className={`${className} bg-gray-100 dark:bg-dusk-800`}
      />
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}
