import { useEffect, useId, useRef, useState, type ElementType, type ReactNode } from 'react';

interface ExpandableTextProps {
  children: ReactNode;
  /** Element to render the text in. Defaults to `p`. */
  as?: ElementType;
  /** Classes for the text element (colour, size, spacing). The clamp is added here. */
  className?: string;
  /** Classes for the Show more / Show less button. */
  toggleClassName?: string;
}

/**
 * Text clamped to two lines with a Show more / Show less control that appears only
 * when the text is actually cut off. Each instance keeps its own expanded state.
 */
export default function ExpandableText({
  children,
  as: Tag = 'p',
  className = '',
  toggleClassName = '',
}: ExpandableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const textId = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Measure while clamped; once expanded the last measurement stands, so the
  // control stays available to collapse the text again.
  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expanded, children]);

  return (
    <>
      <Tag
        ref={ref}
        id={textId}
        className={`break-words [overflow-wrap:anywhere] ${expanded ? '' : 'line-clamp-2'} ${className}`}
      >
        {children}
      </Tag>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={textId}
          className={`block text-xs font-medium text-primary-600 dark:text-gold hover:underline py-1 ${toggleClassName}`}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
}
