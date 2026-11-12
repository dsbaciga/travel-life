import { useState, useEffect, useMemo } from 'react';
import { TripStatus, type TripStatusType } from '../../types/trip';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import { convertDateTimeLocalToISO } from '../../utils/timezone';

interface CountdownTimerWidgetProps {
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripStatus: TripStatusType;
  className?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMilliseconds: number;
}

interface TripProgress {
  currentDay: number;
  totalDays: number;
  percentComplete: number;
}

/**
 * Clock icon for countdown display
 */
function ClockIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Plane icon for trip started
 */
function PlaneIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

/**
 * Check icon for completed trips
 */
function CheckIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Calculate time remaining until a target date
 */
function calculateTimeRemaining(targetDate: Date): TimeRemaining {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMilliseconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, totalMilliseconds: diff };
}

/**
 * Calculate trip progress for in-progress trips
 */
function calculateTripProgress(startDate: Date, endDate: Date): TripProgress {
  const now = new Date();
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = now.getTime() - startDate.getTime();

  const totalDays = Math.max(1, Math.ceil(totalDuration / (1000 * 60 * 60 * 24)));
  const currentDay = Math.min(
    totalDays,
    Math.max(1, Math.ceil(elapsed / (1000 * 60 * 60 * 24)))
  );
  const percentComplete = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

  return { currentDay, totalDays, percentComplete };
}

type Urgency = 'low' | 'medium' | 'high' | 'imminent';

interface ExcitementMessage {
  message: string;
  subMessage: string;
  urgency: Urgency;
}

/** Shown while the countdown is still resolving, so there is nothing to be excited about yet. */
const NO_EXCITEMENT: ExcitementMessage = {
  message: '',
  subMessage: '',
  urgency: 'low',
};

/**
 * Get excitement message based on time remaining
 */
function getExcitementMessage(timeRemaining: TimeRemaining): ExcitementMessage {
  const { days, hours, totalMilliseconds } = timeRemaining;

  if (totalMilliseconds <= 0) {
    return {
      message: "It's time!",
      subMessage: 'Your adventure begins now',
      urgency: 'imminent',
    };
  }

  // Less than 24 hours
  if (days === 0) {
    if (hours === 0) {
      return {
        message: 'Any moment now!',
        subMessage: 'Final preparations',
        urgency: 'imminent',
      };
    }
    if (hours < 6) {
      return {
        message: 'Almost there!',
        subMessage: 'Just a few hours left',
        urgency: 'imminent',
      };
    }
    return {
      message: 'Today is the day!',
      subMessage: 'The wait is almost over',
      urgency: 'imminent',
    };
  }

  // Tomorrow
  if (days === 1) {
    return {
      message: 'Tomorrow!',
      subMessage: 'Pack your bags!',
      urgency: 'high',
    };
  }

  // 2-7 days
  if (days <= 7) {
    return {
      message: 'Almost time!',
      subMessage: 'Final countdown begins',
      urgency: 'high',
    };
  }

  // 1-4 weeks
  if (days <= 30) {
    return {
      message: 'Getting closer!',
      subMessage: 'Time to finalize plans',
      urgency: 'medium',
    };
  }

  // More than 30 days
  return {
    message: 'Your adventure awaits',
    subMessage: 'Plenty of time to plan',
    urgency: 'low',
  };
}

/**
 * Approximate a day count as a rounded number of weeks or months, e.g. "2 months".
 * Rounds to nearest rather than truncating so 55 days reads as "2 months", not "1".
 */
function formatApproximateDuration(days: number): string {
  const [amount, unit] =
    days >= 30 ? [Math.round(days / 30), 'month'] : [Math.round(days / 7), 'week'];
  return `${amount} ${unit}${amount !== 1 ? 's' : ''}`;
}

/**
 * Individual countdown unit display
 */
