import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { DefaultChecklistStatus, ChecklistType } from '../types/checklist';

interface ChecklistSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedTypes: ChecklistType[]) => Promise<void>;
  availableChecklists: DefaultChecklistStatus[];
  mode: 'add' | 'remove';
}

export default function ChecklistSelectorModal({
  isOpen,
  onClose,
  onConfirm,
  availableChecklists,
  mode,
}: ChecklistSelectorModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<ChecklistType>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter checklists based on mode
  const filteredChecklists = availableChecklists.filter(checklist =>
    mode === 'add' ? !checklist.exists : checklist.exists
  );

  // Reset selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTypes(new Set());
    }
  }, [isOpen]);

  const handleToggle = (type: ChecklistType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedTypes(new Set(filteredChecklists.map(c => c.type)));
  };

  const handleDeselectAll = () => {
    setSelectedTypes(new Set());
  };

  const handleSubmit = async () => {
    if (selectedTypes.size === 0) return;

    setIsSubmitting(true);
    try {
      await onConfirm(Array.from(selectedTypes));
      onClose();
    } catch (error) {
      console.error('Failed to update checklists:', error);
      alert('Failed to update checklists');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getChecklistIcon = (type: ChecklistType) => {
    switch (type) {
      case 'airports':
        return '✈️';
      case 'countries':
        return '🌍';
      case 'cities':
        return '🏙️';
      case 'us_states':
        return '🗽';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dusk-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {mode === 'add' ? 'Add Default Checklist(s)' : 'Remove Default Checklist(s)'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1">
                {mode === 'add'
                  ? 'Select which default checklists you want to add to your account'
                  : 'Select which default checklists you want to remove from your account'}
              </p>
            </div>
            <button
              onClick={onClose}
              type="button"
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-dusk-400 dark:hover:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredChecklists.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-dusk-400">
              {mode === 'add'
                ? 'All default checklists have already been added'
                : 'No default checklists to remove'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChecklists.map((checklist) => (
                <label
                  key={checklist.type}
                  className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedTypes.has(checklist.type)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-dusk-700 hover:border-gray-300 dark:hover:border-dusk-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(checklist.type)}
                      onChange={() => handleToggle(checklist.type)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{getChecklistIcon(checklist.type)}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {checklist.name}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-dusk-400">
                        {checklist.description}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dusk-700 flex justify-between items-center">
          <div className="flex gap-2">
            {filteredChecklists.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Select All
                </button>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Deselect All
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedTypes.size === 0}
              className="btn btn-primary"
            >
              {isSubmitting
                ? mode === 'add'
                  ? 'Adding...'
                  : 'Removing...'
                : mode === 'add'
                ? `Add ${selectedTypes.size > 0 ? `(${selectedTypes.size})` : ''}`
                : `Remove ${selectedTypes.size > 0 ? `(${selectedTypes.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
