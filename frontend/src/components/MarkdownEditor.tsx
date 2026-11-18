import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

/** Phones and other touch screens, where nested scrolling and resize grips do not work. */
const AUTO_GROW_QUERY = '(max-width: 639px), (pointer: coarse)';

function useAutoGrow(): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(AUTO_GROW_QUERY).matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(AUTO_GROW_QUERY);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return matches;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  rows = 4,
  placeholder,
  label,
  required = false,
  disabled = false,
  compact = false,
  className = '',
}: MarkdownEditorProps) {
  const [previewing, setPreviewing] = useState(false);
  // On touch screens the textarea grows with its content, so only the surrounding
  // sheet scrolls and the Preview/Edit toggle can stay pinned above the text.
  const autoGrow = useAutoGrow();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [autoGrow, value, previewing]);

  const minHeight = `${rows * 1.5 + 1}rem`;

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={`flex items-center justify-end mb-1 ${
          autoGrow ? 'sticky top-0 z-10 bg-white dark:bg-navy-800 py-1 -mt-1' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setPreviewing(!previewing)}
          disabled={disabled}
          className="text-xs font-medium px-2 py-1 rounded transition-colors text-primary-600 dark:text-gold hover:bg-primary-50 dark:hover:bg-navy-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {previewing ? 'Edit' : 'Preview'}
        </button>
      </div>

      {previewing ? (
        <div
          className="input overflow-y-auto"
          style={autoGrow ? { minHeight } : { minHeight, maxHeight: '20rem' }}
        >
          {value ? (
            <MarkdownRenderer content={value} compact={compact} />
          ) : (
            <p className="text-gray-400 dark:text-dusk-400 italic text-sm">Nothing to preview</p>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`input w-full ${autoGrow ? 'resize-none overflow-hidden' : ''}`}
        />
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-dusk-400">
        Supports <strong>bold</strong>, <em>italic</em>, <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-gold underline">links</a>, lists, and more
      </p>
    </div>
  );
}
