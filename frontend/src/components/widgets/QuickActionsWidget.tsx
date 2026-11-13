/**
 * QuickActionsWidget - Quick access to common actions
 *
 * Ranked rather than flat: the four highest-frequency capture actions are
 * neutral rows filed against the active trip, and "New Trip" is the single
 * primary. Colour is not used to distinguish actions — every row previously
 * carried its own unrelated gradient, which read as six equally-likely choices
 * and competed with the accent colour that means "primary action".
 */

import { useNavigate } from 'react-router';
import { useActiveTrip, getDayOfTrip } from '../../hooks/useActiveTrip';

export default function QuickActionsWidget() {
  const navigate = useNavigate();
  const { trip: activeTrip } = useActiveTrip();

  /** Capture actions land on the active trip's matching tab, form already open. */
  const captureActions = [
    {
      label: 'Photos',
      hint: 'Upload from camera roll',
      tab: 'photos',
      opensForm: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: 'Location',
      hint: 'A place you visited',
      tab: 'locations',
      opensForm: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: 'Journal',
      hint: 'Write about today',
      tab: 'journal',
      opensForm: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      label: 'Lodging',
      hint: 'Where you stayed',
      tab: 'lodging',
      opensForm: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
  ];

  const dayOfTrip = getDayOfTrip(activeTrip);

  const handleCapture = (tab: string, opensForm: boolean) => {
    if (!activeTrip) return;
    navigate(`/trips/${activeTrip.id}?tab=${tab}${opensForm ? '&action=new' : ''}`);
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300 h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary-500 dark:bg-gold flex items-center justify-center flex-none">
          <svg className="w-6 h-6 text-white dark:text-navy-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
            Quick Actions
          </h3>
          {activeTrip && (
            <p className="text-xs text-slate dark:text-warm-gray/70 truncate">
              {dayOfTrip ? `Day ${dayOfTrip} · ` : ''}
              {activeTrip.title}
            </p>
          )}
        </div>
      </div>

      {/* Capture actions — only meaningful with a trip to file them against */}
      {activeTrip && (
        <div className="flex flex-col gap-2 mb-3">
          {captureActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleCapture(action.tab, action.opensForm)}
              className="flex items-center gap-3 min-h-[60px] px-3 py-2 rounded-xl text-left bg-parchment/70 dark:bg-navy-900/50 border border-primary-100 dark:border-gold/15 hover:border-accent-400 dark:hover:border-accent-400 transition-colors"
            >
              <span className="w-10 h-10 flex-none rounded-lg bg-white dark:bg-navy-800 flex items-center justify-center text-primary-600 dark:text-gold">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-body font-semibold text-charcoal dark:text-warm-gray">
                  {action.label}
                </span>
                <span className="block text-xs text-slate dark:text-warm-gray/60 truncate">
                  {action.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* The single primary action */}
      <button
        onClick={() => navigate('/trips/new')}
        className="btn btn-primary w-full flex items-center justify-center gap-2 min-h-[60px]"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Trip
      </button>

      {/* Keyboard shortcut hint — pointer-based, so desktop only */}
      <div className="hidden md:block mt-4 p-3 rounded-lg bg-gray-50 dark:bg-navy-900/50 border border-gray-200 dark:border-navy-700">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-dusk-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-navy-800 border border-gray-300 dark:border-dusk-600 rounded text-xs font-mono">⌘K</kbd> for global search
          </span>
        </div>
      </div>
    </div>
  );
}