function CountdownUnit({
  value,
  label,
  urgency,
}: {
  value: number;
  label: string;
  urgency: Urgency;
}) {
  const getUrgencyClasses = () => {
    switch (urgency) {
      case 'imminent':
        return 'bg-gradient-to-br from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-400 text-white shadow-lg shadow-amber-500/30 dark:shadow-amber-400/20';
      case 'high':
        return 'bg-gradient-to-br from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-500 text-white shadow-lg shadow-primary-500/30 dark:shadow-gold/20';
      case 'medium':
        return 'bg-gradient-to-br from-sky-500 to-blue-500 dark:from-sky-400 dark:to-blue-500 text-white shadow-lg shadow-sky-500/30 dark:shadow-sky-400/20';
      default:
        return 'bg-slate/10 dark:bg-navy-700 text-charcoal dark:text-warm-gray';
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center
          transition-all duration-300
          ${getUrgencyClasses()}
          ${urgency === 'imminent' ? 'motion-safe:animate-pulse-subtle' : ''}
        `}
      >
        <span className="text-2xl sm:text-3xl font-bold font-display tabular-nums">
          {value.toString().padStart(2, '0')}
        </span>
      </div>
      <span className="mt-2 text-xs sm:text-sm font-medium text-slate dark:text-warm-gray/70 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

/**
 * Separator between countdown units
 */
function CountdownSeparator({ urgency }: { urgency: Urgency }) {
  const colorClass =
    urgency === 'imminent' || urgency === 'high'
      ? 'text-primary-500 dark:text-gold'
      : 'text-slate/50 dark:text-warm-gray/30';

  return (
    <div className={`flex flex-col justify-center gap-2 ${colorClass} px-1 sm:px-2`}>
      <div className="w-1.5 h-1.5 rounded-full bg-current" />
      <div className="w-1.5 h-1.5 rounded-full bg-current" />
    </div>
  );
}

/**
 * Trip in progress display
 */
function TripInProgressDisplay({ progress }: { progress: TripProgress }) {
  return (
    <div className="text-center">
      {/* Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center">
        <PlaneIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>

      {/* Day counter */}
      <div className="mb-2">
        <span className="text-5xl sm:text-6xl font-bold font-display text-gradient">
          Day {progress.currentDay}
        </span>
      </div>
      <p className="text-lg text-slate dark:text-warm-gray/70 mb-4">
        of {progress.totalDays} day{progress.totalDays !== 1 ? 's' : ''}
      </p>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto">
        <div className="h-3 bg-slate/10 dark:bg-navy-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-400 dark:to-orange-400 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-slate dark:text-warm-gray/60">
          {Math.round(progress.percentComplete)}% complete
        </p>
      </div>

      {/* Live indicator */}
      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
        <span className="relative flex h-2 w-2">
          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Adventure in progress
        </span>
      </div>
    </div>
  );
}

/**
 * Trip completed display
 */
function TripCompletedDisplay() {
  return (
    <div className="text-center py-4">
      {/* Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 flex items-center justify-center">
        <CheckIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>

      <h4 className="text-2xl font-bold font-display text-charcoal dark:text-warm-gray mb-2">
        Trip Complete
      </h4>
      <p className="text-slate dark:text-warm-gray/70">
        Another adventure for the books!
      </p>
    </div>
  );
}

/**
 * Dates-have-passed display
 *
 * For a trip whose end date is behind us but whose status still says Planning,
 * Planned or In Progress. The widget reports that plainly rather than declaring
 * the trip complete on the user's behalf.
 */
function DatesPassedDisplay({ tripStatus }: { tripStatus: TripStatusType }) {
  return (
    <div className="text-center py-4">
      {/* Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
        <ClockIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>

      <h4 className="text-2xl font-bold font-display text-charcoal dark:text-warm-gray mb-2">
        These dates have passed
      </h4>
      <p className="text-slate dark:text-warm-gray/70">
        Still marked as <span className="font-medium">{tripStatus}</span>.
      </p>
    </div>
  );
}

/**
 * No dates set display
 */
function NoDatesDisplay() {
  return (
    <div className="text-center py-4">
      {/* Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate/10 dark:bg-navy-700 flex items-center justify-center">
        <ClockIcon className="w-8 h-8 text-slate dark:text-warm-gray/50" />
      </div>

      <h4 className="text-lg font-semibold text-charcoal dark:text-warm-gray mb-2">
        Set your travel dates
      </h4>
      <p className="text-sm text-slate dark:text-warm-gray/70">
        Add start and end dates to see your countdown
      </p>
    </div>
  );
}

/**
 * CountdownTimerWidget - Real-time countdown display for upcoming trips
 *
 * Features:
 * - Large, visually prominent countdown with days, hours, minutes, seconds
 * - Real-time updates every second
 * - Excitement-building messaging based on time remaining
 * - Different displays for: countdown, in-progress, completed states
 * - Animated/pulsing effects for urgency
 * - Full dark mode support
 */
export default function CountdownTimerWidget({
  tripStartDate,
  tripEndDate,
  tripStatus,
  className = '',
}: CountdownTimerWidgetProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);
  const [tripProgress, setTripProgress] = useState<TripProgress | null>(null);

  // The countdown runs on the user's home clock, not the destination's: a trip
  // "starts" at midnight of its start date wherever the user lives.
  const resolveTz = useTimezoneResolver();
  const homeTimezone = resolveTz();

  const { startDate, endDate } = useMemo(() => {
    const toInstant = (dateStr: string, isEndOfDay: boolean): Date => {
      const datePart = dateStr.split('T')[0]; // YYYY-MM-DD
      try {
        const start = new Date(convertDateTimeLocalToISO(`${datePart}T00:00`, homeTimezone));
        if (Number.isNaN(start.getTime())) throw new Error('Invalid date');
        // Last millisecond of the day = next midnight - 1ms (handles 23/25-hour DST days)
        if (!isEndOfDay) return start;
        const [y, m, d] = datePart.split('-').map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        const nextDate = next.toISOString().split('T')[0];
        return new Date(
          new Date(convertDateTimeLocalToISO(`${nextDate}T00:00`, homeTimezone)).getTime() - 1
        );
      } catch {
        const [year, month, day] = datePart.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        if (isEndOfDay) date.setHours(23, 59, 59, 999);
        return date;
      }
    };

    return {
      startDate: tripStartDate ? toInstant(tripStartDate, false) : null,
      endDate: tripEndDate ? toInstant(tripEndDate, true) : null,
    };
  }, [tripStartDate, tripEndDate, homeTimezone]);

  // Determine display mode based on status and dates
  const displayMode = useMemo(() => {
    // Dream and cancelled trips don't show countdown
    if (tripStatus === TripStatus.DREAM || tripStatus === TripStatus.CANCELLED) {
      return 'hidden';
    }

    // Completed trips show completed state
    if (tripStatus === TripStatus.COMPLETED) {
      return 'completed';
    }

    // No start date means we can't show countdown
    if (!startDate) {
      return 'no_dates';
    }

    const now = new Date();

    // Check if trip has started
    if (now >= startDate) {
      // Trip in progress
      if (tripStatus === TripStatus.IN_PROGRESS) {
        return 'in_progress';
      }
      // The dates are over but the status has not caught up. This used to
      // report 'completed', which announced "Trip Complete" next to
      // TripDayIndicator's "Planning in progress" for the very same trip.
      // Completion is the stored status's call (handled above), so say what is
      // actually true instead: the dates have passed.
      if (endDate && now > endDate) {
        return 'dates_passed';
      }
      return 'in_progress';
    }

    // Trip hasn't started yet - show countdown
    // Only show for Planning and Planned statuses
    if (tripStatus === TripStatus.PLANNING || tripStatus === TripStatus.PLANNED) {
      return 'countdown';
    }

    return 'hidden';
  }, [tripStatus, startDate, endDate]);

  // Real-time countdown update
  useEffect(() => {
    if (displayMode !== 'countdown' || !startDate) {
      setTimeRemaining(null);
      return;
    }

    // Initial calculation
    setTimeRemaining(calculateTimeRemaining(startDate));

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(startDate);
      setTimeRemaining(remaining);

      // Stop updating when countdown reaches zero
      if (remaining.totalMilliseconds <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [displayMode, startDate]);

  // Trip progress update for in-progress trips
  useEffect(() => {
    if (displayMode !== 'in_progress' || !startDate || !endDate) {
      setTripProgress(null);
      return;
    }

    // Initial calculation
    setTripProgress(calculateTripProgress(startDate, endDate));

    // Update every minute for progress
    const interval = setInterval(() => {
      setTripProgress(calculateTripProgress(startDate, endDate));
    }, 60000);

    return () => clearInterval(interval);
  }, [displayMode, startDate, endDate]);

  // Don't render for hidden modes
  if (displayMode === 'hidden') {
    return null;
  }

  // Get excitement message for countdown mode
  const excitement = timeRemaining ? getExcitementMessage(timeRemaining) : NO_EXCITEMENT;

  return (
    <div className={`card animate-fade-in ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-5 h-5 text-primary-500 dark:text-gold" />
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            {displayMode === 'countdown'
              ? 'Countdown'
              : displayMode === 'in_progress'
                ? 'Trip Progress'
                : 'Trip Status'}
          </h3>
        </div>
        {displayMode === 'countdown' && (
          <span className="text-xs text-slate dark:text-warm-gray/50">
            {homeTimezone}
          </span>
        )}
      </div>

      {/* Content based on mode */}
      {displayMode === 'no_dates' && <NoDatesDisplay />}

      {displayMode === 'completed' && <TripCompletedDisplay />}

      {displayMode === 'dates_passed' && <DatesPassedDisplay tripStatus={tripStatus} />}

      {displayMode === 'in_progress' && tripProgress && (
        <TripInProgressDisplay progress={tripProgress} />
      )}

      {displayMode === 'countdown' && timeRemaining && (
        <div className="text-center">
          {/* Excitement message */}
          <div className="mb-6">
            <h4
              className={`text-2xl sm:text-3xl font-bold font-display mb-1 ${
                excitement.urgency === 'imminent'
                  ? 'text-gradient motion-safe:animate-pulse-subtle'
                  : excitement.urgency === 'high'
                    ? 'text-gradient'
                    : 'text-charcoal dark:text-warm-gray'
              }`}
            >
              {excitement.message}
            </h4>
            <p className="text-sm text-slate dark:text-warm-gray/70">{excitement.subMessage}</p>
          </div>

          {/* Countdown display */}
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <CountdownUnit value={timeRemaining.days} label="Days" urgency={excitement.urgency} />
            <CountdownSeparator urgency={excitement.urgency} />
            <CountdownUnit value={timeRemaining.hours} label="Hours" urgency={excitement.urgency} />
            <CountdownSeparator urgency={excitement.urgency} />
            <CountdownUnit
              value={timeRemaining.minutes}
              label="Minutes"
              urgency={excitement.urgency}
            />
            {/* Only show seconds when less than 24 hours remaining */}
            {timeRemaining.days === 0 && (
              <>
                <CountdownSeparator urgency={excitement.urgency} />
                <CountdownUnit
                  value={timeRemaining.seconds}
                  label="Seconds"
                  urgency={excitement.urgency}
                />
              </>
            )}
          </div>

          {/* Additional context for longer countdowns */}
          {timeRemaining.days > 7 && (
            <p className="mt-6 text-sm text-slate dark:text-warm-gray/60">
              That&apos;s about {formatApproximateDuration(timeRemaining.days)} away
            </p>
          )}
        </div>
      )}
    </div>
  );
}
