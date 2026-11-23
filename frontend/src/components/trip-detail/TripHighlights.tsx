import { useState, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import photoService from "../../services/photo.service";
import { highlightsKey, favoritePhotosKey } from "../../hooks/useFavoritePhotos";
import { useTripEditAccess } from "../../hooks/useTripEditAccess";
import EmptyState from "../EmptyState";
import { Skeleton } from "../Skeleton";

const PhotoGallery = lazy(() => import("../PhotoGallery"));

/** Upper bound the photos endpoint accepts for a single page. */
const HIGHLIGHTS_PAGE_SIZE = 1000;

interface TripHighlightsProps {
  tripId: number;
  /** Optimistic star state shared with the Photos tab gallery. */
  favoriteOverrides?: Record<number, boolean>;
  onFavoriteOverrideChange?: (photoId: number, value: boolean | undefined) => void;
}

/**
 * The trip's highlight reel: every photo the user starred, oldest first.
 * Photos are never picked automatically. With no favorites it explains how
 * to star some instead.
 */
export default function TripHighlights({
  tripId,
  favoriteOverrides,
  onFavoriteOverrideChange,
}: TripHighlightsProps) {
  const queryClient = useQueryClient();
  const { canEdit } = useTripEditAccess(tripId);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const { data, isLoading, isError } = useQuery({
    queryKey: [...highlightsKey(tripId), sortOrder],
    queryFn: () =>
      photoService.getPhotosByTrip(tripId, {
        favoritesOnly: true,
        take: HIGHLIGHTS_PAGE_SIZE,
        sortBy: "date",
        sortOrder,
      }),
  });

  // Keep the Highlights and filtered-gallery caches in step after any change
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: highlightsKey(tripId) });
    queryClient.invalidateQueries({ queryKey: favoritePhotosKey(tripId) });
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-red-600 dark:text-red-400">
        Failed to load highlights.
      </p>
    );
  }

  const photos = data?.photos ?? [];

  if (photos.length === 0) {
    return (
      <EmptyState
        icon="star"
        message="No highlights yet"
        subMessage="Tap the star on any photo, in the grid or in the full-screen viewer, to add it to this trip's highlights. Starred photos will appear here and on your public share page."
      />
    );
  }

  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PhotoGallery
        photos={photos}
        tripId={tripId}
        canEdit={canEdit}
        favoriteOverrides={favoriteOverrides}
        onFavoriteOverrideChange={onFavoriteOverrideChange}
        initialSortBy="date"
        initialSortOrder={sortOrder}
        onSortChange={(_sortBy, order) =>
          setSortOrder(order === "desc" ? "desc" : "asc")
        }
        onFavoriteChanged={refresh}
        onPhotoDeleted={refresh}
        onPhotoUpdated={refresh}
      />
    </Suspense>
  );
}
