import { Link } from 'react-router';
import PageHeader from '../components/PageHeader';
import Icon, { type IconName } from '../components/ui/Icon';

interface LibraryEntry {
  path: string;
  label: string;
  description: string;
  icon: IconName;
}

/**
 * Everything that is a collection or a look back rather than a trip. The
 * desktop top bar lists the same destinations in its Library dropdown, in
 * this same order (see `navLinks` in Navbar.tsx; keep the two in step). On
 * mobile this page is the Library tab.
 */
const ENTRIES: LibraryEntry[] = [
  {
    path: '/albums',
    label: 'Albums',
    description: 'Photo albums across all trips',
    icon: 'album',
  },
  {
    path: '/places-visited',
    label: 'Places',
    description: 'Map of everywhere you have been',
    icon: 'place',
  },
  {
    path: '/food-log',
    label: 'Food log',
    description: 'Meals and restaurants worth remembering',
    icon: 'foodLog',
  },
  {
    path: '/checklists',
    label: 'Checklists',
    description: 'Countries, parks and custom lists',
    icon: 'checklist',
  },
  {
    path: '/travel-stats',
    label: 'Travel stats',
    description: 'Totals across all of your trips',
    icon: 'dashboard',
  },
  {
    path: '/trip-calendar',
    label: 'Trip calendar',
    description: 'When you have travelled and when you will',
    icon: 'calendar',
  },
  {
    path: '/year-in-review',
    label: 'Year in review',
    description: 'A summary of each year of travel',
    icon: 'star',
  },
  {
    path: '/trip-series',
    label: 'Trip series',
    description: 'Trips grouped into a longer journey',
    icon: 'series',
  },
  {
    path: '/companions',
    label: 'People',
    description: 'Travel companions',
    icon: 'users',
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
                  <Icon name={entry.icon} size={24} />
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
