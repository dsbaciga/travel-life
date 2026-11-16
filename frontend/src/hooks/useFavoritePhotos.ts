import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import photoService from "../services/photo.service";
import type { Photo } from "../types/photo";

/** Query key prefix for server-filtered favorites lists (all scopes, sorts, pages). */
export const favoritePhotosKey = (tripId: number) =>
  ["photos", "favorites", tripId] as const;

/** Query key prefix for the trip Highlights view. */
export const highlightsKey = (tripId: number) =>
  ["photos", "highlights", tripId] as const;

/** Which photos the gallery is scoped to: the whole trip, unsorted, or one album. */
export type FavoritesScope = "all" | "unsorted" | { albumId: number };

const PAGE_SIZE = 40;

function pageNumbersFor(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > 3) pages.push("ellipsis");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

interface UseFavoritePhotosOptions {
  tripId: number;
  scope: FavoritesScope;
  sortBy: string;
  sortOrder: string;
  /** The query only runs while the Favorites filter is on. */
  enabled: boolean;
}

/**
 * Server-side, paged list of starred photos for a trip, unsorted bucket, or
 * album, in the gallery's current sort. Uses its own query key, separate from
 * the unfiltered photo list and from Highlights, so the three can be
 * invalidated independently (see `favoritePhotosKey` / `highlightsKey`).
 */
export function useFavoritePhotos({
  tripId,
  scope,
  sortBy,
  sortOrder,
  enabled,
}: UseFavoritePhotosOptions) {
  const [page, setPage] = useState(1);
  const scopeKey = scope === "all" || scope === "unsorted" ? scope : `album-${scope.albumId}`;

  const query = useQuery({
    queryKey: [...favoritePhotosKey(tripId), scopeKey, sortBy, sortOrder, page],
    queryFn: async (): Promise<{ photos: Photo[]; total: number }> => {
      const options = {
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        sortBy,
        sortOrder,
        favoritesOnly: true,
      };
      if (scope === "all") {
        const result = await photoService.getPhotosByTrip(tripId, options);
        return { photos: result.photos, total: result.total };
      }
      if (scope === "unsorted") {
        const result = await photoService.getUnsortedPhotosByTrip(tripId, options);
        return { photos: result.photos, total: result.total };
      }
      const result = await photoService.getAlbumById(scope.albumId, options);
      return { photos: result.photos.map((p) => p.photo), total: result.total ?? 0 };
    },
    enabled,
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const goToPage = useCallback(
    (next: number) => {
      if (next >= 1 && next <= Math.max(totalPages, 1)) setPage(next);
    },
    [totalPages]
  );
  const resetPage = useCallback(() => setPage(1), []);
  const pageNumbers = useMemo(() => pageNumbersFor(page, totalPages), [page, totalPages]);

  return {
    photos: query.data?.photos ?? [],
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    currentPage: page,
    totalPages,
    pageNumbers,
    pageSize: PAGE_SIZE,
    rangeStart: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
    rangeEnd: Math.min(page * PAGE_SIZE, total),
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    goToPage,
    nextPage: () => goToPage(page + 1),
    previousPage: () => goToPage(page - 1),
    resetPage,
  };
}
