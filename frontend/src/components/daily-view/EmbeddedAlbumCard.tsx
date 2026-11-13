import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { PhotoAlbum } from '../../types/photo';
import { getFullAssetUrl } from '../../lib/config';
import { getAccessToken } from '../../lib/axios';
import { stripMarkdown } from '../../utils/stripMarkdown';
import { getTypeColors } from './utils';

interface EmbeddedAlbumCardProps {
  album: PhotoAlbum;
  tripId: number;
  label?: string;
}

export default function EmbeddedAlbumCard({
  album,
  tripId,
  label,
}: EmbeddedAlbumCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('photo');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loadingCover, setLoadingCover] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Load cover photo
  useEffect(() => {
    if (!album.coverPhoto) return;

    const loadCover = async () => {
      const photo = album.coverPhoto!;

      // Local photo - use direct URL
      if (photo.source === 'local' && photo.thumbnailPath) {
        setCoverUrl(getFullAssetUrl(photo.thumbnailPath) || null);
        return;
      }

      // Immich photo - fetch with auth
      if (photo.source === 'immich' && photo.thumbnailPath) {
        const token = getAccessToken();
        if (!token) return;

        setLoadingCover(true);
        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) return;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlRef.current = blobUrl;
            setCoverUrl(blobUrl);
          }
        } catch (error) {
          console.error(`Failed to load cover for album ${album.id}:`, error);
        } finally {
          setLoadingCover(false);
        }
      }
    };

    loadCover();

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
    // Using coverPhoto?.id intentionally to avoid unnecessary re-fetches when object reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.coverPhoto?.id, album.id]);

  const handleClick = () => {
    navigate(`/trips/${tripId}/albums/${album.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const photoCount = album._count?.photoAssignments || album._count?.photos || 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View album: ${album.name}`}
      className={`p-3 rounded-lg border ${colors.bg} ${colors.border} cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dusk-800`}
    >
      {label && (
        <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-2">
          {label}
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Cover Photo Thumbnail */}
        <div className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 ${colors.icon}`}>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={album.name}
              className="w-full h-full object-cover"
            />
          ) : loadingCover ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-pink-200 dark:border-pink-800 border-t-pink-500 dark:border-t-pink-400 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-2xl">📸</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white truncate">
            {album.name}
          </h4>

          <div className="text-sm text-gray-600 dark:text-dusk-400 mt-0.5">
            {photoCount} photo{photoCount !== 1 ? 's' : ''}
          </div>

          {album.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400 line-clamp-2">
              {stripMarkdown(album.description)}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          className="w-5 h-5 text-gray-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </div>
  );
}
