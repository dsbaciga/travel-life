/**
 * InlineEdit Component
 *
 * Allows editing text fields inline without opening a form.
 * Click to edit, blur or press Enter to save, Esc to cancel.
 *
 * Features:
 * - Auto-save on blur
 * - Enter to save, Esc to cancel
 * - Loading indicator during save
 * - Error handling
 * - Dark mode support
 * - Textarea mode for multiline text
 *
 * @example
 * ```tsx
 * <InlineEdit
 *   value={trip.name}
 *   onSave={async (newValue) => {
 *     await tripService.update(trip.id, { name: newValue });
 *   }}
 *   placeholder="Trip name"
 * />
 * ```
 */

import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import toast from 'react-hot-toast';

interface InlineEditProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  className?: string;
  editClassName?: string;
  displayClassName?: string;
  required?: boolean;
  validator?: (value: string) => string | null; // Returns error message or null
}

export default function InlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit',
  multiline = false,
  maxLength,
  className = '',
  editClassName = '',
  displayClassName = '',
  required = false,
  validator,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Reset edit value when prop value changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const trimmedValue = editValue.trim();

    // Validation
    if (required && !trimmedValue) {
      setError('This field is required');
      return;
    }

    if (validator) {
      const validationError = validator(trimmedValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // No change, just close
    if (trimmedValue === value) {
      setIsEditing(false);
      setError(null);
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await onSave(trimmedValue);
      setIsEditing(false);
      toast.success('Saved');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
    setError(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && multiline && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const baseInputClasses =
    'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky transition-colors';
  const inputClasses = error
    ? `${baseInputClasses} border-red-500 dark:border-red-400 ${editClassName}`
    : `${baseInputClasses} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${editClassName}`;

  if (!isEditing) {
    return (
      <div className={className}>
        <button
          onClick={() => setIsEditing(true)}
          className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group ${displayClassName}`}
          title="Click to edit"
          aria-label="Edit"
        >
          <span className={value ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
            {value || placeholder}
          </span>
          <span className="ml-2 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
            ✏️
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          name="inline-edit"
          aria-label="Edit value"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isSaving}
          rows={3}
          className={inputClasses}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          name="inline-edit"
          aria-label="Edit value"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isSaving}
          className={inputClasses}
        />
      )}

      {/* Helper text */}
      <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
          {isSaving && (
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-primary-500 dark:border-sky border-t-transparent rounded-full animate-spin" />
              Saving...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {multiline && (
            <span>
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Ctrl+Enter</kbd> to save
            </span>
          )}
          <span>
            <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Esc</kbd> to cancel
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline edit for numbers
 */
export function InlineEditNumber({
  value,
  onSave,
  min,
  max,
  step = 1,
  placeholder = 'Click to edit',
  className = '',
  displayClassName = '',
  prefix = '',
  suffix = '',
}: {
  value: number | null;
  onSave: (value: number | null) => Promise<void> | void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() || '');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const numValue = editValue ? parseFloat(editValue) : null;

    if (numValue === value) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(numValue);
      setIsEditing(false);
      toast.success('Saved');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value?.toString() || '');
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className={className}>
        <button
          onClick={() => setIsEditing(true)}
          className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group ${displayClassName}`}
          title="Click to edit"
          aria-label="Edit"
        >
          <span className={value !== null ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
            {value !== null ? `${prefix}${value}${suffix}` : placeholder}
          </span>
          <span className="ml-2 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
            ✏️
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="number"
        name="inline-edit"
        aria-label="Edit value"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
          }
        }}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={isSaving}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky"
      />
    </div>
  );
}
