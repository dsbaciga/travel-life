import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { TripWithColor } from './calendarUtils';
import { formatTripDates } from '../../../utils/dateFormat';
import { getAccessToken } from '../../../lib/axios';
import { getFullAssetUrl } from '../../../lib/config';

interface TripPopupProps {
  trip: TripWithColor;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function TripPopup({ trip, position, onClose }: TripPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load cover photo if available
  useEffect(() => {
    const loadCoverPhoto = async () => {
      if (!trip.coverPhoto) return;

      const photo = trip.coverPhoto;

      if (photo.source === 'local' && photo.thumbnailPath) {
        setCoverPhotoUrl(getFullAssetUrl(photo.thumbnailPath) || null);
      } else if (photo.source === 'immich' && photo.thumbnailPath) {
        try {
          const token = getAccessToken();
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl || !token) return;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            setCoverPhotoUrl(url);
          }
        } catch (error) {
          console.error('Failed to load cover photo:', error);
        }
      }
    };

    loadCoverPhoto();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [trip.coverPhoto]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on Escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Format date range
  const formatDateRange = () => {
    if (!trip.startDate || !trip.endDate) return 'Dates not set';
    return formatTripDates(trip.startDate, trip.endDate);
  };

  // Get status badge styles
  const getStatusStyles = () => {
    switch (trip.status) {
      case 'Planning':
        return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300';
      case 'Planned':
        return 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300';
      case 'In Progress':
        return 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300';
      case 'Completed':
        return 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300';
      case 'Cancelled':
        return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300';
      default:
        return 'bg-gray-100 dark:bg-dusk-800 text-gray-700 dark:text-dusk-300';
    }
  };

  // Calculate popup position to keep it on screen
  const getPopupStyle = () => {
    const popupWidth = 280;
    const popupHeight = 200;
    const padding = 16;

    let left = position.x;
    let top = position.y + 8;

    // Adjust if popup would go off right edge
    if (left + popupWidth > window.innerWidth - padding) {
      left = window.innerWidth - popupWidth - padding;
    }

    // Adjust if popup would go off left edge
    if (left < padding) {
      left = padding;
    }

    // Adjust if popup would go off bottom edge
    if (top + popupHeight > window.innerHeight - padding) {
      top = position.y - popupHeight - 8;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  };

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-popup-title"
      className="fixed z-50 w-72 bg-white dark:bg-navy-800 rounded-xl shadow-2xl border border-gray-200 dark:border-navy-700 overflow-hidden animate-scale-in"
      style={getPopupStyle()}
    >
      {/* Cover photo or color bar */}
      {coverPhotoUrl ? (
        <div
          className="h-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverPhotoUrl})` }}
        />
      ) : (
        <div className="h-4" style={{ backgroundColor: trip.color }} />
      )}

      <div className="p-4">
        {/* Title */}
        <h4 id="trip-popup-title" className="font-display font-bold text-gray-900 dark:text-white text-lg mb-1 line-clamp-1">
          {trip.title}
        </h4>

        {/* Dates */}
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-3">{formatDateRange()}</p>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyles()}`}>
            {trip.status}
          </span>
        </div>

        {/* Tags */}
        {trip.tagAssignments && trip.tagAssignments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {trip.tagAssignments.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: tag.color,
                  color: tag.textColor,
                }}
              >
                {tag.name}
              </span>
            ))}
            {trip.tagAssignments.length > 3 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-navy-700 text-gray-600 dark:text-dusk-400">
                +{trip.tagAssignments.length - 3}
              </span>
            )}
          </div>
        )}

        {/* View Details link */}
        <Link
          to={`/trips/${trip.id}`}
          className="block w-full text-center py-2 px-4 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
          onClick={onClose}
        >
          View Details
        </Link>
      </div>
    </div>
  );
}
