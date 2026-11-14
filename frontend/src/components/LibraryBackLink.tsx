import { Link } from 'react-router';

/**
 * The "← Library" link at the top left of every page reached from Library.
 * Pages built on `PageHeader` pass `LIBRARY_BACK_LINK` to its `backLink`
 * prop instead; both render the same link.
 */
export const LIBRARY_BACK_LINK = { label: '← Library', href: '/library' } as const;

export default function LibraryBackLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to={LIBRARY_BACK_LINK.href}
      className={`text-primary-600 dark:text-gold hover:text-primary-800 dark:hover:text-gold/80 mb-2 inline-block ${className}`}
    >
      {LIBRARY_BACK_LINK.label}
    </Link>
  );
}
