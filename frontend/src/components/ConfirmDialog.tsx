import { useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { pushModal, popModal, isTopModal } from '../utils/modalStack';
import Icon from './ui/Icon';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const modalStackIdRef = useRef<number | null>(null);
  const generatedId = useId();
  const dialogTitleId = `confirm-dialog-title-${generatedId}`;
  const dialogDescriptionId = `confirm-dialog-description-${generatedId}`;

  // Focus trap and keyboard handling
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Another dialog opened above this one owns the keyboard (Escape closes only the top one).
    if (!isTopModal(modalStackIdRef.current)) return;
    if (e.key === 'Escape' && !isLoading) {
      onClose();
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  }, [isLoading, onClose]);

  // Shared modal stack: ref-counted scroll lock and a single topmost dialog, so Escape
  // in this dialog does not also close a modal underneath it.
  useEffect(() => {
    if (!isOpen) return;
    const id = pushModal();
    modalStackIdRef.current = id;
    return () => {
      popModal(id);
      modalStackIdRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Store current focus to restore later
      const previouslyFocused = document.activeElement as HTMLElement;

      // Focus the cancel button (safer default)
      cancelButtonRef.current?.focus();

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previouslyFocused?.focus();
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: (
        <Icon name="alert" size={24} className="text-red-600 dark:text-red-400" />
      ),
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      confirmButton: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-600/20',
    },
    warning: {
      icon: (
        <Icon name="alert" size={24} className="text-amber-600 dark:text-amber-400" />
      ),
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      confirmButton: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20',
    },
    info: {
      icon: (
        <Icon name="info" size={24} className="text-primary-600 dark:text-sky" />
      ),
      iconBg: 'bg-primary-100 dark:bg-navy-800',
      confirmButton: 'bg-gradient-to-r from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-lg shadow-primary-500/20',
    },
  };

  const styles = variantStyles[variant];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      aria-describedby={dialogDescriptionId}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border-2 border-primary-500/10 dark:border-gold/20 animate-fade-in-up"
        style={{ animationDuration: '0.2s' }}
      >
        <div className="flex items-start space-x-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center`}>
            {styles.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3
              id={dialogTitleId}
              className="text-lg font-display font-semibold text-charcoal dark:text-warm-gray"
            >
              {title}
            </h3>
            <p
              id={dialogDescriptionId}
              className="mt-2 text-sm text-slate dark:text-warm-gray/80 font-body"
            >
              {message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 space-y-2 space-y-reverse sm:space-y-0">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg font-medium font-body text-slate dark:text-warm-gray bg-parchment dark:bg-navy-700 hover:bg-primary-50 dark:hover:bg-navy-600 border-2 border-primary-100 dark:border-navy-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-lg font-medium font-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center ${styles.confirmButton}`}
          >
            {isLoading ? (
              <>
                <Icon name="spinner" size={16} className="animate-spin -ml-1 mr-2 text-white" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
