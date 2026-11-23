import { useState, useCallback, useMemo, useRef } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import type { ConfirmDialogProps } from '../components/ConfirmDialog';

type ConfirmOptions = Omit<ConfirmDialogProps, 'isOpen' | 'onClose' | 'onConfirm' | 'isLoading'>;

interface UseConfirmDialogReturn {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  ConfirmDialogComponent: React.FC;
}

/**
 * Hook for showing confirmation dialogs
 *
 * Usage:
 * ```tsx
 * const { confirm, ConfirmDialogComponent } = useConfirmDialog();
 *
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Delete Item',
 *     message: 'Are you sure you want to delete this item?',
 *     confirmLabel: 'Delete',
 *     variant: 'danger'
 *   });
 *
 *   if (confirmed) {
 *     // Perform delete
 *   }
 * };
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     <ConfirmDialogComponent />
 *   </>
 * );
 * ```
 */
export function useConfirmDialog(): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      setResolveRef(() => resolve);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(false);
    setResolveRef(null);
    setOptions(null);
  }, [resolveRef]);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(true);
    setResolveRef(null);
    setOptions(null);
  }, [resolveRef]);

  // Keep the component identity stable across unrelated re-renders of the host. A new
  // function each render remounts the dialog, and a remount restores focus to the field
  // that opened it; in a form with an onBlur handler that blur re-renders the host again,
  // which remounts the dialog, and so on without end.
  const latest = useRef({ isOpen, options, handleClose, handleConfirm });
  latest.current = { isOpen, options, handleClose, handleConfirm };
  const ConfirmDialogComponent = useMemo<React.FC>(
    () =>
      function ConfirmDialogHost() {
        const { isOpen: open, options: opts, handleClose: close, handleConfirm: ok } = latest.current;
        return opts ? (
          <ConfirmDialog isOpen={open} onClose={close} onConfirm={ok} isLoading={false} {...opts} />
        ) : null;
      },
    []
  );

  return {
    confirm,
    ConfirmDialogComponent,
  };
}

/**
 * Simpler hook that returns just the confirm function
 * Use with ConfirmDialogProvider for a global dialog
 */
export function useConfirmDialogWithLoading(): UseConfirmDialogReturn & { setLoading: (loading: boolean) => void } {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      setIsLoading(false);
      setResolveRef(() => resolve);
    });
  }, []);

  const handleClose = useCallback(() => {
    if (isLoading) return;
    setIsOpen(false);
    resolveRef?.(false);
    setResolveRef(null);
    setOptions(null);
    setIsLoading(false);
  }, [isLoading, resolveRef]);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(true);
    setResolveRef(null);
    setOptions(null);
    setIsLoading(false);
  }, [resolveRef]);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const ConfirmDialogComponent: React.FC = () =>
    options ? (
      <ConfirmDialog
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        isLoading={isLoading}
        {...options}
      />
    ) : null;

  return {
    confirm,
    ConfirmDialogComponent,
    setLoading,
  };
}
