import { useState } from 'react';
import Modal from './Modal';
import FormSection from './FormSection';
import type { BulkEntityType } from './BulkActionBar';

/**
 * Field configuration for bulk edit
 */
interface BulkEditField {
  /** Unique field key */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: 'text' | 'textarea' | 'select' | 'number';
  /** Options for select fields */
  options?: { value: string; label: string }[];
  /** Placeholder text */
  placeholder?: string;
}

interface BulkEditModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Type of entity being edited */
  entityType: BulkEntityType;
  /** Number of items being edited */
  selectedCount: number;
  /** Available fields for bulk edit */
  fields: BulkEditField[];
  /** Callback when edit is submitted */
  onSubmit: (updates: Record<string, unknown>) => Promise<void>;
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
 * <BulkEditModal
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
export default function BulkEditModal({
  isOpen,
  onClose,
  entityType,
  selectedCount,
  fields,
  onSubmit,
  isSubmitting = false,
}: BulkEditModalProps) {
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

    await onSubmit(updates);
  };

  const handleClose = () => {
    // Reset form state when closing
    setValues({});
    setErrors({});
    onClose();
  };

  const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const pluralLabel = selectedCount === 1 ? entityLabel : `${entityLabel}s`;

  const renderField = (field: BulkEditField) => {
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
            <svg
              className="w-5 h-5 text-primary-600 dark:text-gold mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
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
        <FormSection title="Update Fields" icon="✏️">
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
                <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
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
