import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PhotoAlbum, Photo, AlbumWithPhotos } from '../types/photo';
import photoService from '../services/photo.service';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useTripLinkSummary } from '../hooks/useTripLinkSummary';
import { usePagedPagination } from '../hooks/usePagedPagination';
import toast from 'react-hot-toast';

// Import reusable components
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import LinkButton from '../components/LinkButton';
import Pagination from '../components/Pagination';
import { PhotoIcon } from '../components/icons';
import { stripMarkdown } from '../utils/stripMarkdown';

export default function AlbumsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const parsedTripId = tripId ? parseInt(tripId) : undefined;
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(parsedTripId);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [albumDescription, setAlbumDescription] = useState('');
  const [showCoverSelector, setShowCoverSelector] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumWithPhotos | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]);
  const [thumbnailCache, setThumbnailCache] = useState<{ [key: number]: string }>({});
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(new Set());
  const blobUrlsRef = useRef<string[]>([]);
  const thumbnailCacheRef = useRef(thumbnailCache);
  thumbnailCacheRef.current = thumbnailCache;

  // Paged pagination for albums
  const loadAlbumsPage = useCallback(
    async (skip: number, take: number) => {
      if (!tripId) {
        return { items: [], total: 0, hasMore: false };
      }
      const data = await photoService.getAlbumsByTrip(parseInt(tripId), { skip, take });
      return {
        items: data.albums,
        total: data.totalAlbums,
        hasMore: data.hasMore,
      };
    },
    [tripId]
  );

  const albumPagination = usePagedPagination<PhotoAlbum>(loadAlbumsPage, {
    pageSize: 30,
    onError: () => toast.error('Failed to load albums'),
  });
  const paginationRef = useRef(albumPagination);
  paginationRef.current = albumPagination;

  const getCoverPhotoUrl = (album: PhotoAlbum): string | null => {
    if (!album.coverPhoto) return null;
    
    // For Immich photos, use blob URL from cache if available
    if (album.coverPhoto.source === "immich") {
      return thumbnailCache[album.coverPhoto.id] || null;
    }

    const path = album.coverPhoto.thumbnailPath || album.coverPhoto.localPath;
    if (!path || path === '') return null;
    return getFullAssetUrl(path);
  };

  useEffect(() => {
    if (tripId) {
      paginationRef.current.loadInitial();
    }
  }, [tripId]);

  useEffect(() => {
    const loadCoverThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      const currentCache = thumbnailCacheRef.current;
      const newUrls: { [key: number]: string } = {};
      const newBlobUrls: string[] = [];
      const newFailedIds: number[] = [];

      for (const album of albumPagination.items) {
        const photo = album.coverPhoto;
        if (!photo || photo.source !== "immich" || !photo.thumbnailPath || currentCache[photo.id]) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) {
            newFailedIds.push(album.id);
            continue;
          }

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            newUrls[photo.id] = blobUrl;
            newBlobUrls.push(blobUrl);
          } else {
            newFailedIds.push(album.id);
          }
        } catch (error) {
          console.error(`Failed to load cover for album ${album.id}:`, error);
          newFailedIds.push(album.id);
        }
      }

      if (Object.keys(newUrls).length > 0) {
        blobUrlsRef.current = [...blobUrlsRef.current, ...newBlobUrls];
        setThumbnailCache(prev => ({ ...prev, ...newUrls }));
      }

      if (newFailedIds.length > 0) {
        setFailedThumbnails(prev => {
          const next = new Set(prev);
          newFailedIds.forEach(id => next.add(id));
          return next;
        });
      }
    };

    if (albumPagination.items.length > 0) {
      loadCoverThumbnails();
    }
  }, [albumPagination.items]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const handleRetryThumbnail = async (album: PhotoAlbum) => {
    const photo = album.coverPhoto;
    if (!photo || photo.source !== "immich" || !photo.thumbnailPath) return;

    // Remove from failed set to show loading state
    setFailedThumbnails(prev => {
      const next = new Set(prev);
      next.delete(album.id);
      return next;
    });

    const token = getAccessToken();
    if (!token) {
      setFailedThumbnails(prev => {
        const next = new Set(prev);
        next.add(album.id);
        return next;
      });
      return;
    }

    try {
      const fullUrl = getFullAssetUrl(photo.thumbnailPath);
      if (!fullUrl) {
        setFailedThumbnails(prev => {
          const next = new Set(prev);
          next.add(album.id);
          return next;
        });
        return;
      }

      const response = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.push(blobUrl);
        setThumbnailCache(prev => ({ ...prev, [photo.id]: blobUrl }));
      } else {
        setFailedThumbnails(prev => {
          const next = new Set(prev);
          next.add(album.id);
          return next;
        });
      }
    } catch (error) {
      console.error(`Retry failed for album ${album.id}:`, error);
      setFailedThumbnails(prev => {
        const next = new Set(prev);
        next.add(album.id);
        return next;
      });
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId || !albumName.trim()) return;

    try {
      await photoService.createAlbum({
        tripId: parseInt(tripId),
        name: albumName,
        description: albumDescription || undefined,
      });

      setAlbumName('');
      setAlbumDescription('');
      setShowCreateForm(false);
      albumPagination.reset();
    } catch {
      alert('Failed to create album');
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    const confirmed = await confirm({
      title: 'Delete Album',
      message: 'Are you sure you want to delete this album? Photos will not be deleted.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      await photoService.deleteAlbum(albumId);
      // Reload current page (or go to previous if this was the last item on the page)
      albumPagination.loadPage(albumPagination.currentPage);
    } catch {
      alert('Failed to delete album');
    }
  };

  const handleOpenCoverSelector = async (album: PhotoAlbum) => {
    try {
      // Load full album data with photos
      const fullAlbum = await photoService.getAlbumById(album.id, { skip: 0, take: 100 });
      setSelectedAlbum(fullAlbum);
      setAlbumPhotos(fullAlbum.photos.map(p => p.photo));
      setShowCoverSelector(true);

      // Load thumbnails for selector
      const token = getAccessToken();
      if (token) {
        const newUrls: { [key: number]: string } = {};
        const newBlobUrls: string[] = [];

        for (const { photo } of fullAlbum.photos) {
          if (photo.source !== "immich" || !photo.thumbnailPath || thumbnailCache[photo.id]) {
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
          } catch (err) {
            console.error(`Failed to load selection thumbnail for photo ${photo.id}:`, err);
          }
        }

        if (Object.keys(newUrls).length > 0) {
          blobUrlsRef.current = [...blobUrlsRef.current, ...newBlobUrls];
          setThumbnailCache(prev => ({ ...prev, ...newUrls }));
        }
      }
    } catch (err) {
      console.error('Failed to load album photos:', err);
      toast.error('Failed to load album photos');
    }
  };

  const handleSetCoverPhoto = async (photoId: number) => {
    if (!selectedAlbum) return;

    try {
      await photoService.updateAlbum(selectedAlbum.id, {
        coverPhotoId: photoId,
      });
      toast.success('Cover photo updated');
      setShowCoverSelector(false);
      setSelectedAlbum(null);
      setAlbumPhotos([]);
      albumPagination.loadPage(albumPagination.currentPage);
    } catch (err) {
      console.error('Failed to set cover photo:', err);
      toast.error('Failed to set cover photo');
    }
  };

  if (albumPagination.isLoadingInitial) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <LoadingSpinner.FullPage message="Loading albums..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <PageHeader
          title="Photo Albums"
          backLink={{ label: "← Back to Trip", href: `/trips/${tripId}` }}
          action={{
            label: showCreateForm ? 'Cancel' : '+ Create Album',
            onClick: () => setShowCreateForm(!showCreateForm),
          }}
        />

        {showCreateForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Create New Album</h2>
            <form onSubmit={handleCreateAlbum} className="space-y-4">
              <div>
                <label htmlFor="album-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Album Name *
                </label>
              <input
                id="album-name"
                type="text"
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                className="input"
                placeholder="Summer Adventures"
                required
              />
            </div>

            <div>
              <label htmlFor="album-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="album-description"
                value={albumDescription}
                onChange={(e) => setAlbumDescription(e.target.value)}
                rows={3}
                className="input"
                placeholder="A collection of our best summer moments..."
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Create Album
            </button>
          </form>
        </div>
      )}

      {albumPagination.isEmpty ? (
        <EmptyState
          icon="📸"
          message="No albums yet"
          subMessage="Create your first album to organize your photos!"
          actionLabel="+ Create Album"
          onAction={() => setShowCreateForm(true)}
        />
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {albumPagination.items.map((album) => (
            <div
              key={album.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div
                className="h-48 bg-gray-200 dark:bg-gray-700 cursor-pointer relative"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/trips/${tripId}/albums/${album.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/trips/${tripId}/albums/${album.id}`); } }}
              >
                {getCoverPhotoUrl(album) ? (
                  <img
                    src={getCoverPhotoUrl(album)!}
                    alt={album.name}
                    className="w-full h-full object-cover"
                    width={400}
                    height={300}
                    loading="lazy"
                  />
                ) : failedThumbnails.has(album.id) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-2">
                    <PhotoIcon className="w-12 h-12" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Failed to load</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryThumbnail(album);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-500 border border-gray-300 dark:border-gray-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retry
                    </button>
                  </div>
                ) : album.coverPhoto?.source === "immich" && album.coverPhoto?.thumbnailPath ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <PhotoIcon className="w-16 h-16" />
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3
                  className="font-semibold text-lg text-gray-900 dark:text-white mb-1 break-words line-clamp-2"
                >
                  <button
                    type="button"
                    className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 bg-transparent border-none p-0 text-left font-inherit text-inherit"
                    onClick={() => navigate(`/trips/${tripId}/albums/${album.id}`)}
                  >
                    {album.name}
                  </button>
                </h3>
                {album.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2 break-words">
                    {stripMarkdown(album.description)}
                  </p>
                )}
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  {album._count?.photoAssignments || 0} photos
                </p>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => navigate(`/trips/${tripId}/albums/${album.id}`)}
                    className="btn btn-secondary w-full"
                  >
                    View Album
                  </button>
                  <div className="flex gap-2 items-center">
                    {parsedTripId && (
                      <LinkButton
                        tripId={parsedTripId}
                        entityType="PHOTO_ALBUM"
                        entityId={album.id}
                        linkSummary={getLinkSummary('PHOTO_ALBUM', album.id)}
                        onUpdate={() => {
                          invalidateLinkSummary();
                          albumPagination.loadPage(albumPagination.currentPage);
                        }}
                        size="sm"
                      />
                    )}
                    <button
                      onClick={() => handleOpenCoverSelector(album)}
                      className="btn btn-secondary flex-1 text-sm"
                      disabled={!album._count?.photoAssignments || album._count.photoAssignments === 0}
                    >
                      Set Cover
                    </button>
                    <button
                      onClick={() => handleDeleteAlbum(album.id)}
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        <Pagination
          currentPage={albumPagination.currentPage}
          totalPages={albumPagination.totalPages}
          pageNumbers={albumPagination.pageNumbers}
          onPageChange={albumPagination.goToPage}
          onPrevious={albumPagination.previousPage}
          onNext={albumPagination.nextPage}
          hasPreviousPage={albumPagination.hasPreviousPage}
          hasNextPage={albumPagination.hasNextPage}
          loading={albumPagination.loading}
          rangeStart={albumPagination.rangeStart}
          rangeEnd={albumPagination.rangeEnd}
          total={albumPagination.total}
          className="mt-8"
        />
        </>
      )}

      {/* Cover Photo Selector Modal */}
      {showCoverSelector && selectedAlbum && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Set Cover Photo
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Select a photo to use as the album cover
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCoverSelector(false);
                  setSelectedAlbum(null);
                  setAlbumPhotos([]);
                }}
                type="button"
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
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

            {/* Photo Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {albumPhotos.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">
                    No photos in this album.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                  {albumPhotos.map((photo) => {
                    const isCurrentCover = selectedAlbum.coverPhotoId === photo.id;
                    let photoUrl: string | null = null;
                    
                    if (photo.source === "immich") {
                      photoUrl = thumbnailCache[photo.id] || null;
                    } else {
                      photoUrl = getFullAssetUrl(photo.thumbnailPath);
                    }

                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => handleSetCoverPhoto(photo.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-4 transition-all ${
                          isCurrentCover
                            ? "border-green-500 ring-2 ring-green-500"
                            : "border-transparent hover:border-blue-300 dark:hover:border-blue-600"
                        }`}
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={photo.caption || "Photo"}
                            className="w-full h-full object-cover"
                            width={200}
                            height={200}
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <LoadingSpinner size="sm" />
                          </div>
                        )}
                        {isCurrentCover && (
                          <div className="absolute inset-0 bg-green-500 bg-opacity-20 flex items-center justify-center">
                            <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                              Current Cover
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end items-center p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowCoverSelector(false);
                  setSelectedAlbum(null);
                  setAlbumPhotos([]);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

        <ConfirmDialogComponent />
      </div>
    </div>
  );
}
