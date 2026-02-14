import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import type { Trip } from '../types/trip';
import { formatTripDates, getTripDateStatus } from '../utils/dateFormat';

interface KanbanCardProps {
  trip: Trip;
  coverPhotoUrl?: string;
  /** Callback before navigating away (e.g., to save scroll position) */
  onNavigateAway?: () => void;
}

export default function KanbanCard({ trip, coverPhotoUrl, onNavigateAway }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: trip.id.toString(),
    data: {
      type: 'trip',
      trip,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dateStatus = getTripDateStatus(trip.startDate, trip.endDate);
  const isActive = dateStatus?.includes('progress') || dateStatus?.includes('today');

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''
      }`}
    >
      {/* Cover photo thumbnail */}
      {coverPhotoUrl && (
        <div className="h-20 bg-gray-100 dark:bg-gray-600 rounded-t-lg overflow-hidden">
          <img
            src={coverPhotoUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-3">
        {/* Title */}
        <Link
          to={`/trips/${trip.id}`}
          className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateAway?.();
          }}
        >
          {trip.title}
        </Link>

        {/* Trip Type Badge */}
        {trip.tripType && (
          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-50 dark:bg-gray-600 text-primary-700 dark:text-primary-200">
            {trip.tripTypeEmoji && <span>{trip.tripTypeEmoji}</span>}
            {trip.tripType}
          </span>
        )}

        {/* Dates */}
        {(trip.startDate || trip.endDate) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatTripDates(trip.startDate, trip.endDate)}
          </p>
        )}

        {/* Status indicator */}
        {dateStatus && (
          <p
            className={`text-xs mt-1 ${
              isActive
                ? 'text-green-600 dark:text-green-400 font-medium'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {dateStatus}
          </p>
        )}

        {/* Tags preview */}
        {trip.tagAssignments && trip.tagAssignments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {trip.tagAssignments.slice(0, 2).map((assignment) => (
              <span
                key={assignment.tag.id}
                className="px-1.5 py-0.5 text-[10px] rounded tag-colored"
                style={{
                  '--tag-bg-color': assignment.tag.color || '#3B82F6',
                  '--tag-text-color': assignment.tag.textColor || '#FFFFFF',
                }}
              >
                {assignment.tag.name}
              </span>
            ))}
            {trip.tagAssignments.length > 2 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                +{trip.tagAssignments.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
