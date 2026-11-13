import { Link } from 'react-router';
import type { ReactNode } from 'react';
import PageHeader from '../components/PageHeader';

interface LibraryEntry {
  path: string;
  label: string;
  description: string;
  icon: ReactNode;
}

const icon = (d: string) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

/**
 * Everything that is a collection rather than a trip. The desktop top bar
 * reaches these through the Library dropdown; on mobile this page is the
 * Library tab, so it also carries People and Trip series, which have no
 * slot of their own in the five-item bottom bar.
 */
const ENTRIES: LibraryEntry[] = [
  {
    path: '/albums',
    label: 'Albums',
    description: 'Photo albums across all trips',
    icon: icon('M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'),
  },
  {
    path: '/places-visited',
    label: 'Places',
    description: 'Map of everywhere you have been',
    icon: icon('M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z'),
  },
  {
    path: '/food-log',
    label: 'Food log',
    description: 'Meals and restaurants worth remembering',
    icon: icon('M4 3v7a2 2 0 002 2h1v9m0-18v7m3-7v7a2 2 0 01-2 2H7m11-9c-1.7 0-3 2-3 5s1.3 4 3 4v5V3z'),
  },
  {
    path: '/checklists',
    label: 'Checklists',
    description: 'Countries, parks and custom lists',
    icon: icon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'),
  },
  {
    path: '/companions',
    label: 'People',
    description: 'Travel companions',
    icon: icon('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'),
  },
  {
    path: '/trip-series',
    label: 'Trip series',
    description: 'Trips grouped into a longer journey',
    icon: icon('M4 6h16M4 12h16M4 18h7'),
  },
  {
    path: '/year-in-review',
    label: 'Year in review',
    description: 'A summary of each year of travel',
    icon: icon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'),
  },
];

export default function LibraryPage() {
  return (
    <div className="min-h-screen bg-cream dark:bg-navy-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
        <PageHeader title="Library" subtitle="Your collections, across every trip" />
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {ENTRIES.map((entry) => (
            <li key={entry.path}>
              <Link
                to={entry.path}
                className="flex items-center gap-4 min-h-[72px] p-4 rounded-xl bg-white dark:bg-navy-800 border border-primary-500/10 dark:border-navy-700 hover:border-primary-300 dark:hover:border-navy-500 transition-colors"
              >
                <span className="flex-none w-11 h-11 rounded-lg flex items-center justify-center bg-primary-50 dark:bg-navy-700 text-primary-600 dark:text-warm-gray">
                  {entry.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-body font-semibold text-charcoal dark:text-white">
                    {entry.label}
                  </span>
                  <span className="block text-sm text-slate dark:text-dusk-400 truncate">
                    {entry.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
