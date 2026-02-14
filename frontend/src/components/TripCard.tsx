/**
 * TripCard - Visually engaging trip card component
 *
 * Features:
 * - Large cover photo (~60% of card height)
 * - Gradient overlay for text readability
 * - Status ribbon badge (color-coded by status)
 * - Trip title with serif display font
 * - Destination and date range
 * - Stats row with locations, photos, transportation counts
 * - Hover effects with lift and photo zoom
 */

import { Link } from 'react-router-dom';
import type { Trip } from '../types/trip';
import { getTripStatusRibbonColor } from '../utils/statusColors';
import { formatTripDates, getTripDateStatus, formatTripDuration } from '../utils/dateFormat';
import { MapPinIcon, PhotoIcon, CalendarIcon } from './icons';
import { stripMarkdown } from '../utils/stripMarkdown';

interface TripCardProps {
  trip: Trip;
  coverPhotoUrl?: string;
  onDelete?: (id: number) => void;
  showActions?: boolean;
  /** Callback before navigating away (e.g., to save scroll position) */
  onNavigateAway?: () => void;
}

/**
 * Transportation icon component
 */
function TransportIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

export default function TripCard({ trip, coverPhotoUrl, onDelete, showActions = true, onNavigateAway }: TripCardProps) {
  const counts = trip._count;
  const hasStats = counts && (counts.locations > 0 || counts.photos > 0 || counts.transportation > 0);

  return (
    <div className="group relative rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border-2 border-primary-500/10 dark:border-gold/20 hover:border-primary-500/30 dark:hover:border-gold/40 bg-white dark:bg-navy-800 flex flex-col transform hover:-translate-y-1 dark:hover:shadow-[0_0_25px_rgba(251,191,36,0.15),0_20px_40px_-15px_rgba(0,0,0,0.3)]">
      {/* Clickable area covering the entire card for navigation */}
      <Link
        to={`/trips/${trip.id}`}
        className="absolute inset-0 z-10"
        aria-label={`View ${trip.title}`}
        onClick={() => onNavigateAway?.()}
      >
        <span className="sr-only">View trip details</span>
      </Link>

      {/* Cover Photo Section - fixed height */}
      <div className="relative h-48 flex-shrink-0 overflow-hidden">
        {coverPhotoUrl ? (
          <>
            {/* Photo with zoom effect on hover */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
              style={{ backgroundImage: `url(${coverPhotoUrl})` }}
            />
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/60" />
          </>
        ) : (
          /* Fallback gradient with map pin icon for trips without cover photos */
          <div className="absolute inset-0 bg-gradient-to-br from-primary-400 via-accent-400 to-primary-600 dark:from-primary-600 dark:via-accent-600 dark:to-primary-800">
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-20 h-20 text-white/20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
              </svg>
            </div>
          </div>
        )}

        {/* Status Ribbon Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md ${getTripStatusRibbonColor(trip.status)}`}>
            {trip.status}
          </div>
          {trip.tripType && (
            <div className="px-2.5 py-1.5 text-xs font-medium rounded-lg shadow-md bg-white/90 dark:bg-navy-800/90 text-charcoal dark:text-warm-gray backdrop-blur-sm">
              {trip.tripTypeEmoji && <span className="mr-1">{trip.tripTypeEmoji}</span>}
              {trip.tripType}
            </div>
          )}
        </div>

        {/* Tags overlay on photo */}
        {trip.tagAssignments && trip.tagAssignments.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
            {trip.tagAssignments.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="px-2 py-0.5 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm tag-colored max-w-[120px] truncate"
                style={{
                  '--tag-bg-color': tag.color,
                  '--tag-text-color': tag.textColor,
                }}
                title={tag.name}
              >
                {tag.name}
              </span>
            ))}
            {trip.tagAssignments.length > 3 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/50 text-white backdrop-blur-sm">
                +{trip.tagAssignments.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content Section - flexible height */}
      <div className="relative flex-1 p-4 flex flex-col">
        {/* Trip Title */}
        <h3 className="text-xl font-display font-bold text-charcoal dark:text-warm-gray mb-1 line-clamp-1 group-hover:text-primary-600 dark:group-hover:text-gold transition-colors">
          {trip.title}
        </h3>

        {/* Description (if available) */}
        {trip.description && (
          <p className="text-sm text-slate dark:text-warm-gray/70 line-clamp-1 mb-2">
            {stripMarkdown(trip.description)}
          </p>
        )}

        {/* Date Range with Calendar Icon and Relative Status */}
        <div className="text-sm text-slate dark:text-warm-gray/80 mb-auto">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 flex-shrink-0" />
            <span>{formatTripDates(trip.startDate, trip.endDate)}</span>
          </div>
          {/* Duration and relative timing */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-slate/70 dark:text-warm-gray/60 ml-5">
            {formatTripDuration(trip.startDate, trip.endDate) && (
              <span>{formatTripDuration(trip.startDate, trip.endDate)}</span>
            )}
            {getTripDateStatus(trip.startDate, trip.endDate) && (
              <>
                {formatTripDuration(trip.startDate, trip.endDate) && <span>·</span>}
                <span className={`${
                  getTripDateStatus(trip.startDate, trip.endDate)?.includes('progress') ||
                  getTripDateStatus(trip.startDate, trip.endDate)?.includes('today')
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : ''
                }`}>
                  {getTripDateStatus(trip.startDate, trip.endDate)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Stats Row - each stat links to its tab */}
        {hasStats && (
          <div className="relative z-20 flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-navy-700 mt-2">
            {counts.locations > 0 && (
              <Link
                to={`/trips/${trip.id}?tab=locations`}
                className="flex items-center gap-1 text-sm text-slate dark:text-warm-gray/70 hover:text-primary-600 dark:hover:text-gold transition-colors"
                title={`${counts.locations} location${counts.locations !== 1 ? 's' : ''}`}
                onClick={(e) => { e.stopPropagation(); onNavigateAway?.(); }}
              >
                <MapPinIcon className="w-4 h-4 text-primary-500 dark:text-gold" />
                <span>{counts.locations}</span>
              </Link>
            )}
            {counts.photos > 0 && (
              <Link
                to={`/trips/${trip.id}?tab=photos`}
                className="flex items-center gap-1 text-sm text-slate dark:text-warm-gray/70 hover:text-accent-600 dark:hover:text-gold transition-colors"
                title={`${counts.photos} photo${counts.photos !== 1 ? 's' : ''}`}
                onClick={(e) => { e.stopPropagation(); onNavigateAway?.(); }}
              >
                <PhotoIcon className="w-4 h-4 text-accent-500 dark:text-gold" />
                <span>{counts.photos}</span>
              </Link>
            )}
            {counts.transportation > 0 && (
              <Link
                to={`/trips/${trip.id}?tab=transportation`}
                className="flex items-center gap-1 text-sm text-slate dark:text-warm-gray/70 hover:text-green-600 dark:hover:text-green-300 transition-colors"
                title={`${counts.transportation} transportation${counts.transportation !== 1 ? 's' : ''}`}
                onClick={(e) => { e.stopPropagation(); onNavigateAway?.(); }}
              >
                <TransportIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
                <span>{counts.transportation}</span>
              </Link>
            )}
          </div>
        )}

        {/* Action Buttons - positioned above the clickable link */}
        {showActions && (
          <div className="flex gap-2 pt-3 mt-auto relative z-20">
            <Link
              to={`/trips/${trip.id}/edit`}
              className="flex-1 btn btn-secondary text-center text-sm py-2"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateAway?.();
              }}
            >
              Edit
            </Link>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete(trip.id);
                }}
                className="btn btn-danger px-4 text-sm py-2"
                aria-label={`Delete ${trip.title}`}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
