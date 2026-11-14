import { TripStatus, type TripStatusType } from '../../types/trip';

interface TripDayIndicatorProps {
  status: TripStatusType;
  startDate: string | null;
  endDate: string | null;
  className?: string;
}

/**
 * Parse a date string (YYYY-MM-DD or ISO format) into a Date object
 * without timezone conversion issues.
 *
 * When you call new Date("2024-03-15"), JavaScript interprets it as UTC midnight,
 * which can shift the date when converted to local time. This function parses
 * the date string directly to create a local midnight date.
 */
function parseDateString(dateStr: string): Date {
  // Extract just the date part (YYYY-MM-DD)
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  // Create date at local midnight (month is 0-indexed)
  return new Date(year, month - 1, day);
}

/**
 * Copy for a trip whose start date has passed while its status still reads
 * Planning or Planned.
 *
 * The dashboard does not promote such a trip to "complete" by itself — that is
 * the stored status's job — so this states the discrepancy instead of guessing
 * which of the two the user meant.
 */
function pastDatedIndicator(
  end: Date | null,
  now: Date,
  statusWord: 'planning' | 'planned'
): { label: string; subLabel?: string; icon?: 'countdown' } {
  const subLabel = `Still marked as ${statusWord}`;

  if (end && now > end) {
    return { label: 'These dates have passed', subLabel, icon: 'countdown' };
  }

  return { label: 'These dates are underway', subLabel, icon: 'countdown' };
}

/**
 * Displays trip day/countdown information based on trip status.
 *
 * Status Display Logic:
 * - Dream: "Dream Trip"
 * - Planning: "X days until trip", or "Set dates to track countdown" with no
 *   dates, or "These dates have passed / are underway" once the start date is
 *   behind us and the status has not caught up
 * - Planned: as Planning, with ready-to-go copy
 * - In Progress: "Day X of Y" with progress indicator
 * - Completed: "Completed X days ago"
 * - Cancelled: "Cancelled"
 */
