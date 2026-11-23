import { useState } from 'react';
import Modal from './Modal';
import FormSection from './FormSection';
import type { BulkEntityType } from './BulkActionBar';
import Icon from "./ui/Icon";

/**
 * Field configuration for bulk edit.
 * `key` is constrained to the keys of the caller's update type `T`, so a
 * typo'd or stale field key is caught at compile time.
 */
export interface BulkEditField<T> {
  /** Unique field key */
  key: keyof T & string;
  /** Display label */
  label: string;
  /** Field type */
  type: 'text' | 'textarea' | 'select' | 'number';
  /** Options for select fields */
  options?: { value: string; label: string }[];
  /** Placeholder text */
  placeholder?: string;
}

interface BulkEditModalProps<T extends Record<string, unknown>> {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Type of entity being edited */
  entityType: BulkEntityType;
  /** Number of items being edited */
  selectedCount: number;
  /** Available fields for bulk edit */
  fields: BulkEditField<T>[];
  /** Callback when edit is submitted */
  onSubmit: (updates: T) => Promise<void>;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
}

/**
 * BulkEditModal provides a modal interface for bulk editing multiple items.
 * Only shows fields that make sense to bulk edit (not unique fields like name).
 *
 * Features:
 * - Dynamic field configuration based on entity type
 * - Only applies non-empty values (empty fields are skipped)
 * - Shows count of items being edited
 * - Loading state during submission
 *
 * @example
 * ```tsx
 * <BulkEditModal<{ category?: string; notes?: string }>
 *   isOpen={showBulkEdit}
 *   onClose={() => setShowBulkEdit(false)}
 *   entityType="activity"
 *   selectedCount={selectedIds.size}
 *   fields={[
 *     { key: 'category', label: 'Category', type: 'select', options: categoryOptions },
 *     { key: 'notes', label: 'Notes', type: 'textarea' },
 *   ]}
 *   onSubmit={handleBulkUpdate}
 *   isSubmitting={isUpdating}
 * />
 * ```
 */
export default function BulkEditModal<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  entityType,
  selectedCount,
  fields,
  onSubmit,
  isSubmitting = false,
}: BulkEditModalProps<T>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    // Clear error when user starts typing
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build updates object with only non-empty values
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== '') {
        // Find field config to handle type conversion
        const field = fields.find(f => f.key === key);
        if (field?.type === 'number') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            updates[key] = numValue;
          }
        } else {
          updates[key] = value;
        }
      }
    }

    // Check if any updates were provided
    if (Object.keys(updates).length === 0) {
      setErrors({ _form: 'Please fill in at least one field to update' });
      return;
    }

    // Safe: `fields` is typed as BulkEditField<T>[], so every key inserted
    // above is a key of T. This is the single point that bridges the
    // dynamically-built form values into the caller's static update type.
    await onSubmit(updates as T);
  };

  const handleClose = () => {
    // Reset form state when closing
    setValues({});
    setErrors({});
    onClose();
  };

  const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const pluralLabel = selectedCount === 1 ? entityLabel : `${entityLabel}s`;

  const renderField = (field: BulkEditField<T>) => {
    const value = values[field.key] || '';

    switch (field.type) {
      case 'select':
        return (
          <select
            id={`bulk-edit-${field.key}`}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="input"
          >
            <option value="">-- No change --</option>
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            id={`bulk-edit-${field.key}`}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="input"
            rows={3}
            placeholder={field.placeholder || 'Leave empty to skip...'}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            id={`bulk-edit-${field.key}`}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="input"
            placeholder={field.placeholder || 'Leave empty to skip...'}
            step="0.01"
          />
        );

      default:
        return (
          <input
            type="text"
            id={`bulk-edit-${field.key}`}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="input"
            placeholder={field.placeholder || 'Leave empty to skip...'}
          />
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit ${selectedCount} ${pluralLabel}`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info banner */}
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-gold/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Icon name="info" className="text-primary-600 dark:text-gold mt-0.5" />
            <div className="text-sm text-primary-800 dark:text-primary-200">
              <p className="font-medium">Bulk Edit Mode</p>
              <p className="mt-1 text-primary-700 dark:text-primary-300">
                Only filled fields will be updated. Leave fields empty to keep their current values.
                This will update {selectedCount} {pluralLabel.toLowerCase()}.
              </p>
            </div>
          </div>
        </div>

        {/* Form error */}
        {errors._form && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-700 dark:text-red-400">{errors._form}</p>
          </div>
        )}

        {/* Fields */}
        <FormSection title="Update Fields" icon="edit">
          <div className="space-y-4">
            {fields.map(field => (
              <div key={field.key}>
                <label
                  htmlFor={`bulk-edit-${field.key}`}
                  className="label"
                >
                  {field.label}
                </label>
                {renderField(field)}
                {errors[field.key] && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </FormSection>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-warm-gray dark:border-gold/20">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary"
          >
            {isSubmitting ? (
              <>
                <Icon name="spinner" size={16} className="animate-spin mr-2" />
                Updating...
              </>
            ) : (
              `Update ${selectedCount} ${pluralLabel}`
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
