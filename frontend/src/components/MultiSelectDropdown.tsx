import { useState, useRef, useEffect, useCallback } from 'react';
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  // Focus the first option when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, focusedIndex]);

  const toggleOption = useCallback((value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }, [selected, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusedIndex(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < options.length) {
            toggleOption(options[focusedIndex].value);
          }
          break;
      }
    },
    [isOpen, focusedIndex, options, toggleOption]
  );

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

  const dropdownId = `multiselect-${placeholder.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dropdownId : undefined}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 focus-visible:outline-none ${
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
        <div
          id={dropdownId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={placeholder}
          className="absolute z-50 mt-1 min-w-[220px] max-h-72 overflow-auto rounded-lg bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-600 shadow-lg animate-fade-in"
        >
          {/* Select All / Clear */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-navy-700 text-xs">
            <button
              type="button"
              onClick={selectAll}
              aria-label="Select all options"
              className="text-primary-600 dark:text-sky hover:underline font-medium focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 focus-visible:outline-none rounded"
            >
              Select all
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                aria-label="Clear all selections"
                className="text-slate dark:text-warm-gray hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 focus-visible:outline-none rounded"
              >
                Clear
              </button>
            )}
          </div>

          {/* Options */}
          {options.map((option, index) => {
            const isSelected = selected.includes(option.value);
            const isFocused = focusedIndex === index;
            return (
              <button
                key={option.value}
                ref={(el) => { optionRefs.current[index] = el; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggleOption(option.value)}
                onMouseEnter={() => setFocusedIndex(index)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors focus-visible:outline-none ${
                  isFocused
                    ? 'bg-primary-50 dark:bg-navy-700'
                    : ''
                } ${
                  isSelected
                    ? 'text-charcoal dark:text-warm-gray'
                    : 'text-slate dark:text-warm-gray'
                } ${
                  !isFocused && !isSelected ? 'hover:bg-gray-50 dark:hover:bg-navy-700' : ''
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
