/**
 * MobileBottomNav - Bottom navigation bar for mobile devices
 * Thumb-friendly navigation with icons and labels
 */

import { memo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useClearPosition } from '../store/scrollStore';
import { useUser } from '../store/authStore';
import pdfImportService from '../services/pdfImport.service';
import savedLinkService from '../services/savedLink.service';
import { usePdfImportTrackerStore } from '../store/pdfImportTrackerStore';
import CaptureSheet from './CaptureSheet';
import Icon from './ui/Icon';

/** Routes that live under the Library tab on mobile. */
const LIBRARY_PATHS = [
  '/library',
  '/albums',
  '/places-visited',
  '/food-log',
  '/checklists',
  '/companions',
  '/year-in-review',
  '/travel-stats',
  '/trip-calendar',
  '/trip-series',
];

const MobileBottomNav = memo(function MobileBottomNav() {
  const location = useLocation();
  const clearPosition = useClearPosition();
  const user = useUser();
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);

  // Same query keys as Navbar, so the two bars share one request each.
  const { data: pendingCountData } = useQuery({
    queryKey: ['pendingCount'],
    queryFn: () => pdfImportService.getPendingCount(),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const { data: savedLinksInboxData } = useQuery({
    queryKey: ['savedLinksInboxCount'],
    queryFn: () => savedLinkService.getInboxCount(),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const inboxCount = (savedLinksInboxData?.count ?? 0) + (pendingCountData?.count ?? 0);
  // PDFs still being read: the Inbox shows a spinner instead of a banner.
  const readingPdfs = usePdfImportTrackerStore((state) => state.tracked.length);

  const isActive = (paths: string[]) =>
    paths.some((path) => location.pathname.startsWith(path));

  /**
   * A destination, or the capture action. Capture is a peer of navigation
   * rather than a floating button so it is labelled and cannot collide with
   * the bar it used to sit on top of.
   */
  type NavItem =
    | {
        kind: 'link';
        path: string;
        /** Path prefixes that mark this item active. Defaults to `path`. */
        activeFor?: string[];
        icon: React.ReactNode;
        label: string;
        badge?: number;
        /** Something for this destination is in progress (a PDF being read). */
        busy?: boolean;
        onClick?: () => void;
      }
    | { kind: 'capture'; label: string };

  const navItems: NavItem[] = [
    {
      kind: 'link',
      path: '/dashboard',
      icon: (
        <Icon name="today" size={24} />
      ),
      label: 'Today',
    },
    {
      kind: 'link',
      path: '/trips',
      icon: (
        <Icon name="trip" size={24} />
      ),
      label: 'Trips',
      onClick: () => clearPosition('trips-page'),
    },
    { kind: 'capture', label: 'Log' },
    {
      kind: 'link',
      path: '/library',
      activeFor: LIBRARY_PATHS,
      icon: (
        <Icon name="folder" size={24} />
      ),
      label: 'Library',
    },
    {
      kind: 'link',
      path: '/saved-links',
      icon: (
        <Icon name="savedLink" size={24} />
      ),
      label: 'Inbox',
      badge: inboxCount,
      busy: readingPdfs > 0,
    },
  ];

  if (!user) return null;

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-navy-900 border-t-2 border-primary-200 dark:border-navy-700 z-30 safe-area-inset-bottom"
        aria-label="Main navigation"
      >
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            if (item.kind === 'capture') {
              return (
                <button
                  key="capture"
                  type="button"
                  onClick={() => setIsCaptureOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={isCaptureOpen}
                  className="flex flex-col items-center justify-center flex-1 h-full min-w-[44px] text-primary-600 dark:text-gold transition-colors duration-200 active:scale-95"
                >
                  <div aria-hidden="true">
                    <Icon name="add" size={24} />
                  </div>
                  <span className="text-xs font-semibold mt-1">{item.label}</span>
                </button>
              );
            }

            const active = isActive(item.activeFor ?? [item.path]);
            const badge = item.badge ?? 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={item.onClick}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center flex-1 h-full min-w-[44px] transition-colors duration-200 ${
                  active
                    ? 'text-primary-600 dark:text-white'
                    : 'text-gray-600 dark:text-dusk-400 active:scale-95'
                }`}
              >
                <div className={`relative transition-transform duration-200 ${active ? 'scale-110' : ''}`} aria-hidden="true">
                  {item.icon}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 text-[10px] font-semibold rounded-full bg-primary-600 dark:bg-gold text-white dark:text-navy-900">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {item.busy && (
                    <span
                      data-testid="nav-busy"
                      className="absolute -bottom-1 -right-2 w-3.5 h-3.5 rounded-full border-2 border-primary-600 dark:border-gold border-t-transparent bg-white dark:bg-navy-900 animate-spin motion-reduce:animate-none"
                    />
                  )}
                </div>
                <span className={`text-xs font-medium mt-1 ${active ? 'font-semibold' : ''}`}>
                  {item.label}
                  {badge > 0 && <span className="sr-only">, {badge} waiting</span>}
                  {item.busy && <span className="sr-only">, reading a PDF</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <CaptureSheet isOpen={isCaptureOpen} onClose={() => setIsCaptureOpen(false)} />
    </>
  );
});

export default MobileBottomNav;