export default function TripDayIndicator({
  status,
  startDate,
  endDate,
  className = '',
}: TripDayIndicatorProps) {
  const getIndicatorContent = (): {
    label: string;
    subLabel?: string;
    progress?: number;
    icon?: 'dream' | 'countdown' | 'progress' | 'completed' | 'cancelled';
  } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Use parseDateString to avoid timezone conversion issues
    // new Date("2024-03-15") interprets as UTC midnight which can shift dates
    const start = startDate ? parseDateString(startDate) : null;
    const end = endDate ? parseDateString(endDate) : null;

    switch (status) {
      case TripStatus.DREAM:
        return {
          label: 'Dream Trip',
          subLabel: 'Waiting to become reality',
          icon: 'dream',
        };

      case TripStatus.PLANNING:
        if (start) {
          const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntil > 0) {
            return {
              label: `${daysUntil} day${daysUntil === 1 ? '' : 's'} until trip`,
              subLabel: 'Still planning',
              icon: 'countdown',
            };
          } else if (daysUntil === 0) {
            return {
              label: 'Trip starts today!',
              subLabel: 'Time to finalize plans',
              icon: 'countdown',
            };
          }
          // Start date is behind us while the status still says Planning.
          // Falling through to the no-dates copy below told the user to "set
          // dates to track countdown" for a trip whose dates were already set,
          // right beside a sibling card reading "Trip Complete!".
          return pastDatedIndicator(end, now, 'planning');
        }
        return {
          label: 'Planning in progress',
          subLabel: 'Set dates to track countdown',
          icon: 'countdown',
        };

      case TripStatus.PLANNED:
        if (start) {
          const daysUntil = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntil > 0) {
            return {
              label: `${daysUntil} day${daysUntil === 1 ? '' : 's'} until trip`,
              subLabel: 'Everything is ready',
              icon: 'countdown',
            };
          } else if (daysUntil === 0) {
            return {
              label: 'Trip starts today!',
              subLabel: 'Ready for adventure',
              icon: 'countdown',
            };
          }
          return pastDatedIndicator(end, now, 'planned');
        }
        return {
          label: 'Trip planned',
          subLabel: 'Ready to go',
          icon: 'countdown',
        };

      case TripStatus.IN_PROGRESS:
        if (start && end) {
          const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const currentDay = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const progress = Math.min(100, Math.max(0, (currentDay / totalDays) * 100));

          return {
            label: `Day ${Math.min(currentDay, totalDays)} of ${totalDays}`,
            subLabel: currentDay === 1 ? 'Adventure begins!' : currentDay >= totalDays ? 'Final day' : 'Journey underway',
            progress,
            icon: 'progress',
          };
        }
        return {
          label: 'Trip in progress',
          subLabel: 'Enjoy the journey',
          icon: 'progress',
        };

      case TripStatus.COMPLETED:
        if (end) {
          const daysSince = Math.ceil((now.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince === 0) {
            return {
              label: 'Just completed',
              subLabel: 'Welcome home!',
              icon: 'completed',
            };
          } else if (daysSince === 1) {
            return {
              label: 'Completed yesterday',
              subLabel: 'Fresh memories',
              icon: 'completed',
            };
          } else if (daysSince < 7) {
            return {
              label: `Completed ${daysSince} days ago`,
              subLabel: 'Recent adventure',
              icon: 'completed',
            };
          } else if (daysSince < 30) {
            const weeks = Math.floor(daysSince / 7);
            return {
              label: `Completed ${weeks} week${weeks === 1 ? '' : 's'} ago`,
              icon: 'completed',
            };
          } else if (daysSince < 365) {
            const months = Math.floor(daysSince / 30);
            return {
              label: `Completed ${months} month${months === 1 ? '' : 's'} ago`,
              icon: 'completed',
            };
          } else {
            const years = Math.floor(daysSince / 365);
            return {
              label: `Completed ${years} year${years === 1 ? '' : 's'} ago`,
              icon: 'completed',
            };
          }
        }
        return {
          label: 'Trip completed',
          subLabel: 'Memories made',
          icon: 'completed',
        };

      case TripStatus.CANCELLED:
        return {
          label: 'Cancelled',
          subLabel: 'Maybe next time',
          icon: 'cancelled',
        };

      default:
        return {
          label: 'Trip',
        };
    }
  };

  const content = getIndicatorContent();

  const getIconElement = () => {
    switch (content.icon) {
      case 'dream':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        );
      case 'countdown':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'progress':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'completed':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'cancelled':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getColorClasses = () => {
    switch (status) {
      case TripStatus.DREAM:
        return 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30';
      case TripStatus.PLANNING:
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case TripStatus.PLANNED:
        return 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30';
      case TripStatus.IN_PROGRESS:
        return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
      case TripStatus.COMPLETED:
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case TripStatus.CANCELLED:
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default:
        return 'text-gray-600 dark:text-dusk-400 bg-gray-100 dark:bg-dusk-900/30';
    }
  };

  const getProgressBarColor = () => {
    switch (status) {
      case TripStatus.IN_PROGRESS:
        return 'bg-amber-500 dark:bg-amber-400';
      default:
        return 'bg-primary-500 dark:bg-gold';
    }
  };

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${getColorClasses()}`}>
        {getIconElement()}
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{content.label}</span>
          {content.subLabel && (
            <span className="text-xs opacity-75">{content.subLabel}</span>
          )}
        </div>
      </div>

      {/* Progress bar for in-progress trips */}
      {content.progress !== undefined && (
        <div className="mt-2 w-full">
          <div className="h-2 bg-gray-200 dark:bg-dusk-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressBarColor()} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${content.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1 text-right">
            {Math.round(content.progress)}% complete
          </p>
        </div>
      )}
    </div>
  );
}
