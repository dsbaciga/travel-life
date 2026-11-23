import Icon from './ui/Icon';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageNumbers: (number | 'ellipsis')[];
  onPageChange: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  loading?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  total?: number;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  pageNumbers,
  onPageChange,
  onPrevious,
  onNext,
  hasPreviousPage,
  hasNextPage,
  loading = false,
  rangeStart,
  rangeEnd,
  total,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
      {/* Range info */}
      {rangeStart !== undefined && rangeEnd !== undefined && total !== undefined && (
        <div className="text-sm text-slate dark:text-warm-gray/70">
          Showing {rangeStart}-{rangeEnd} of {total.toLocaleString()}
        </div>
      )}

      {/* Pagination controls */}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        {/* Previous button */}
        <button
          onClick={onPrevious}
          disabled={!hasPreviousPage || loading}
          className="px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-navy-800 border border-primary-200 dark:border-gold/30 text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700 disabled:hover:bg-white dark:disabled:hover:bg-navy-800"
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" />
        </button>

        {/* Page numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((page, index) =>
            page === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-3 py-2 text-slate/50 dark:text-warm-gray/40"
              >
                &hellip;
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                disabled={loading}
                className={`px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  page === currentPage
                    ? 'bg-primary-500 dark:bg-gold text-white'
                    : 'bg-white dark:bg-navy-800 border border-primary-200 dark:border-gold/30 text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700'
                }`}
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            )
          )}
        </div>

        {/* Mobile page indicator */}
        <span className="sm:hidden px-3 py-2 text-sm text-slate dark:text-warm-gray/70">
          Page {currentPage} of {totalPages}
        </span>

        {/* Next button */}
        <button
          onClick={onNext}
          disabled={!hasNextPage || loading}
          className="px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-navy-800 border border-primary-200 dark:border-gold/30 text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700 disabled:hover:bg-white dark:disabled:hover:bg-navy-800"
          aria-label="Next page"
        >
          <Icon name="chevronRight" />
        </button>
      </nav>
    </div>
  );
}
