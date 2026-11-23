import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import Icon, { type IconName } from './ui/Icon';
import { useActiveTrip, getDayOfTrip } from '../hooks/useActiveTrip';

interface CaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CaptureOption {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  /** Trip-detail tab this capture type lives on. */
  tab: string;
  /**
   * Whether the destination tab needs `?action=new` to open its create form.
   * The photos tab renders its uploader inline, so it opens without one.
   */
  opensForm: boolean;
}

const CAPTURE_OPTIONS: CaptureOption[] = [
  {
    id: 'photos',
    label: 'Photos',
    hint: 'Upload from camera roll',
    icon: 'photo',
    tab: 'photos',
    opensForm: false,
  },
  {
    id: 'location',
    label: 'Location',
    hint: 'A place you visited',
    icon: 'place',
    tab: 'locations',
    opensForm: true,
  },
  {
    id: 'journal',
    label: 'Journal entry',
    hint: 'Write about today',
    icon: 'journal',
    tab: 'journal',
    opensForm: true,
  },
  {
    id: 'lodging',
    label: 'Lodging',
    hint: 'Where you stayed',
    icon: 'lodging',
    tab: 'lodging',
    opensForm: true,
  },
  {
    id: 'transportation',
    label: 'Transport',
    hint: 'Flights, trains, drives',
    icon: 'transportation',
    tab: 'transportation',
    opensForm: true,
  },
];

/**
 * Bottom sheet listing the five things a traveller can capture, filed against
 * the trip they are in (or their active trip when opened from elsewhere).
 *
 * Replaces the "unlabelled + button" pattern: every row names what it creates
 * and the header names the trip it will be attached to, so capture never files
 * an entry somewhere the user did not expect.
 */
export default function CaptureSheet({ isOpen, onClose }: CaptureSheetProps) {
  const navigate = useNavigate();
  // Only resolve the target trip once the sheet is actually opened — this
  // component is mounted by the always-present bottom nav, including on the
  // signed-out login screen.
  const { trip, isLoading } = useActiveTrip({ enabled: isOpen });
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const dayOfTrip = useMemo(() => getDayOfTrip(trip), [trip]);

  // Close on Escape and hold focus inside the sheet while it is open.
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const firstButton = sheetRef.current?.querySelector<HTMLElement>('button, a');
    firstButton?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href]'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCapture = (option: CaptureOption) => {
    if (!trip) return;
    const action = option.opensForm ? '&action=new' : '';
    navigate(`/trips/${trip.id}?tab=${option.tab}${action}`);
    onClose();
  };

  const subtitle = [
    dayOfTrip ? `Day ${dayOfTrip}` : null,
    trip?.status && !dayOfTrip ? trip.status : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Add to trip">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-label="Close capture menu"
        tabIndex={-1}
      />

      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-2xl dark:bg-navy-800 safe-area-inset-bottom"
      >
        {/* Drag handle — visual affordance only; the sheet closes via the
            backdrop, the close button or Escape. */}
        <div className="flex justify-center pt-3" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-navy-600" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-charcoal dark:text-warm-gray">
              {isLoading
                ? 'Loading…'
                : trip
                  ? `Add to ${trip.title}`
                  : 'Start a trip first'}
            </h2>
            {trip && subtitle && (
              <p className="truncate text-sm text-slate dark:text-warm-gray/70">{subtitle}</p>
            )}
            {!trip && !isLoading && (
              <p className="text-sm text-slate dark:text-warm-gray/70">
                Captures are filed against a trip.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate hover:bg-parchment dark:text-warm-gray dark:hover:bg-navy-700"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="px-3 pb-4">
          {trip ? (
            <ul className="flex flex-col">
              {CAPTURE_OPTIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => handleCapture(option)}
                    className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-parchment active:bg-parchment dark:hover:bg-navy-700 dark:active:bg-navy-700"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-parchment text-primary-600 dark:bg-navy-900 dark:text-gold">
                      <Icon name={option.icon} size={24} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-body font-semibold text-charcoal dark:text-warm-gray">
                        {option.label}
                      </span>
                      <span className="block truncate text-sm text-slate dark:text-warm-gray/60">
                        {option.hint}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !isLoading && (
              <button
                type="button"
                onClick={() => {
                  navigate('/trips/new');
                  onClose();
                }}
                className="btn btn-primary flex w-full items-center justify-center gap-2"
              >
                <Icon name="add" />
                New trip
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
