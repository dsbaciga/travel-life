/**
 * Enhanced Toast Utilities
 *
 * Wraps react-hot-toast with additional features:
 * - Undo functionality for destructive actions
 * - Progress toasts for uploads/long operations
 * - Action buttons in toasts
 * - Consistent styling
 */

import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';

interface UndoToastOptions {
  message: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}

interface ProgressToastOptions {
  message: string;
  progress?: number;
}

interface ActionToastOptions {
  message: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
  variant?: 'info' | 'success' | 'warning';
}

/**
 * Show a toast with an undo button
 * Perfect for delete operations
 *
 * @example
 * toastWithUndo({
 *   message: 'Trip deleted',
 *   onUndo: async () => {
 *     await tripService.restore(id);
 *     toast.success('Trip restored');
 *   }
 * });
 */
export function toastWithUndo({ message, onUndo, duration = 5000 }: UndoToastOptions) {
  return toast(
    (t: Toast) => (
      <div className="flex items-center gap-3">
        <span className="flex-1">{message}</span>
        <button
          onClick={async () => {
            toast.dismiss(t.id);
            await onUndo();
          }}
          className="px-3 py-1 bg-primary-500 dark:bg-sky text-white rounded-lg text-sm font-medium hover:bg-primary-600 dark:hover:bg-sky/90 transition-colors"
        >
          Undo
        </button>
      </div>
    ),
    {
      duration,
      icon: '↩️',
    }
  );
}

/**
 * Show a progress toast for uploads or long-running operations
 *
 * @example
 * const toastId = toastProgress({ message: 'Uploading photos...' });
 * // Update progress
 * updateProgressToast(toastId, 'Uploading photos...', 50);
 * // Complete
 * toast.success('Photos uploaded', { id: toastId });
 */
export function toastProgress({ message, progress = 0 }: ProgressToastOptions) {
  return toast(
    () => (
      <div className="w-full">
        <div className="flex items-center gap-2 mb-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full" />
          <span className="flex-1">{message}</span>
          <span className="text-sm text-gray-500">{progress}%</span>
        </div>
        {progress > 0 && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            {/* Dynamic progress width requires CSS variable - cannot be moved to static CSS */}
            <div
              className="bg-primary-500 dark:bg-sky h-1.5 rounded-full transition-all duration-300 progress-bar"
              style={{ '--progress-width': `${progress}%` }}
            />
          </div>
        )}
      </div>
    ),
    {
      duration: Infinity,
      id: `progress-${Date.now()}`,
    }
  );
}

/**
 * Update an existing progress toast
 */
export function updateProgressToast(toastId: string, message: string, progress: number) {
  toast(
    () => (
      <div className="w-full">
        <div className="flex items-center gap-2 mb-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full" />
          <span className="flex-1">{message}</span>
          <span className="text-sm text-gray-500">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          {/* Dynamic progress width requires CSS variable - cannot be moved to static CSS */}
          <div
            className="bg-primary-500 dark:bg-sky h-1.5 rounded-full transition-all duration-300 progress-bar"
            style={{ '--progress-width': `${progress}%` }}
          />
        </div>
      </div>
    ),
    { id: toastId, duration: Infinity }
  );
}

/**
 * Show a toast with a custom action button
 *
 * @example
 * toastWithAction({
 *   message: 'New version available',
 *   actionLabel: 'Refresh',
 *   onAction: () => window.location.reload(),
 *   variant: 'info'
 * });
 */
export function toastWithAction({
  message,
  actionLabel,
  onAction,
  variant = 'info',
}: ActionToastOptions) {
  const iconMap = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
  };

  return toast(
    (t: Toast) => (
      <div className="flex items-center gap-3">
        <span className="flex-1">{message}</span>
        <button
          onClick={async () => {
            toast.dismiss(t.id);
            await onAction();
          }}
          className="px-3 py-1 bg-primary-500 dark:bg-sky text-white rounded-lg text-sm font-medium hover:bg-primary-600 dark:hover:bg-sky/90 transition-colors"
        >
          {actionLabel}
        </button>
      </div>
    ),
    {
      icon: iconMap[variant],
      duration: 6000,
    }
  );
}

/**
 * Show a success toast with optional action
 */
export function toastSuccess(message: string, action?: { label: string; onClick: () => void }) {
  if (action) {
    return toastWithAction({
      message,
      actionLabel: action.label,
      onAction: action.onClick,
      variant: 'success',
    });
  }
  return toast.success(message);
}

/**
 * Show an error toast
 */
export function toastError(message: string) {
  return toast.error(message);
}

/**
 * Show an info toast
 */
export function toastInfo(message: string) {
  return toast(message, {
    icon: 'ℹ️',
  });
}

/**
 * Show a warning toast
 */
export function toastWarning(message: string) {
  return toast(message, {
    icon: '⚠️',
    duration: 5000,
  });
}

/**
 * Batch operation toast helper
 * Shows progress and final result for batch operations
 *
 * @example
 * const batchToast = startBatchToast('Deleting photos');
 * for (let i = 0; i < photos.length; i++) {
 *   await deletePhoto(photos[i].id);
 *   updateBatchToast(batchToast.id, i + 1, photos.length);
 * }
 * completeBatchToast(batchToast.id, 'Photos deleted');
 */
export function startBatchToast(operation: string) {
  const id = toast(
    () => (
      <div className="flex items-center gap-2">
        <div className="animate-spin h-4 w-4 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full" />
        <span>{operation} (0/0)</span>
      </div>
    ),
    { duration: Infinity }
  );

  return { id };
}

export function updateBatchToast(toastId: string, current: number, total: number, operation: string) {
  toast(
    () => (
      <div className="w-full">
        <div className="flex items-center gap-2 mb-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full" />
          <span className="flex-1">
            {operation} ({current}/{total})
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          {/* Dynamic progress width requires CSS variable - cannot be moved to static CSS */}
          <div
            className="bg-primary-500 dark:bg-sky h-1.5 rounded-full transition-all duration-300 progress-bar"
            style={{ '--progress-width': `${(current / total) * 100}%` }}
          />
        </div>
      </div>
    ),
    { id: toastId, duration: Infinity }
  );
}

export function completeBatchToast(toastId: string, message: string) {
  toast.success(message, { id: toastId });
}

export function failBatchToast(toastId: string, message: string) {
  toast.error(message, { id: toastId });
}
