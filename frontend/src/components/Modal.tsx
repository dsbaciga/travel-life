import { useEffect, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: string;
  /** Optional icon (emoji or component) to show next to title */
  icon?: ReactNode;
  /** Modal content */
  children: ReactNode;
  /** Optional footer content (buttons, etc.) */
  footer?: ReactNode;
  /** Maximum width of the modal */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  /** Whether to show the close button in header */
  showCloseButton?: boolean;
  /** Additional class names for the modal container */
  className?: string;
  /** Whether clicking the backdrop closes the modal */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal */
  closeOnEscape?: boolean;
  /** Z-index for the modal (default: 80) */
  zIndex?: number;
  // Form-specific props (for form modals)
  /** Form ID for Ctrl+S keyboard shortcut to submit */
  formId?: string;
  /** Whether to focus the first input element instead of the modal container */
  focusFirstInput?: boolean;
  /** Whether to show entrance animation */
  animate?: boolean;
}

/** Selector for all focusable elements within a modal */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

/**
 * Reusable modal component with consistent styling, keyboard handling, and accessibility
 * 
 * @example
 * ```tsx
 * <Modal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="Edit Item"
 *   icon="✏️"
 *   footer={
 *     <div className="flex gap-2">
 *       <button onClick={handleSave} className="btn btn-primary">Save</button>
 *       <button onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
 *     </div>
 *   }
 * >
 *   <form>...</form>
 * </Modal>
 * ```
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = '4xl',
  showCloseButton = true,
  className = '',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  zIndex = 80,
  formId,
  focusFirstInput = false,
  animate = false,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const hasFocusedRef = useRef(false);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Handle keyboard events including focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
        return;
      }

      // Ctrl+S or Cmd+S to save form (only if formId is provided)
      if (formId && (e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // Prevent browser's save dialog
        const form = document.getElementById(formId) as HTMLFormElement;
        if (form) {
          form.requestSubmit(); // Use requestSubmit to trigger validation
        }
        return;
      }

      // Focus trap - keep Tab navigation within the modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          // Shift+Tab from first element - go to last
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          // Tab from last element - go to first
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [onClose, closeOnEscape, formId]
  );

  // Focus management: save trigger element and set initial focus
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (isOpen) {
      // Store the currently focused element to restore later
      triggerElementRef.current = document.activeElement as HTMLElement;

      if (focusFirstInput && !hasFocusedRef.current) {
        // Focus the first focusable input element (better UX for forms)
        timeoutId = setTimeout(() => {
          const firstInput = modalRef.current?.querySelector<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
          );
          if (firstInput) {
            firstInput.focus();
          } else {
            // Fallback to first focusable element or modal itself
            const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            (firstFocusable || modalRef.current)?.focus();
          }
          hasFocusedRef.current = true;
        }, 0);
      } else if (!focusFirstInput) {
        // Focus the first focusable element or the modal container itself
        timeoutId = setTimeout(() => {
          const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          (firstFocusable || modalRef.current)?.focus();
        }, 0);
      }
    } else {
      // Reset the flag when modal closes
      hasFocusedRef.current = false;
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, focusFirstInput]);

  // Restore focus to the trigger element when modal closes
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    // Detect transition from open -> closed
    if (prevIsOpenRef.current && !isOpen) {
      const el = triggerElementRef.current;
      if (el && typeof el.focus === 'function') {
        setTimeout(() => el.focus(), 0);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Restore focus on unmount (empty deps = only runs cleanup on unmount)
  useEffect(() => {
    return () => {
      const el = triggerElementRef.current;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    };
  }, []);

  // Handle keyboard events, body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center p-4`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm transition-opacity"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative bg-white dark:bg-navy-800 rounded-xl shadow-2xl ${maxWidthClasses[maxWidth]} w-full max-h-[90vh] overflow-hidden flex flex-col ${animate ? 'animate-in fade-in zoom-in-95 duration-200' : ''} ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gold/20 flex-shrink-0">
          <h2
            id="modal-title"
            className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            {icon && <span>{icon}</span>}
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              type="button"
              aria-label="Close modal"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gold transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-wrap justify-center sm:justify-end gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-gold/20 flex-shrink-0 bg-gray-50 dark:bg-navy-800/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Simple modal for displaying content without header/footer
 */
Modal.Simple = function SimpleModal({
  isOpen,
  onClose,
  children,
  maxWidth = 'md',
  className = '',
  zIndex = 80,
}: Pick<ModalProps, 'isOpen' | 'onClose' | 'children' | 'maxWidth' | 'className' | 'zIndex'>) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const prevIsOpenRef = useRef(isOpen);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap - keep Tab navigation within the modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [onClose]
  );

  // Focus management: save trigger and set initial focus
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (isOpen) {
      // Store the currently focused element to restore later
      triggerElementRef.current = document.activeElement as HTMLElement;

      // Focus the first focusable element or the modal container
      timeoutId = setTimeout(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (firstFocusable || modalRef.current)?.focus();
      }, 0);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen]);

  // Restore focus to trigger element when modal closes or unmounts
  useEffect(() => {
    if (prevIsOpenRef.current && !isOpen) {
      const el = triggerElementRef.current;
      if (el && typeof el.focus === 'function') {
        setTimeout(() => el.focus(), 0);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Restore focus on unmount (empty deps = only runs cleanup on unmount)
  useEffect(() => {
    return () => {
      const el = triggerElementRef.current;
      if (el && typeof el.focus === 'function') {
        el.focus();
      }
    };
  }, []);

  // Handle keyboard events and body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative bg-white dark:bg-navy-800 rounded-xl shadow-2xl ${maxWidthClasses[maxWidth]} w-full max-h-[90vh] overflow-auto ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

