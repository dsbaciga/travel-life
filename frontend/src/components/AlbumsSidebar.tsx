import { useState, useEffect, useRef } from 'react';
import type { PhotoAlbum } from '../types/photo';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';

interface AlbumsSidebarProps {
  albums: PhotoAlbum[];
  selectedAlbumId: number | null;
  totalPhotos: number;
  unsortedPhotosCount: number;
  onSelectAlbum: (albumId: number | null) => void;
  onCreateAlbum: () => void;
  onEditAlbum: (album: PhotoAlbum) => void;
  onDeleteAlbum: (albumId: number) => void;
  // Mobile drawer props
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
}

export default function AlbumsSidebar({
  albums,
  selectedAlbumId,
  totalPhotos,
  unsortedPhotosCount,
  onSelectAlbum,
  onCreateAlbum,
  onEditAlbum,
  onDeleteAlbum,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer,
}: AlbumsSidebarProps) {
  const [hoveredAlbumId, setHoveredAlbumId] = useState<number | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<{ [key: number]: string }>({});
  const blobUrlsRef = useRef<string[]>([]);

  const handleSelectAlbum = (albumId: number | null) => {
    onSelectAlbum(albumId);
    // Close mobile drawer when selecting an album
    if (onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
  };

  const getAlbumThumbnail = (album: PhotoAlbum) => {
    const photo = album.coverPhoto;
    if (!photo) return null;

    if (photo.source === "immich") {
      return thumbnailCache[photo.id] || null;
    }

    if (photo.thumbnailPath) {
      return getFullAssetUrl(photo.thumbnailPath);
    }
    
    return null;
  };

  // Load thumbnails for Immich album covers
  useEffect(() => {
    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      const newUrls: { [key: number]: string } = {};
      const newBlobUrls: string[] = [];

      for (const album of albums) {
        const photo = album.coverPhoto;
        if (!photo || photo.source !== "immich" || !photo.thumbnailPath || thumbnailCache[photo.id]) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            newUrls[photo.id] = blobUrl;
            newBlobUrls.push(blobUrl);
          }
        } catch (error) {
          console.error(`Failed to load sidebar thumbnail for photo ${photo.id}:`, error);
        }
      }

      if (Object.keys(newUrls).length > 0) {
        blobUrlsRef.current = [...blobUrlsRef.current, ...newBlobUrls];
        setThumbnailCache(prev => ({ ...prev, ...newUrls }));
      }
    };

    if (albums.length > 0) {
      loadThumbnails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums]); // thumbnailCache excluded to avoid infinite loop

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const sidebarContent = (
    <>
      {/* Mobile Overlay */}
      {isMobileDrawerOpen && onCloseMobileDrawer && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onCloseMobileDrawer}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop fixed, Mobile drawer */}
      <div className={`
        w-64 md:w-48 lg:w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto
        md:static md:transform-none md:z-auto
        fixed top-0 left-0 h-full z-40 transform transition-transform duration-300 ease-in-out
        ${isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
      <div className="p-4 space-y-2">
        {/* Close button for mobile */}
        {onCloseMobileDrawer && (
          <div className="md:hidden flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Albums</h3>
            <button
              onClick={onCloseMobileDrawer}
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Close albums"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* All Photos Option */}
        <button
          onClick={() => handleSelectAlbum(null)}
          className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
            selectedAlbumId === null
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">All Photos</div>
              <div className="text-sm opacity-75">({totalPhotos})</div>
            </div>
          </div>
        </button>

        {/* Unsorted Photos Option */}
        <button
          onClick={() => handleSelectAlbum(-1)}
          className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
            selectedAlbumId === -1
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">Unsorted</div>
              <div className="text-sm opacity-75">({unsortedPhotosCount})</div>
            </div>
          </div>
        </button>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>

        {/* Albums List */}
        <div className="space-y-1">
          {albums.map((album) => {
            const thumbnail = getAlbumThumbnail(album);
            return (
              <div
                key={album.id}
                onMouseEnter={() => setHoveredAlbumId(album.id)}
                onMouseLeave={() => setHoveredAlbumId(null)}
                className="relative"
              >
                <button
                  onClick={() => handleSelectAlbum(album.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    selectedAlbumId === album.id
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={album.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{album.name}</div>
                      <div className="text-sm opacity-75">
                        ({album._count?.photoAssignments || 0})
                      </div>
                    </div>
                  </div>
                </button>

              {/* Edit/Delete buttons on hover */}
              {hoveredAlbumId === album.id && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditAlbum(album);
                    }}
                    className="p-1.5 bg-white dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Edit album"
                  >
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAlbum(album.id);
                    }}
                    className="p-1.5 bg-white dark:bg-gray-700 rounded hover:bg-red-100 dark:hover:bg-red-900 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Delete album"
                  >
                    <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
              </div>
            );
          })}
        </div>

        {/* Create Album Button */}
        <button
          onClick={onCreateAlbum}
          className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">Create Album</span>
          </div>
        </button>
      </div>
    </div>
    </>
  );

  return sidebarContent;
}
