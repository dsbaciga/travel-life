/* eslint-disable react-refresh/only-export-components */
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumb navigation component for showing hierarchical location
 *
 * @example
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     { label: 'Trips', href: '/trips' },
 *     { label: 'Paris 2024', href: '/trips/123' },
 *     { label: 'Photos' }
 *   ]}
 * />
 * ```
 */
export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`mb-4 ${className}`}
    >
      <ol className="flex flex-nowrap items-center text-sm font-body min-w-0 overflow-x-auto scrollbar-hide">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          return (
            <li key={index} className={`flex items-center ${isFirst ? 'flex-shrink-0' : 'min-w-0'}`}>
              {index > 0 && (
                <svg
                  className="w-4 h-4 mx-2 text-slate/50 dark:text-warm-gray/50 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}

              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  onClick={item.onClick}
                  className="text-primary-600 dark:text-sky hover:text-primary-700 dark:hover:text-accent-400 hover:underline transition-colors truncate"
                  title={item.label}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="text-slate dark:text-warm-gray truncate"
                  aria-current={isLast ? 'page' : undefined}
                  title={item.label}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Hook to build breadcrumb items for common patterns
 */
export function useTripBreadcrumbs(
  tripId: number | string,
  tripTitle: string,
  additionalItems: BreadcrumbItem[] = []
): BreadcrumbItem[] {
  return [
    { label: 'Trips', href: '/trips' },
    { label: tripTitle, href: `/trips/${tripId}` },
    ...additionalItems,
  ];
}
