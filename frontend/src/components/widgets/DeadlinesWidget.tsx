/**
 * DeadlinesWidget - Undismissed booking deadlines (cancellation cutoffs,
 * check-in windows, payment due dates) due soon across all trips, including
 * overdue ones. Renders nothing when there are none.
 */

import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import bookingDeadlineService from '../../services/bookingDeadline.service';
import { DEADLINE_KIND_LABELS, type UpcomingBookingDeadline } from '../../types/bookingDeadline';
import { formatDateTimeInTimezone } from '../../utils/timezone';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';

export default function DeadlinesWidget() {
  const queryClient = useQueryClient();
  const resolveTz = useTimezoneResolver();

  const { data: deadlines } = useQuery<UpcomingBookingDeadline[]>({
    queryKey: ['deadlines', 'upcoming'],
    queryFn: () => bookingDeadlineService.getUpcoming(),
    staleTime: 5 * 60 * 1000,
  });

  const dismiss = useMutation({
    mutationFn: (d: UpcomingBookingDeadline) =>
      bookingDeadlineService.updateDeadline(d.tripId, d.id, { dismissed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
    },
    onError: () => toast.error('Could not dismiss deadline'),
  });

  if (!deadlines || deadlines.length === 0) {
    return null;
  }

  const now = Date.now();

  return (
    <div className="animate-fade-in bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-amber-200 dark:border-amber-500/30">
      <div className="mb-4">
        <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
          Booking Deadlines
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Due within 30 days, plus anything overdue
        </p>
      </div>

      <ul className="space-y-3">
        {deadlines.map((d) => {
          const overdue = new Date(d.dueAt).getTime() < now;
          return (
            <li key={d.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {DEADLINE_KIND_LABELS[d.kind]}
                  {overdue && (
                    <span className="ml-2 text-xs font-medium text-red-600 dark:text-red-400">
                      Overdue
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  <Link
                    to={`/trips/${d.trip.id}`}
                    className="hover:underline text-primary-600 dark:text-gold"
                  >
                    {d.trip.title}
                  </Link>
                  {' · '}
                  {formatDateTimeInTimezone(d.dueAt, resolveTz(d.trip.timezone))}
                </p>
                {d.note && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.note}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss.mutate(d)}
                disabled={dismiss.isPending}
                className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              >
                Done
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
