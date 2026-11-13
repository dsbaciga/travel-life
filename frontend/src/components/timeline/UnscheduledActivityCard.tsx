import { ActivityIcon, LocationIcon } from './icons';
import type { UnscheduledActivityWithLocation } from './types';

interface UnscheduledActivityCardProps {
  activity: UnscheduledActivityWithLocation;
  isCompact?: boolean;
}

export default function UnscheduledActivityCard({
  activity,
  isCompact = false,
}: UnscheduledActivityCardProps) {
  return (
    <div
      className={`bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 rounded-lg ${
        isCompact ? 'p-2.5' : 'p-3'
      } shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start gap-3">
        {/* Activity icon */}
        <div
          className={`flex-shrink-0 ${
            isCompact ? 'w-8 h-8' : 'w-9 h-9'
          } rounded-full bg-blue-500 text-white flex items-center justify-center`}
        >
          <ActivityIcon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title and cost */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h5
                className={`font-medium text-gray-900 dark:text-white ${
                  isCompact ? 'text-sm' : ''
                }`}
              >
                {activity.name}
              </h5>
              {activity.category && (
                <p
                  className={`text-gray-500 dark:text-dusk-400 ${
                    isCompact ? 'text-xs' : 'text-sm'
                  }`}
                >
                  {activity.category}
                </p>
              )}
            </div>
            {activity.cost !== null && activity.cost > 0 && activity.currency && (
              <div
                className={`font-medium text-gray-700 dark:text-dusk-300 ${
                  isCompact ? 'text-xs' : 'text-sm'
                }`}
              >
                {activity.currency} {Number(activity.cost).toFixed(2)}
              </div>
            )}
          </div>

          {/* Linked Location(s) */}
          {activity.linkedLocations && activity.linkedLocations.length > 0 && (
            <div
              className={`flex items-center gap-1.5 text-gray-600 dark:text-dusk-400 ${
                isCompact ? 'mt-1 text-xs' : 'mt-1.5 text-sm'
              }`}
            >
              <LocationIcon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                {activity.linkedLocations.map(loc => loc.name).join(', ')}
              </span>
            </div>
          )}

          {/* Description */}
          {activity.description && !isCompact && (
            <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1.5 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Notes */}
          {activity.notes && !isCompact && (
            <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1 italic line-clamp-1">
              {activity.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
