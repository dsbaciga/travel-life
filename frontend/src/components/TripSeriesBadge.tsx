import Icon from './ui/Icon';
import { useNavigate } from 'react-router';

interface TripSeriesBadgeProps {
  seriesName: string;
  seriesOrder: number | null;
  totalInSeries?: number;
  seriesId: number;
  /** Use 'light' variant for overlays on dark backgrounds (e.g., cover photo hero) */
  variant?: 'default' | 'light';
}

/**
 * Small clickable pill/badge showing series info on trip cards and detail pages.
 * Navigates to the series detail page when clicked.
 */
export default function TripSeriesBadge({
  seriesName,
  seriesOrder,
  totalInSeries,
  seriesId,
  variant = 'default',
}: TripSeriesBadgeProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/trip-series/${seriesId}`);
  };

  const label =
    seriesOrder !== null && totalInSeries
      ? `${seriesName} \u00B7 Trip ${seriesOrder} of ${totalInSeries}`
      : seriesName;

  if (variant === 'light') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 text-white shadow-sm transition-all hover:shadow-md cursor-pointer max-w-full"
        title={`View series: ${seriesName}`}
      >
        <Icon name="series" size={16} />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-lg bg-primary-50 dark:bg-navy-700 text-primary-700 dark:text-gold border border-primary-200 dark:border-gold/30 hover:bg-primary-100 dark:hover:bg-navy-600 shadow-sm transition-all hover:shadow-md cursor-pointer max-w-full"
      title={`View series: ${seriesName}`}
    >
      <Icon name="series" size={16} />
      <span className="font-body truncate">{label}</span>
    </button>
  );
}
