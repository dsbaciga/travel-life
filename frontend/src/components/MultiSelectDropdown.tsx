import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from './icons';

export interface MultiSelectOption {
  value: string;
  label: string;
  emoji?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  className?: string;
}

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  className = '',
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(options.map((o) => o.value));
  };

  const getButtonLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const opt = options.find((o) => o.value === selected[0]);
      if (opt) {
        return opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label;
      }
      return selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
          selected.length > 0
            ? 'bg-primary-600 dark:bg-sky text-white dark:text-navy-900'
            : 'bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-600'
        }`}
      >
        <span className="truncate">{getButtonLabel()}</span>
        <ChevronDownIcon
          className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 min-w-[220px] max-h-72 overflow-auto rounded-lg bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-600 shadow-lg animate-fade-in">
          {/* Select All / Clear */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-navy-700 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-primary-600 dark:text-sky hover:underline font-medium"
            >
              Select all
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-slate dark:text-warm-gray hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Options */}
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors ${
                  isSelected
                    ? 'bg-primary-50 dark:bg-navy-700 text-charcoal dark:text-warm-gray'
                    : 'text-slate dark:text-warm-gray hover:bg-gray-50 dark:hover:bg-navy-700'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 ${
                    isSelected
                      ? 'bg-primary-600 dark:bg-sky border-primary-600 dark:border-sky'
                      : 'border-gray-300 dark:border-navy-600'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white dark:text-navy-900" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {option.emoji && <span>{option.emoji}</span>}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
