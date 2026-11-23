import Icon from './ui/Icon';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import type { Trip } from '../types/trip';
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from './icons';

interface TripActionsMenuProps {
  trip: Trip;
  onDelete?: (id: number) => void;
  onArchiveToggle?: (trip: Trip) => void;
  /** Callback before navigating away (e.g., to save scroll position) */
  onNavigateAway?: () => void;
  /** Classes for the trigger button; sized by the caller to suit its row. */
  buttonClassName?: string;
}

const VIEWPORT_MARGIN = 8;
/** Height of the fixed bottom tab bar (h-16) plus a little breathing room; it is only shown below md. */
const BOTTOM_TAB_BAR_RESERVE = 72;
const MD_BREAKPOINT = 768;

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Per-trip overflow menu (Edit, Archive/Unarchive, Delete).
 *
 * The panel is portalled to document.body with fixed positioning, so no
 * overflow-hidden ancestor can clip it. It opens upward when there is no room
 * below, and keeps clear of the fixed bottom tab bar on phones. Actions run
 * after the menu closes; no dialog is rendered inside the menu.
 */
export default function TripActionsMenu({
  trip,
  onDelete,
  onArchiveToggle,
  onNavigateAway,
  buttonClassName = 'p-2 rounded-full hover:bg-primary-100 dark:hover:bg-navy-600 transition-colors',
}: TripActionsMenuProps) {
  const navigate = useNavigate();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Place the panel once it has been measured, before the browser paints.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const width = menuRef.current.offsetWidth;
    const height = menuRef.current.offsetHeight;
    const bottomReserve = window.innerWidth < MD_BREAKPOINT ? BOTTOM_TAB_BAR_RESERVE : VIEWPORT_MARGIN;
    const limit = window.innerHeight - bottomReserve;

    const fitsBelow = anchor.bottom + 4 + height <= limit;
    const top = fitsBelow
      ? anchor.bottom + 4
      : Math.max(VIEWPORT_MARGIN, anchor.top - 4 - height);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.right - width),
      window.innerWidth - width - VIEWPORT_MARGIN
    );
    setPosition({ top, left });
  }, [open]);

  // Close on outside press, Escape, scroll or resize (a fixed panel would drift from its row).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: Event) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition(null);
    setOpen((prev) => !prev);
  };

  const run = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    close();
    action();
  };

  const itemClass =
    'flex items-center w-full px-4 py-2 text-sm text-left text-primary-700 dark:text-primary-200 hover:bg-primary-50 dark:hover:bg-navy-600 transition-colors';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className={buttonClassName}
        aria-label={`Actions for ${trip.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <EllipsisVerticalIcon className="h-5 w-5 text-primary-500 dark:text-primary-400" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed z-[60] w-40 py-1 bg-white dark:bg-navy-700 rounded-lg shadow-lg ring-1 ring-primary-100 dark:ring-gold/20"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) =>
                run(e, () => {
                  onNavigateAway?.();
                  navigate(`/trips/${trip.id}/edit`);
                })
              }
              className={itemClass}
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              Edit
            </button>
            {onArchiveToggle && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => run(e, () => onArchiveToggle(trip))}
                className={itemClass}
              >
                <Icon name="folder" className="h-4 w-4 mr-2" />
                {trip.archived ? 'Unarchive' : 'Archive'}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => run(e, () => onDelete(trip.id))}
                className="flex items-center w-full px-4 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <TrashIcon className="h-4 w-4 mr-2" />
                Delete
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
