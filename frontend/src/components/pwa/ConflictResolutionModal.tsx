import { useState, useMemo, useCallback } from 'react';
import {
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  ArrowsPointingInIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import Modal from '../Modal';
import ConflictFieldDiff from './ConflictFieldDiff';
import type {
  SyncConflict,
  ConflictResolution,
} from '../../types/sync.types';
import {
  ENTITY_TYPE_LABELS,
  RESOLUTION_LABELS,
  RESOLUTION_DESCRIPTIONS,
  getFieldDiffs,
  createMergedData,
} from '../../types/sync.types';

export interface ConflictResolutionModalProps {
  /** The conflict to resolve */
  conflict: SyncConflict;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when conflict is resolved */
  onResolve: (
    conflictId: number,
    resolution: ConflictResolution,
    resolvedData: Record<string, unknown>
  ) => void;
  /** Whether resolution is in progress */
  isResolving?: boolean;
}

/**
 * ConflictResolutionModal displays a sync conflict and allows the user to resolve it.
 *
 * Features:
 * - Side-by-side comparison of local vs server data
 * - Highlights which fields are different
 * - Three resolution options: Keep Local, Keep Server, Merge
 * - Field-by-field selection in merge mode
 * - Preview of resolved data before confirming
 *
 * @example
 * ```tsx
 * <ConflictResolutionModal
 *   conflict={selectedConflict}
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   onResolve={handleResolve}
 * />
 * ```
 */
export default function ConflictResolutionModal({
  conflict,
  isOpen,
  onClose,
  onResolve,
  isResolving = false,
}: ConflictResolutionModalProps) {
  const [selectedResolution, setSelectedResolution] = useState<ConflictResolution>('keep-local');
  const [fieldSelections, setFieldSelections] = useState<Record<string, 'local' | 'server'>>({});
  const [showPreview, setShowPreview] = useState(false);

  // Calculate field differences
  const fieldDiffs = useMemo(
    () => getFieldDiffs(conflict.localData, conflict.serverData),
    [conflict.localData, conflict.serverData]
  );

  // Initialize field selections for merge mode (default to local for all fields)
  const initializeFieldSelections = useCallback(() => {
    const selections: Record<string, 'local' | 'server'> = {};
    for (const diff of fieldDiffs) {
      selections[diff.field] = 'local'; // Default to local
    }
    setFieldSelections(selections);
  }, [fieldDiffs]);

  // Handle resolution option change
  const handleResolutionChange = (resolution: ConflictResolution) => {
    setSelectedResolution(resolution);
    if (resolution === 'merge') {
      initializeFieldSelections();
    }
  };

  // Handle field selection change in merge mode
  const handleFieldSelectionChange = (field: string, source: 'local' | 'server') => {
    setFieldSelections((prev) => ({
      ...prev,
      [field]: source,
    }));
  };

  // Calculate the resolved data based on selection
  const resolvedData = useMemo(() => {
    switch (selectedResolution) {
      case 'keep-local':
        return conflict.localData;
      case 'keep-server':
        return conflict.serverData;
      case 'merge':
        return createMergedData(conflict.localData, conflict.serverData, fieldSelections).data;
      default:
        return conflict.localData;
    }
  }, [selectedResolution, conflict.localData, conflict.serverData, fieldSelections]);

  // Handle resolve action
  const handleResolve = () => {
    onResolve(conflict.id, selectedResolution, resolvedData);
  };

  // Format timestamps
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, { hour12: true });
  };

  const entityTypeLabel = ENTITY_TYPE_LABELS[conflict.entityType];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Sync Conflict Detected"
      icon={<ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />}
      maxWidth="4xl"
      closeOnBackdropClick={!isResolving}
      closeOnEscape={!isResolving}
      footer={
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={isResolving}
            className="btn-secondary order-2 sm:order-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleResolve}
            disabled={isResolving}
            className="btn-primary order-1 sm:order-2 flex items-center justify-center gap-2"
          >
            {isResolving ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Resolving...
              </>
            ) : (
              <>
                <CheckIcon className="w-4 h-4" />
                Apply Resolution
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Conflict Info Banner */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex-shrink-0">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                {entityTypeLabel} has conflicting changes
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                This {entityTypeLabel.toLowerCase()} was modified both while you were offline and on the server.
                Choose how to resolve this conflict.
              </p>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-amber-600 dark:text-amber-400">
                <span className="flex items-center gap-1.5">
                  <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                  Your edit: {formatTimestamp(conflict.localTimestamp)}
                </span>
                <span className="flex items-center gap-1.5">
                  <ComputerDesktopIcon className="w-3.5 h-3.5" />
                  Server edit: {formatTimestamp(conflict.serverTimestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-charcoal dark:text-warm-gray">
            Choose Resolution Method
          </h4>

          <div className="grid gap-3">
            {/* Keep Local Option */}
            <label
              className={`
                flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                ${
                  selectedResolution === 'keep-local'
                    ? 'border-primary-500 dark:border-gold bg-primary-50 dark:bg-primary-900/20'
                    : 'border-warm-gray/30 dark:border-navy-600 hover:border-primary-300 dark:hover:border-gold/50'
                }
              `}
            >
              <input
                type="radio"
                name="resolution"
                value="keep-local"
                checked={selectedResolution === 'keep-local'}
                onChange={() => handleResolutionChange('keep-local')}
                className="mt-1 w-4 h-4 text-primary-600 dark:text-gold border-gray-300 dark:border-navy-600 focus:ring-primary-500 dark:focus:ring-gold"
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40">
                  <DevicePhoneMobileIcon className="w-4 h-4 text-primary-600 dark:text-gold" />
                </div>
                <div>
                  <div className="font-medium text-charcoal dark:text-warm-gray">
                    {RESOLUTION_LABELS['keep-local']}
                  </div>
                  <div className="text-xs text-slate dark:text-warm-gray/70">
                    {RESOLUTION_DESCRIPTIONS['keep-local']}
                  </div>
                </div>
              </div>
            </label>

            {/* Keep Server Option */}
            <label
              className={`
                flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                ${
                  selectedResolution === 'keep-server'
                    ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-warm-gray/30 dark:border-navy-600 hover:border-blue-300 dark:hover:border-blue-500/50'
                }
              `}
            >
              <input
                type="radio"
                name="resolution"
                value="keep-server"
                checked={selectedResolution === 'keep-server'}
                onChange={() => handleResolutionChange('keep-server')}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 dark:border-navy-600 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40">
                  <ComputerDesktopIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-charcoal dark:text-warm-gray">
                    {RESOLUTION_LABELS['keep-server']}
                  </div>
                  <div className="text-xs text-slate dark:text-warm-gray/70">
                    {RESOLUTION_DESCRIPTIONS['keep-server']}
                  </div>
                </div>
              </div>
            </label>

            {/* Merge Option */}
            <label
              className={`
                flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                ${
                  selectedResolution === 'merge'
                    ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-warm-gray/30 dark:border-navy-600 hover:border-emerald-300 dark:hover:border-emerald-500/50'
                }
              `}
            >
              <input
                type="radio"
                name="resolution"
                value="merge"
                checked={selectedResolution === 'merge'}
                onChange={() => handleResolutionChange('merge')}
                className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 dark:border-navy-600 focus:ring-emerald-500"
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                  <ArrowsPointingInIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="font-medium text-charcoal dark:text-warm-gray">
                    {RESOLUTION_LABELS['merge']}
                  </div>
                  <div className="text-xs text-slate dark:text-warm-gray/70">
                    {RESOLUTION_DESCRIPTIONS['merge']}
                  </div>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Field Differences */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-charcoal dark:text-warm-gray">
              Changed Fields ({fieldDiffs.length})
            </h4>
            {selectedResolution === 'merge' && (
              <span className="text-xs text-slate dark:text-warm-gray/70">
                Select which version to keep for each field
              </span>
            )}
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {fieldDiffs.length > 0 ? (
              fieldDiffs.map((diff) => (
                <ConflictFieldDiff
                  key={diff.field}
                  diff={diff}
                  mergeMode={selectedResolution === 'merge'}
                  selectedSource={fieldSelections[diff.field]}
                  onSelectionChange={handleFieldSelectionChange}
                />
              ))
            ) : (
              <div className="text-center py-8 text-slate dark:text-warm-gray/70">
                <p>No field differences found (metadata only conflict)</p>
              </div>
            )}
          </div>
        </div>

        {/* Preview Section */}
        <div className="border-t border-warm-gray/30 dark:border-navy-600 pt-4">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-gold hover:text-primary-700 dark:hover:text-amber-400 transition-colors"
          >
            {showPreview ? (
              <>
                <ChevronUpIcon className="w-4 h-4" />
                Hide Preview
              </>
            ) : (
              <>
                <ChevronDownIcon className="w-4 h-4" />
                Preview Resolved Data
              </>
            )}
          </button>

          {showPreview && (
            <div className="mt-3 bg-parchment dark:bg-navy-700/30 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-charcoal dark:text-warm-gray font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(resolvedData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
