import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
  className?: string;
}

const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|#)/i;

const components: Components = {
  // A wide table scrolls inside its own box instead of widening the page.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children }) => {
    const safeHref = href && SAFE_URL_PATTERN.test(href) ? href : undefined;
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  // Disable img rendering — render as a plain link instead to prevent
  // arbitrary external images from breaking layouts and leaking IPs
  img: ({ src, alt }) => {
    const safeSrc = src && SAFE_URL_PATTERN.test(src) ? src : undefined;
    return (
      <a href={safeSrc} target="_blank" rel="noopener noreferrer">
        {alt || src || 'image'}
      </a>
    );
  },
};

export default function MarkdownRenderer({ content, compact = false, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  const proseSize = compact ? 'prose-sm' : 'prose-base';

  return (
    <div className={`prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] ${proseSize} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
