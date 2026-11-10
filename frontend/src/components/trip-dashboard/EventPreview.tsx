/**
 * EventPreview Component
 *
 * Displays a preview of any event type (activity, transport, lodging)
 * with consistent styling and appropriate icons based on event type.
 */

import { ChevronRightIcon, MapPinIcon } from '../icons';
import type { NormalizedEvent } from '../../utils/tripDashboardUtils';
import {
  formatNextUpEventDateTime,
  getRelativeTimeIndicator,
} from '../../utils/tripDashboardUtils';
import { EventIcon } from './eventHelpers';
import { getEventTypeColors } from './eventStyles';

interface EventPreviewProps {
  event: NormalizedEvent;
  tripTimezone?: string | null;
  onNavigate?: () => void;
  showRelativeTime?: boolean;
  compact?: boolean;
}

export default function EventPreview({
  event,
  tripTimezone,
  onNavigate,
  showRelativeTime = true,
  compact = false,
}: EventPreviewProps) {
  const colors = getEventTypeColors(event.type);
  const effectiveTimezone = event.timezone || tripTimezone || null;

  const formattedDateTime = formatNextUpEventDateTime(
    event.dateTime,
    effectiveTimezone,
    { includeDate: true, includeTime: true }
  );

  const relativeTime = showRelativeTime
    ? getRelativeTimeIndicator(event.dateTime)
    : null;

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={`
          w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200
          ${colors.bg} ${colors.border}
          hover:shadow-md hover:-translate-y-0.5
          focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
        `}
      >
        <div className={`flex-shrink-0 ${colors.text}`}>
          <EventIcon iconType={event.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {event.title}
          </p>
          {event.dateTime && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {relativeTime || formattedDateTime}
            </p>
          )}
        </div>
        <ChevronRightIcon className="w-4 h-4 text-gray-400 dark:text-gray-400 flex-shrink-0" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`
        w-full p-4 rounded-xl border transition-all duration-200
        bg-white dark:bg-navy-800/50 border-gray-200 dark:border-gold/20
        hover:shadow-lg hover:-translate-y-0.5 dark:hover:shadow-glow-gold-sm
        focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
        text-left
      `}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`
            flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
            ${colors.bg} ${colors.text}
          `}
        >
          <EventIcon iconType={event.icon} className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title and Subtitle */}
          <h4 className="font-semibold text-gray-900 dark:text-white truncate">
            {event.title}
          </h4>
          {event.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {event.subtitle}
            </p>
          )}

          {/* Date/Time */}
          {event.dateTime && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {formattedDateTime}
              </span>
              {relativeTime && (
                <span
                  className={`
                    text-xs px-2 py-0.5 rounded-full font-medium
                    ${colors.bg} ${colors.text}
                  `}
                >
                  {relativeTime}
                </span>
              )}
            </div>
          )}

          {/* Location */}
          {event.locationName && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <MapPinIcon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{event.locationName}</span>
            </div>
          )}
        </div>

        {/* Navigate arrow */}
        <div className="flex-shrink-0 self-center">
          <ChevronRightIcon className="w-5 h-5 text-gray-400 dark:text-gray-400" />
        </div>
      </div>
    </button>
  );
}
