import { type ReactNode } from "react";
import Modal from "./Modal";
import type { IconName } from "./ui/Icon";

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "6xl";
  formId?: string; // Optional form ID for Ctrl+S keyboard shortcut
  zIndex?: number; // Z-index for the modal (default: 80)
}

/**
 * Modal component optimized for forms.
 * This is a thin wrapper around Modal with form-specific defaults:
 * - Focuses the first input element on open
 * - Supports Ctrl+S/Cmd+S keyboard shortcut to submit (when formId provided)
 * - Shows entrance animation
 *
 * For non-form modals, use Modal directly.
 *
 * @example
 * ```tsx
 * <FormModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="Edit Item"
 *   icon="edit"
 *   formId="my-form"
 *   footer={
 *     <>
 *       <button type="button" onClick={onClose}>Cancel</button>
 *       <button type="submit" form="my-form">Save</button>
 *     </>
 *   }
 * >
 *   <form id="my-form" onSubmit={handleSubmit}>...</form>
 * </FormModal>
 * ```
 */
export default function FormModal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = "4xl",
  formId,
  zIndex,
}: FormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      footer={footer}
      maxWidth={maxWidth}
      formId={formId}
      zIndex={zIndex}
      focusFirstInput={true}
      animate={true}
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      {children}
    </Modal>
  );
}
