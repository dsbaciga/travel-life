import { Link } from 'react-router';
import type { ReactNode } from 'react';
import type { TripComparison, TripComparisonTrip } from '../../types/tripComparison';
import { formatDateOnly } from '../../utils/timezone';
import formatCurrency from '../../utils/formatCurrency';
import { tripColor } from '../../utils/tripComparison';
import { useUnits } from '../../hooks/useUnits';

interface ComparisonTableProps {
  comparison: TripComparison;
}

function formatRange(trip: TripComparisonTrip): string {
  const start = formatDateOnly(trip.startDate);
  const end = formatDateOnly(trip.endDate);
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? 'No dates';
}

function CostNotes({ trip }: { trip: TripComparisonTrip }) {
  const { cost } = trip;
  const notes: string[] = [];
  if (cost.excludedTotal) {
    notes.push(
      `Total of ${formatCurrency(cost.excludedTotal.amount, cost.excludedTotal.currency)} left out: no exchange rate to ${cost.currency}`
    );
  }
  for (const item of cost.unconverted) {
    notes.push(
      `${formatCurrency(item.amount, item.currency)} (${item.count} ${item.count === 1 ? 'item' : 'items'}) left out: no exchange rate`
    );
  }
  if (cost.restated) {
    notes.push(`Converted from ${cost.summaryCurrency} at the latest rate`);
  }
  if (notes.length === 0) return <span className="text-slate/60 dark:text-warm-gray/50">None</span>;
  return (
    <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

/**
 * Metrics as rows and trips as columns. The wrapper scrolls horizontally on a
 * phone and the metric column stays pinned, so the table never overflows the page.
 */
export default function ComparisonTable({ comparison }: ComparisonTableProps) {
  const { trips, currency } = comparison;
  const { formatDistance } = useUnits();

  const rows: Array<{ label: string; render: (trip: TripComparisonTrip) => ReactNode }> = [
    { label: 'Dates', render: formatRange },
    { label: 'Length', render: (t) => (t.days === null ? '—' : `${t.days} ${t.days === 1 ? 'day' : 'days'}`) },
    { label: 'Status', render: (t) => t.status },
    { label: 'Country', render: (t) => t.countryCode ?? '—' },
    { label: 'Locations', render: (t) => t.locationCount },
    { label: 'Activities', render: (t) => t.activityCount },
    { label: 'Photos', render: (t) => t.photoCount },
    { label: 'Transportation legs', render: (t) => t.transportationCount },
    {
      label: 'Total distance',
      render: (t) =>
        t.totalDistanceKm === null ? '—' : formatDistance(t.totalDistanceKm),
    },
    {
      label: `Total spend (${currency})`,
      render: (t) =>
        t.cost.spent === null ? 'Not available' : formatCurrency(t.cost.spent, t.cost.currency),
    },
    {
      label: `Cost per day (${currency})`,
      render: (t) =>
        t.cost.costPerDay === null ? '—' : formatCurrency(t.cost.costPerDay, t.cost.currency),
    },
    { label: 'Cost notes', render: (t) => <CostNotes trip={t} /> },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800">
      <table className="min-w-full text-sm" data-testid="comparison-table">
        <caption className="sr-only">Side-by-side comparison of the selected trips</caption>
        <thead>
          <tr className="bg-parchment dark:bg-navy-700">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-parchment dark:bg-navy-700 max-w-[6rem] sm:max-w-none px-3 py-3 text-left font-semibold text-charcoal dark:text-warm-gray"
            >
              Trip
            </th>
            {trips.map((trip, index) => (
              <th
                key={trip.id}
                scope="col"
                className="px-3 py-3 text-left font-semibold text-charcoal dark:text-warm-gray min-w-[8rem] sm:min-w-[11rem]"
              >
                <span className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: tripColor(index).fill, color: tripColor(index).text }}
                  >
                    {index + 1}
                  </span>
                  <Link
                    to={`/trips/${trip.id}`}
                    className="min-w-0 break-words [overflow-wrap:anywhere] text-primary-600 dark:text-gold hover:underline"
                  >
                    {trip.title}
                  </Link>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-primary-100 dark:border-gold/10">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white dark:bg-navy-800 px-3 py-2 text-left font-medium text-slate dark:text-warm-gray/80 max-w-[6rem] sm:max-w-none break-words sm:whitespace-nowrap"
              >
                {row.label}
              </th>
              {trips.map((trip) => (
                <td key={trip.id} className="px-3 py-2 align-top text-charcoal dark:text-warm-gray">
                  {row.render(trip)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
