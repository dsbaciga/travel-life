import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import immichService from "../services/immich.service";
import type {
  ImmichAsset,
  ImmichAlbum,
  ImmichFilters,
  ImmichBulkSummary,
} from "../types/immich";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import { extractDatePortion } from "../utils/timezone";
import { useTimezoneResolver } from "../hooks/useTimezoneResolver";
import ImmichBulkImportDialog from "./ImmichBulkImportDialog";
import Icon from "./ui/Icon";

interface ImmichBrowserProps {
  onSelect: (assets: ImmichAsset[]) => Promise<void>;
  onImportAlbum?: (album: ImmichAlbum, assets: ImmichAsset[]) => Promise<void>;
  onClose: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
  /** The trip's timezone; the date filters are read as whole days in it. */
  tripTimezone?: string | null;
  /** Assets to hide entirely (for example ones already on the entry being edited). */
  excludeAssetIds?: Set<string>;
  /** Assets to show but mark as already linked and keep from being selected. */
  linkedAssetIds?: Set<string>;
  /** Hide videos and keep them out of "select all", for callers that only accept still photos. */
  imagesOnly?: boolean;
  /**
   * The trip photos are being linked to. Lets the server flag assets that are
   * already linked, and enables "Link all matching" (with `onBulkImported`).
   */
  tripId?: number;
  /** Called after a bulk import so the caller can refresh its photo lists. */
  onBulkImported?: (summary: ImmichBulkSummary) => void;
}

interface ThumbnailCache {
  [assetId: string]: string; // Maps asset ID to blob URL
}

const ITEMS_PER_PAGE = 50;

