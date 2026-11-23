import { useState, useEffect, useRef } from 'react';
import type { PhotoAlbum } from '../types/photo';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import Icon from './ui/Icon';

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
        w-72 md:w-48 lg:w-64 flex-shrink-0 bg-white dark:bg-dusk-800 border-r border-gray-200 dark:border-dusk-700 overflow-y-auto
        md:static md:transform-none md:z-auto
        fixed top-0 left-0 h-full z-40 transform transition-transform duration-300 ease-in-out
        ${isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
      <div className="p-4 space-y-2">
        {/* Close button for mobile */}
        {onCloseMobileDrawer && (
          <div className="md:hidden flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-dusk-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Albums</h3>
            <button
              onClick={onCloseMobileDrawer}
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-700"
              aria-label="Close albums"
            >
              <Icon name="close" />
            </button>
          </div>
        )}

        {/* All Photos Option */}
        <button
          onClick={() => handleSelectAlbum(null)}
          className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
            selectedAlbumId === null
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
              : 'hover:bg-gray-100 dark:hover:bg-dusk-700 text-gray-700 dark:text-dusk-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-dusk-700 flex items-center justify-center">
              <Icon name="photos" size={24} className="text-gray-500 dark:text-dusk-400" />
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
              : 'hover:bg-gray-100 dark:hover:bg-dusk-700 text-gray-700 dark:text-dusk-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-dusk-700 flex items-center justify-center">
              <Icon name="document" size={24} className="text-gray-500 dark:text-dusk-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">Unsorted</div>
              <div className="text-sm opacity-75">({unsortedPhotosCount})</div>
            </div>
          </div>
        </button>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-dusk-700 my-2"></div>

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
                  className={`w-full text-left px-4 py-3 pr-24 md:pr-4 rounded-lg transition-colors ${
                    selectedAlbumId === album.id
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-dusk-700 text-gray-700 dark:text-dusk-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 rounded bg-gray-200 dark:bg-dusk-700 overflow-hidden">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={album.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="album" size={24} className="text-gray-500 dark:text-dusk-400" />
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

              {/* Edit/Delete buttons: on hover on desktop, always visible on phones (no hover) */}
              <div className={`absolute right-2 top-1/2 -translate-y-1/2 gap-1 ${
                hoveredAlbumId === album.id ? 'flex' : 'flex md:hidden'
              }`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditAlbum(album);
                    }}
                    className="p-1.5 bg-white dark:bg-dusk-700 rounded hover:bg-gray-100 dark:hover:bg-dusk-600 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Edit album"
                    aria-label={`Edit album ${album.name}`}
                  >
                    <Icon name="edit" size={16} className="text-gray-600 dark:text-dusk-300" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAlbum(album.id);
                    }}
                    className="p-1.5 bg-white dark:bg-dusk-700 rounded hover:bg-red-100 dark:hover:bg-red-900 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Delete album"
                    aria-label={`Delete album ${album.name}`}
                  >
                    <Icon name="delete" size={16} className="text-red-600 dark:text-red-400" />
                  </button>
              </div>
              </div>
            );
          })}
        </div>

        {/* Create Album Button */}
        <button
          onClick={onCreateAlbum}
          className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-dusk-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-dusk-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <Icon name="add" />
            <span className="font-medium">Create Album</span>
          </div>
        </button>
      </div>
    </div>
    </>
  );

  return sidebarContent;
}
