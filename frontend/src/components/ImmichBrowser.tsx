import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import immichService from "../services/immich.service";
import type { ImmichAsset, ImmichAlbum } from "../types/immich";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";

interface ImmichBrowserProps {
  onSelect: (assets: ImmichAsset[]) => Promise<void>;
  onImportAlbum?: (album: ImmichAlbum, assets: ImmichAsset[]) => Promise<void>;
  onClose: () => void;
  tripStartDate?: string;
  tripEndDate?: string;
  excludeAssetIds?: Set<string>;
}

interface ThumbnailCache {
  [assetId: string]: string; // Maps asset ID to blob URL
}

export default function ImmichBrowser({
  onSelect,
  onImportAlbum,
  onClose,
  tripStartDate,
  tripEndDate,
  excludeAssetIds,
}: ImmichBrowserProps) {
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"assets" | "albums">("assets");
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [albumSearchTerm, setAlbumSearchTerm] = useState("");
  const [filterByTripDates, setFilterByTripDates] = useState(true);
  // Use only Map for selection (stores both ID and data, avoiding redundant Set)
  const [selectedAssetsMap, setSelectedAssetsMap] = useState<Map<string, ImmichAsset>>(
    new Map()
  );
  const [thumbnailCache, setThumbnailCache] = useState<ThumbnailCache>({});
  // Track blob URLs for cleanup (avoids stale closure issues)
  const blobUrlsRef = useRef<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const ITEMS_PER_PAGE = 50;
  const [isLinking, setIsLinking] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  // Filter albums based on search term
  const filteredAlbums = useMemo(() => {
    if (!albumSearchTerm.trim()) {
      return albums;
    }
    return albums.filter((album) =>
      album.albumName.toLowerCase().includes(albumSearchTerm.toLowerCase())
    );
  }, [albums, albumSearchTerm]);

  // Filter assets to exclude already-linked photos
  const displayAssets = useMemo(() => {
    if (!excludeAssetIds || excludeAssetIds.size === 0) {
      return assets;
    }
    return assets.filter((asset) => !excludeAssetIds.has(asset.id));
  }, [assets, excludeAssetIds]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [view, selectedAlbum, filterByTripDates]);

  // Debug: Log selection changes
  useEffect(() => {
    console.log(`[ImmichBrowser] Selection state changed: ${selectedAssetsMap.size} photos selected`);
  }, [selectedAssetsMap]);

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
        if (thumbnailCache[asset.id]) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]); // thumbnailCache excluded to avoid infinite loop

  // Cleanup blob URLs on unmount (separate effect to avoid stale closure)
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const skip = (currentPage - 1) * ITEMS_PER_PAGE;
      const take = ITEMS_PER_PAGE;

      if (view === "albums") {
        console.log("[ImmichBrowser] Loading albums");
        const result = await immichService.getAlbums(false);
        setAlbums(result.albums || []);
        setHasMoreAssets(false); // Albums don't have pagination yet
      } else if (selectedAlbum) {
        console.log("[ImmichBrowser] Loading album:", selectedAlbum);
        const album = await immichService.getAlbumById(selectedAlbum);
        setAssets(album.assets || []);
        setHasMoreAssets(false);
      } else if (filterByTripDates && tripStartDate && tripEndDate) {
        console.log(
          `[ImmichBrowser] Loading assets by date range (page ${currentPage}):`,
          tripStartDate,
          "to",
          tripEndDate
        );
        const result = await immichService.getAssetsByDateRange(
          tripStartDate,
          tripEndDate,
          { skip, take }
        );
        console.log(
          "[ImmichBrowser] Received assets:",
          result.assets?.length || 0,
          "hasMore:",
          result.hasMore
        );
        if (result.assets && result.assets.length > 0) {
          console.log("[ImmichBrowser] First asset sample:", {
            id: result.assets[0].id,
            thumbnailUrl: result.assets[0].thumbnailUrl,
            type: result.assets[0].type,
          });
        }
        setAssets(result.assets || []);
        setHasMoreAssets(result.hasMore);
      } else {
        console.log(
          `[ImmichBrowser] Loading all assets (page ${currentPage}, no date filter)`
        );
        const result = await immichService.getAssets({ skip, take });
        setAssets(result.assets || []);
        setHasMoreAssets(result.hasMore);
      }
    } catch (error) {
      console.error("[ImmichBrowser] Failed to load Immich data:", error);
      alert(
        "Failed to load photos from Immich. Please check your Immich settings."
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, view, selectedAlbum, filterByTripDates, tripStartDate, tripEndDate]);

  // Load data when page or filters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadData();
      return;
    }

    setIsLoading(true);
    try {
      const result = await immichService.searchAssets({ searchTerm });
      setAssets(result.assets || []);
    } catch (error) {
      console.error("Failed to search:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAsset = (asset: ImmichAsset) => {
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
    const selectedAssets = Array.from(selectedAssetsMap.values());
    if (selectedAssets.length > 0) {
      setIsLinking(true);
      try {
        await onSelect(selectedAssets);
      } catch (error) {
        console.error('[ImmichBrowser] Error during photo linking:', error);
      } finally {
        setIsLinking(false);
      }
    }
  };

  const handleSelectAllOnPage = () => {
    setSelectedAssetsMap((prev) => {
      const newMap = new Map(prev);
      displayAssets.forEach((asset) => newMap.set(asset.id, asset));
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

  const handleSelectAll = async () => {
    console.log('[ImmichBrowser] handleSelectAll called', {
      filterByTripDates,
      tripStartDate,
      tripEndDate,
      hasMoreAssets,
    });

    if (!filterByTripDates || !tripStartDate || !tripEndDate) {
      // If not filtering by trip dates, just select all on page
      console.log('[ImmichBrowser] Filter not active, selecting only current page');
      handleSelectAllOnPage();
      return;
    }

    setIsLoadingAll(true);
    try {
      console.log(`[ImmichBrowser] Fetching ALL assets in date range: ${tripStartDate} to ${tripEndDate}`);
      // Fetch ALL assets for the date range (no pagination)
      const result = await immichService.getAssetsByDateRange(
        tripStartDate,
        tripEndDate
      );

      const allAssets = result.assets || [];
      console.log(`[ImmichBrowser] Loaded ${allAssets.length} total assets for selection`);

      // Filter out already-linked assets
      const assetsToSelect = excludeAssetIds
        ? allAssets.filter((asset) => !excludeAssetIds.has(asset.id))
        : allAssets;

      console.log(`[ImmichBrowser] After filtering already-linked: ${assetsToSelect.length} assets to select (excluded ${allAssets.length - assetsToSelect.length})`);

      // Add all to selection
      setSelectedAssetsMap((prev) => {
        const newMap = new Map(prev);
        assetsToSelect.forEach((asset) => newMap.set(asset.id, asset));
        console.log(`[ImmichBrowser] State update: prev size=${prev.size}, new size=${newMap.size}`);
        return newMap;
      });

      console.log(`[ImmichBrowser] Selection complete. Requested ${assetsToSelect.length} assets to be added`);
    } catch (error) {
      console.error("[ImmichBrowser] Failed to load all assets:", error);
      alert("Failed to load all photos. Please try again.");
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleDeselectAll = () => {
    setSelectedAssetsMap(new Map());
  };

  const allPageAssetsSelected =
    displayAssets.length > 0 &&
    displayAssets.every((asset) => selectedAssetsMap.has(asset.id));

  const handleAlbumClick = (albumId: string) => {
    setSelectedAlbum(albumId);
    setView("assets");
  };

  const handleBackToAssets = () => {
    setSelectedAlbum(null);
    loadData();
  };

  const handleImportAlbumClick = async (album: ImmichAlbum) => {
    if (!onImportAlbum) return;

    setIsLoading(true);
    try {
      // Load all assets in the album
      const albumData = await immichService.getAlbumById(album.id);
      const albumAssets = albumData.assets || [];

      if (albumAssets.length === 0) {
        alert("This album has no photos to import");
        return;
      }

      await onImportAlbum(album, albumAssets);
    } catch (error) {
      console.error("Failed to import album:", error);
      alert("Failed to import album. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl h-full sm:h-5/6 flex flex-col" style={{ overscrollBehavior: 'contain' }}>
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Browse Immich Library
            </h2>
            <button
              onClick={onClose}
              disabled={isLinking}
              type="button"
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setView("assets")}
              type="button"
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === "assets"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              All Photos
            </button>
            <button
              onClick={() => setView("albums")}
              type="button"
              className={`px-4 py-2 rounded-lg transition-colors ${
                view === "albums"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Albums
            </button>
            {selectedAlbum && (
              <button
                onClick={handleBackToAssets}
                type="button"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                ← Back to All Photos
              </button>
            )}
          </div>

          {/* Search and Filters */}
          {view === "assets" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2 flex-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search photos..."
                  aria-label="Search assets"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={handleSearch}
                  type="button"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  Search
                </button>
              </div>
              {tripStartDate && tripEndDate && (
                <label className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={filterByTripDates}
                    onChange={(e) => setFilterByTripDates(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {filterByTripDates ? "Trip dates only" : "Show all photos"}
                  </span>
                </label>
              )}
            </div>
          )}
          {view === "albums" && (
            <div className="flex gap-2">
              <input
                type="text"
                value={albumSearchTerm}
                onChange={(e) => setAlbumSearchTerm(e.target.value)}
                placeholder="Search albums..."
                aria-label="Search albums"
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : view === "albums" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
              {filteredAlbums.map((album) => (
                <div
                  key={album.id}
                  className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg transition-colors flex flex-col"
                >
                  <div className="font-semibold text-gray-900 dark:text-white mb-1">
                    {album.albumName}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex-grow">
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
                      onClick={() => handleAlbumClick(album.id)}
                      type="button"
                      className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                    >
                      Browse
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              {displayAssets.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={
                      allPageAssetsSelected
                        ? handleDeselectAllOnPage
                        : handleSelectAllOnPage
                    }
                    type="button"
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm"
                  >
                    {allPageAssetsSelected
                      ? "Deselect All on Page"
                      : "Select All on Page"}
                  </button>
                  {filterByTripDates && tripStartDate && tripEndDate && (hasMoreAssets || displayAssets.length > 0) && (
                    <>
                      <button
                        onClick={handleSelectAll}
                        disabled={isLoadingAll}
                        type="button"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingAll ? "Loading..." : "Select All Photos"}
                      </button>
                      {selectedAssetsMap.size > 0 && (
                        <button
                          onClick={handleDeselectAll}
                          type="button"
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                        >
                          Deselect All
                        </button>
                      )}
                      {selectedAssetsMap.size > 0 && (
                        <div className="px-4 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded-lg text-sm font-medium">
                          {selectedAssetsMap.size} selected
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Pagination Controls - Top */}
              {!isLoading && view === "assets" && (currentPage > 1 || hasMoreAssets) && (
                <div className="flex justify-center items-center gap-4 mb-6">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    type="button"
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Page {currentPage}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={!hasMoreAssets}
                    type="button"
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">

                {displayAssets.map((asset) => {
                  const blobUrl = thumbnailCache[asset.id];
                  return (
                    <button
                      key={asset.id}
                      onClick={() => handleSelectAsset(asset)}
                      type="button"
                      className={`relative aspect-square rounded-lg overflow-hidden border-4 transition-transform ${
                        selectedAssetsMap.has(asset.id)
                          ? "border-blue-600 shadow-lg scale-105"
                          : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      {blobUrl ? (
                        <img
                          src={blobUrl}
                          alt={asset.originalFileName}
                          className="w-full h-full object-cover"
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
                        <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                          <div className="text-gray-400">Loading...</div>
                        </div>
                      )}
                      {asset.type === "VIDEO" && (
                        <>
                          {/* Video play icon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/50 rounded-full p-2">
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                          {/* Duration badge */}
                          {asset.duration && (
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                              {asset.duration.split('.')[0]}
                            </div>
                          )}
                        </>
                      )}
                      {selectedAssetsMap.has(asset.id) && (
                        <div className="absolute inset-0 bg-blue-600 bg-opacity-25 flex items-center justify-center">
                          <svg
                            className="w-12 h-12 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!isLoading && displayAssets.length === 0 && view === "assets" && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {excludeAssetIds && excludeAssetIds.size > 0 && assets.length > 0
                  ? "All photos on this page are already linked to this trip"
                  : "No photos found"}
              </p>
            </div>
          )}

          {!isLoading && albums.length === 0 && view === "albums" && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                No albums found
              </p>
            </div>
          )}

          {/* Pagination Controls - Bottom */}
          {!isLoading && view === "assets" && (currentPage > 1 || hasMoreAssets) && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                type="button"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={!hasMoreAssets}
                type="button"
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
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
              className="flex-1 sm:flex-none px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
                "Linking..."
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
    </div>
  );
}
