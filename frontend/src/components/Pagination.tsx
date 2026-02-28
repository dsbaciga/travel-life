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
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {rangeStart}-{rangeEnd} of {total.toLocaleString()}
        </div>
      )}

      {/* Pagination controls */}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        {/* Previous button */}
        <button
          onClick={onPrevious}
          disabled={!hasPreviousPage || loading}
          className="px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
          aria-label="Previous page"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((page, index) =>
            page === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-3 py-2 text-gray-500 dark:text-gray-400"
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
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
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
        <span className="sm:hidden px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
          Page {currentPage} of {totalPages}
        </span>

        {/* Next button */}
        <button
          onClick={onNext}
          disabled={!hasNextPage || loading}
          className="px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
          aria-label="Next page"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </nav>
    </div>
  );
}
