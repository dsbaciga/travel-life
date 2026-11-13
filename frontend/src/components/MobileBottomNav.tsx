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
import CaptureSheet from './CaptureSheet';

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
        onClick?: () => void;
      }
    | { kind: 'capture'; label: string };

  const navItems: NavItem[] = [
    {
      kind: 'link',
      path: '/dashboard',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 16.95l-1.414 1.414m12.728 0l-1.414-1.414M7.05 7.05L5.636 5.636M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      label: 'Today',
    },
    {
      kind: 'link',
      path: '/trips',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
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
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      label: 'Library',
    },
    {
      kind: 'link',
      path: '/saved-links',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      ),
      label: 'Inbox',
      badge: inboxCount,
    },
  ];

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
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
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
                </div>
                <span className={`text-xs font-medium mt-1 ${active ? 'font-semibold' : ''}`}>
                  {item.label}
                  {badge > 0 && <span className="sr-only">, {badge} waiting</span>}
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