// Immich's API documents `duration` as a "HH:MM:SS.sss" string, but some
// server versions/endpoints have been observed returning it as a plain
// number of seconds (or omitting it). Handle both defensively so a shape
// mismatch doesn't crash the whole browser.
function formatAssetDuration(duration: ImmichAsset["duration"]): string | null {
  if (duration === null || duration === undefined || duration === "") {
    return null;
  }
  if (typeof duration === "string") {
    return duration.split(".")[0];
  }
  const totalSeconds = Number(duration);
  if (!Number.isFinite(totalSeconds)) {
    return null;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// `assets`/`albums` are typed as required arrays, but responses are proxied
// from Immich's API and not runtime-validated. Fail fast with a clear error
// (caught by the surrounding try/catch, which already surfaces a user-facing
// message) instead of silently treating a malformed response as "empty."
function requireArrayField<T>(value: T[] | null | undefined, fieldName: string): T[] {
  if (!value) {
    throw new Error(`Immich API response is missing the expected "${fieldName}" field`);
  }
  return value;
}

const tabClass = (active: boolean) =>
  `px-4 py-2 rounded-lg transition-colors ${
    active
      ? "bg-blue-600 text-white"
      : "bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600"
  }`;

const secondaryButtonClass =
  "px-4 py-2 bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed";

export default function ImmichBrowser({
  onSelect,
  onImportAlbum,
  onClose,
  tripStartDate,
  tripEndDate,
  tripTimezone,
  excludeAssetIds,
  linkedAssetIds,
  imagesOnly = false,
  tripId,
  onBulkImported,
}: ImmichBrowserProps) {
  const resolveTz = useTimezoneResolver();

  // The trip's start/end are date-only values: take the calendar day as written
  // and never run them through a timezone conversion.
  const tripDates = useMemo(
    () =>
      tripStartDate && tripEndDate
        ? { from: extractDatePortion(tripStartDate), to: extractDatePortion(tripEndDate) }
        : null,
    [tripStartDate, tripEndDate]
  );

  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"assets" | "albums">("assets");
  const [albumSearchTerm, setAlbumSearchTerm] = useState("");
  // Filters start on the trip's dates when the caller knows them, as before.
  const [filters, setFilters] = useState<ImmichFilters>(() => ({
    dateFrom: tripDates?.from,
    dateTo: tripDates?.to,
  }));
  // What is typed in the search box; it becomes a filter on Search / Enter.
  const [searchText, setSearchText] = useState("");
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  // Below the md breakpoint the filters sit behind a toggle so the photo grid keeps room.
  const [showFilters, setShowFilters] = useState(false);
  // Use only Map for selection (stores both ID and data, avoiding redundant Set)
  const [selectedAssetsMap, setSelectedAssetsMap] = useState<Map<string, ImmichAsset>>(
    new Map()
  );
  const [thumbnailCache, setThumbnailCache] = useState<ThumbnailCache>({});
  // Mirrors thumbnailCache so the thumbnail-loading effect can read the latest
  // value without depending on it (depending on it would re-run the effect
  // every time a thumbnail loads, since that effect itself updates the cache).
  const thumbnailCacheRef = useRef<ThumbnailCache>({});
  // Track blob URLs for cleanup (avoids stale closure issues)
  const blobUrlsRef = useRef<string[]>([]);
  // Only the newest request may write results, so a slow earlier page cannot
  // overwrite the page the user has since moved to.
  const requestIdRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLinking, setIsLinking] = useState(false);

  const effectiveFilters = useMemo<ImmichFilters>(() => {
    const next: ImmichFilters = { ...filters };
    if (imagesOnly) next.type = "IMAGE";
    if (next.searchMode !== "smart") delete next.searchMode;
    if (next.dateFrom || next.dateTo) next.timezone = resolveTz(tripTimezone);
    return next;
  }, [filters, imagesOnly, resolveTz, tripTimezone]);

  const updateFilters = (patch: Partial<ImmichFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCurrentPage(1);
  };

  const submitSearch = () => {
    updateFilters({ text: searchText.trim() || undefined });
  };

  const isAssetLinked = useCallback(
    (asset: ImmichAsset) => Boolean(asset.alreadyLinked || linkedAssetIds?.has(asset.id)),
    [linkedAssetIds]
  );

  const filteredAlbums = useMemo(() => {
    if (!albumSearchTerm.trim()) {
      return albums;
    }
    return albums.filter((album) =>
      album.albumName.toLowerCase().includes(albumSearchTerm.toLowerCase())
    );
  }, [albums, albumSearchTerm]);

  // Hide excluded assets (and videos, when imagesOnly). Already-linked assets
  // stay visible, marked, so the user can see what a trip already has.
  const displayAssets = useMemo(() => {
    const candidates = imagesOnly ? assets.filter((asset) => asset.type !== "VIDEO") : assets;
    if (!excludeAssetIds || excludeAssetIds.size === 0) {
      return candidates;
    }
    return candidates.filter((asset) => !excludeAssetIds.has(asset.id));
  }, [assets, excludeAssetIds, imagesOnly]);

  const selectableAssets = useMemo(
    () => displayAssets.filter((asset) => !isAssetLinked(asset)),
    [displayAssets, isAssetLinked]
  );

  // Keep the ref in sync so other effects can read the latest cache
  // without needing to depend on (and re-run for) every cache update.
  useEffect(() => {
    thumbnailCacheRef.current = thumbnailCache;
  }, [thumbnailCache]);

  // Load thumbnails with authentication
  useEffect(() => {
    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) {
        console.error("[ImmichBrowser] No access token found");
        return;
      }

      for (const asset of assets) {
        // Skip if already cached
        if (thumbnailCacheRef.current[asset.id]) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(asset.thumbnailUrl);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            console.error(
              `[ImmichBrowser] Failed to fetch thumbnail ${asset.id}:`,
              response.status,
              response.statusText
            );
            continue;
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          // Track blob URL for cleanup
          blobUrlsRef.current.push(blobUrl);

          setThumbnailCache((prev) => ({
            ...prev,
            [asset.id]: blobUrl,
          }));
        } catch (error) {
          console.error(
            `[ImmichBrowser] Error loading thumbnail ${asset.id}:`,
            error
          );
        }
      }
    };

    if (assets.length > 0) {
      loadThumbnails();
    }
  }, [assets]);

  // Cleanup blob URLs on unmount (separate effect to avoid stale closure)
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  // The album list feeds both the Albums tab and the album filter.
  useEffect(() => {
    let cancelled = false;
    immichService
      .getAlbums(false)
      .then((result) => {
        if (!cancelled) setAlbums(requireArrayField(result.albums, "albums"));
      })
      .catch((error) => {
        console.error("[ImmichBrowser] Failed to load albums:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One server-side filtered page. Changing a filter, the page, or the
  // reload key fetches again; nothing is downloaded ahead of the page shown.
  useEffect(() => {
    if (view !== "assets") return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    immichService
      .queryAssets({
        filters: effectiveFilters,
        page: currentPage,
        size: ITEMS_PER_PAGE,
        tripId,
      })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setAssets(requireArrayField(result.assets, "assets"));
        setHasMoreAssets(Boolean(result.hasMore));
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return;
        console.error("[ImmichBrowser] Failed to load Immich data:", error);
        setAssets([]);
        setHasMoreAssets(false);
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : "Failed to load photos from Immich. Check your Immich settings."
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false);
      });
  }, [view, effectiveFilters, currentPage, tripId, reloadKey]);

  const handleSelectAsset = (asset: ImmichAsset) => {
    if (isAssetLinked(asset)) return;
    setSelectedAssetsMap((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(asset.id)) {
        newMap.delete(asset.id);
      } else {
        newMap.set(asset.id, asset);
      }
      return newMap;
    });
  };

  const handleConfirmSelection = async () => {
    if (isLinking) return;
    const selectedAssets = Array.from(selectedAssetsMap.values());
    if (selectedAssets.length > 0) {
      setIsLinking(true);
      try {
        await onSelect(selectedAssets);
      } catch (error) {
        console.error("[ImmichBrowser] Error during photo linking:", error);
      } finally {
        setIsLinking(false);
      }
    }
  };

  const handleSelectAllOnPage = () => {
    setSelectedAssetsMap((prev) => {
      const newMap = new Map(prev);
      selectableAssets.forEach((asset) => newMap.set(asset.id, asset));
      return newMap;
    });
  };

  const handleDeselectAllOnPage = () => {
    setSelectedAssetsMap((prev) => {
      const newMap = new Map(prev);
      displayAssets.forEach((asset) => newMap.delete(asset.id));
      return newMap;
    });
  };

  const handleDeselectAll = () => {
    setSelectedAssetsMap(new Map());
  };

  const allPageAssetsSelected =
    selectableAssets.length > 0 &&
    selectableAssets.every((asset) => selectedAssetsMap.has(asset.id));

  const handleBrowseAlbum = (albumId: string) => {
    updateFilters({ albumId });
    setView("assets");
  };

  const handleImportAlbumClick = async (album: ImmichAlbum) => {
    if (!onImportAlbum) return;

    setIsLoading(true);
    try {
      // Load all assets in the album
      const albumData = await immichService.getAlbumById(album.id);
      const albumAssets = requireArrayField(albumData.assets, "assets");

      if (albumAssets.length === 0) {
        alert("This album has no photos to import");
        return;
      }

      await onImportAlbum(album, albumAssets);
    } catch (error) {
      console.error("Failed to import album:", error);
      alert("Couldn't import album. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const bulkEnabled = tripId !== undefined && Boolean(onBulkImported) && !imagesOnly;
  // A smart search ranks the whole library by relevance; it has no bounded match set.
  const smartActive = filters.searchMode === "smart" && Boolean(filters.text);
  const activeAlbumName = filters.albumId
    ? albums.find((album) => album.id === filters.albumId)?.albumName
    : undefined;
  const datesMatchTrip =
    tripDates !== null &&
    filters.dateFrom === tripDates.from &&
    filters.dateTo === tripDates.to;
  const hasActiveFilters = Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.isFavorite ||
      filters.type ||
      filters.albumId ||
      filters.text
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90] p-2 sm:p-4">
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl w-full max-w-6xl h-full md:h-5/6 flex flex-col overflow-hidden" style={{ overscrollBehavior: 'contain' }}>
        {/* Title bar: the only thing pinned above the scrolling area */}
        <div className="px-3 py-1 sm:px-6 sm:py-3 border-b border-gray-200 dark:border-dusk-700 shrink-0">
          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
              Browse Immich Library
            </h2>
            <button
              onClick={onClose}
              disabled={isLinking}
              type="button"
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-dusk-400 dark:hover:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="close" size={24} />
            </button>
          </div>
        </div>

        {/*
          Tabs, search, filters and the grid scroll together, so the controls can
          never crowd the photos off a small or short (landscape) screen. On a
          large, tall window the controls stay stuck to the top instead.
        */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-dusk-700 bg-white dark:bg-dusk-800 md:[@media(min-height:700px)]:sticky md:[@media(min-height:700px)]:top-0 md:[@media(min-height:700px)]:z-10">
          {/* View Tabs */}
          <div className="flex gap-2 mb-3 sm:mb-4">
            <button onClick={() => setView("assets")} type="button" className={tabClass(view === "assets")}>
              All Photos
            </button>
            <button onClick={() => setView("albums")} type="button" className={tabClass(view === "albums")}>
              Albums
            </button>
          </div>

          {/* Search and Filters */}
          {view === "assets" && (
            <div className="space-y-3" role="search" aria-label="Filter Immich photos">
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <select
                  value={filters.searchMode ?? "filename"}
                  onChange={(e) =>
                    updateFilters({ searchMode: e.target.value === "smart" ? "smart" : "filename" })
                  }
                  aria-label="Search mode"
                  className="input w-auto"
                >
                  <option value="filename">File name</option>
                  <option value="smart">Smart</option>
                </select>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  maxLength={200}
                  placeholder={
                    filters.searchMode === "smart"
                      ? "Describe what is in the photo, e.g. beach sunset…"
                      : "Search by file name…"
                  }
                  aria-label="Search assets"
                  className="flex-1 min-w-0 basis-40 px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={submitSearch}
                  type="button"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  className={`md:hidden ${secondaryButtonClass}`}
                >
                  Filters{hasActiveFilters ? " •" : ""}
                </button>
              </div>

              <div
                className={`${showFilters ? "flex" : "hidden"} md:flex flex-wrap items-end gap-3`}
              >
                <label className="flex flex-col text-xs text-gray-600 dark:text-dusk-400">
                  From
                  <input
                    type="date"
                    value={filters.dateFrom ?? ""}
                    max={filters.dateTo || undefined}
                    onChange={(e) => updateFilters({ dateFrom: e.target.value || undefined })}
                    aria-label="From date"
                    className="input mt-1"
                  />
                </label>
                <label className="flex flex-col text-xs text-gray-600 dark:text-dusk-400">
                  To
                  <input
                    type="date"
                    value={filters.dateTo ?? ""}
                    min={filters.dateFrom || undefined}
                    onChange={(e) => updateFilters({ dateTo: e.target.value || undefined })}
                    aria-label="To date"
                    className="input mt-1"
                  />
                </label>
                {tripDates && (
                  <button
                    type="button"
                    onClick={() => updateFilters({ dateFrom: tripDates.from, dateTo: tripDates.to })}
                    aria-pressed={datesMatchTrip}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      datesMatchTrip
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600"
                    }`}
                  >
                    This trip&apos;s dates
                  </button>
                )}
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-dusk-700 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.isFavorite)}
                    onChange={(e) => updateFilters({ isFavorite: e.target.checked || undefined })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dusk-300 whitespace-nowrap">
                    Favourites only
                  </span>
                </label>
                {!imagesOnly && (
                  <label className="flex flex-col text-xs text-gray-600 dark:text-dusk-400">
                    Type
                    <select
                      value={filters.type ?? ""}
                      onChange={(e) =>
                        updateFilters({
                          type: e.target.value === "IMAGE" || e.target.value === "VIDEO" ? e.target.value : undefined,
                        })
                      }
                      aria-label="Media type"
                      className="input mt-1"
                    >
                      <option value="">Photos and videos</option>
                      <option value="IMAGE">Photos</option>
                      <option value="VIDEO">Videos</option>
                    </select>
                  </label>
                )}
                <label className="flex flex-col text-xs text-gray-600 dark:text-dusk-400">
                  Immich album
                  <select
                    value={filters.albumId ?? ""}
                    onChange={(e) => updateFilters({ albumId: e.target.value || undefined })}
                    aria-label="Immich album"
                    className="input mt-1 max-w-[14rem]"
                  >
                    <option value="">Any album</option>
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.albumName}
                      </option>
                    ))}
                  </select>
                </label>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({});
                      setSearchText("");
                      setCurrentPage(1);
                    }}
                    className={secondaryButtonClass}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {smartActive && (
                <p className="text-xs text-gray-600 dark:text-dusk-400">
                  Sorted by relevance. Smart search needs Immich&apos;s machine learning.
                </p>
              )}
              {filters.albumId && (
                <p className="text-xs text-gray-600 dark:text-dusk-400">
                  Showing album {activeAlbumName ? `"${activeAlbumName}"` : "from Immich"}
                </p>
              )}
            </div>
          )}
          {view === "albums" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={albumSearchTerm}
                onChange={(e) => setAlbumSearchTerm(e.target.value)}
                placeholder="Search albums…"
                aria-label="Search albums"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6">
          {view === "albums" ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                {filteredAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="p-4 bg-gray-100 dark:bg-dusk-700 rounded-lg transition-colors flex flex-col"
                  >
                    <div className="font-semibold text-gray-900 dark:text-white mb-1 break-words">
                      {album.albumName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-dusk-400 mb-3 flex-grow">
                      {album.assetCount}{" "}
                      {album.assetCount === 1 ? "photo" : "photos"}
                    </div>
                    <div className="flex gap-2">
                      {onImportAlbum && (
                        <button
                          onClick={() => handleImportAlbumClick(album)}
                          type="button"
                          className="flex-1 px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                        >
                          Import
                        </button>
                      )}
                      <button
                        onClick={() => handleBrowseAlbum(album.id)}
                        type="button"
                        className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                      >
                        Browse
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {filteredAlbums.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-dusk-400">No albums found</p>
                </div>
              )}
            </>
          ) : isLoading ? (
            <div className="flex justify-center items-center py-12">
              <p className="text-gray-600 dark:text-dusk-400">Loading</p>
            </div>
          ) : loadError ? (
            <div className="text-center py-12" role="alert">
              <p className="text-red-600 dark:text-red-400 mb-3">{loadError}</p>
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={secondaryButtonClass}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              {displayAssets.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={allPageAssetsSelected ? handleDeselectAllOnPage : handleSelectAllOnPage}
                    disabled={selectableAssets.length === 0}
                    type="button"
                    className={secondaryButtonClass}
                  >
                    {allPageAssetsSelected ? "Deselect All on Page" : "Select All on Page"}
                  </button>
                  {bulkEnabled && (
                    <>
                      <button
                        onClick={() => setShowBulkDialog(true)}
                        disabled={smartActive}
                        type="button"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Link all matching…
                      </button>
                      {smartActive && (
                        <span className="self-center text-xs text-gray-600 dark:text-dusk-400">
                          Smart search ranks your whole library, so there is no set to link; select photos individually.
                        </span>
                      )}
                    </>
                  )}
                  {selectedAssetsMap.size > 0 && (
                    <>
                      <button
                        onClick={handleDeselectAll}
                        type="button"
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                      >
                        Deselect All
                      </button>
                      <div className="px-4 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded-lg text-sm font-medium">
                        {selectedAssetsMap.size} selected
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Pagination Controls - Top */}
              {(currentPage > 1 || hasMoreAssets) && (
                <PaginationControls
                  currentPage={currentPage}
                  hasMore={hasMoreAssets}
                  onPrevious={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  onNext={() => setCurrentPage((p) => p + 1)}
                  className="mb-6"
                />
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
                {displayAssets.map((asset) => {
                  const blobUrl = thumbnailCache[asset.id];
                  const linked = isAssetLinked(asset);
                  const selected = selectedAssetsMap.has(asset.id);
                  return (
                    <button
                      key={asset.id}
                      onClick={() => handleSelectAsset(asset)}
                      type="button"
                      aria-disabled={linked}
                      aria-pressed={selected}
                      title={linked ? "Already linked to this trip" : undefined}
                      className={`relative aspect-square rounded-lg overflow-hidden border-4 transition-transform ${
                        selected
                          ? "border-blue-600 shadow-lg scale-105"
                          : "border-transparent hover:border-gray-300 dark:hover:border-dusk-600"
                      } ${linked ? "cursor-default" : ""}`}
                    >
                      {blobUrl ? (
                        <img
                          src={blobUrl}
                          alt={asset.originalFileName}
                          className={`w-full h-full object-cover ${linked ? "opacity-50" : ""}`}
                          width={300}
                          height={300}
                          loading="lazy"
                          onError={(e) =>
                            console.error(
                              `[ImmichBrowser] Image failed to load: ${asset.id}`,
                              e
                            )
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-dusk-700">
                          <div className="text-gray-400">Loading</div>
                        </div>
                      )}
                      {linked && (
                        <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">
                          Linked
                        </div>
                      )}
                      {asset.isFavorite && (
                        <div
                          className="absolute top-2 right-2 text-yellow-300 drop-shadow"
                          aria-label="Favourite"
                        >
                          <Icon name="starFilled" />
                        </div>
                      )}
                      {asset.type === "VIDEO" && (
                        <>
                          {/* Video play icon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/50 rounded-full p-2">
                              <Icon name="play" size={24} className="text-white" />
                            </div>
                          </div>
                          {/* Duration badge */}
                          {formatAssetDuration(asset.duration) && (
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                              {formatAssetDuration(asset.duration)}
                            </div>
                          )}
                        </>
                      )}
                      {selected && (
                        <div className="absolute inset-0 bg-blue-600 bg-opacity-25 flex items-center justify-center">
                          <Icon name="success" size={48} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {displayAssets.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-dusk-400">
                    {assets.length > 0
                      ? "Everything on this page is already on the entry"
                      : hasActiveFilters
                        ? "No photos match these filters"
                        : "No photos found"}
                  </p>
                </div>
              )}

              {/* Pagination Controls - Bottom */}
              {(currentPage > 1 || hasMoreAssets) && (
                <PaginationControls
                  currentPage={currentPage}
                  hasMore={hasMoreAssets}
                  onPrevious={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  onNext={() => setCurrentPage((p) => p + 1)}
                  className="mt-6"
                />
              )}
            </>
          )}
        </div>
        </div>

        {/* Footer. On phones the count is already on the Link button, so the line of text is dropped. */}
        <div className="p-3 sm:px-6 sm:py-4 border-t border-gray-200 dark:border-dusk-700 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4 shrink-0">
          <p className="hidden sm:block text-sm text-gray-600 dark:text-dusk-400 text-left">
            {selectedAssetsMap.size > 0
              ? `${selectedAssetsMap.size} ${
                  selectedAssetsMap.size === 1 ? "photo" : "photos"
                } selected`
              : "Select photos to continue"}
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isLinking}
              type="button"
              className="flex-1 sm:flex-none px-4 py-2 bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSelection}
              disabled={selectedAssetsMap.size === 0 || isLinking}
              type="button"
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLinking ? (
                "Linking…"
              ) : (
                <>
                  Link{" "}
                  {selectedAssetsMap.size > 0 ? `${selectedAssetsMap.size} ` : ""}
                  Photo{selectedAssetsMap.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {showBulkDialog && tripId !== undefined && (
        <ImmichBulkImportDialog
          tripId={tripId}
          filters={effectiveFilters}
          onFinished={(summary) => {
            onBulkImported?.(summary);
            // Re-read the page so freshly linked assets show as linked.
            setReloadKey((k) => k + 1);
          }}
          onClose={() => setShowBulkDialog(false)}
        />
      )}
    </div>
  );
}

function PaginationControls({
  currentPage,
  hasMore,
  onPrevious,
  onNext,
  className,
}: {
  currentPage: number;
  hasMore: boolean;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={`flex justify-center items-center gap-4 ${className ?? ""}`}>
      <button
        onClick={onPrevious}
        disabled={currentPage === 1}
        type="button"
        className="px-4 py-2 bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-sm text-gray-600 dark:text-dusk-400">Page {currentPage}</span>
      <button
        onClick={onNext}
        disabled={!hasMore}
        type="button"
        className="px-4 py-2 bg-gray-200 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-300 dark:hover:bg-dusk-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
