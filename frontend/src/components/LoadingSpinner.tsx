import { memo } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'current';
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-3',
  xl: 'h-16 w-16 border-4',
};

const colorClasses = {
  primary: 'border-primary-500 dark:border-sky',
  white: 'border-white',
  current: 'border-current',
};

/**
 * Reusable loading spinner component
 *
 * @example
 * ```tsx
 * // Basic spinner
 * <LoadingSpinner />
 *
 * // With size and color
 * <LoadingSpinner size="lg" color="white" />
 *
 * // With accessible label
 * <LoadingSpinner label="Loading trips..." />
 *
 * // Full page loading
 * <LoadingSpinner.FullPage message="Loading your data..." />
 * ```
 */
const LoadingSpinner = memo(function LoadingSpinner({
  size = 'md',
  color = 'primary',
  className = '',
  label,
}: LoadingSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`animate-spin rounded-full border-b-transparent ${sizeClasses[size]} ${colorClasses[color]}`}
        aria-hidden="true"
      />
      {label && (
        <p className="mt-3 text-sm text-slate dark:text-warm-gray font-body">
          {label}
        </p>
      )}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  );
}) as React.MemoExoticComponent<React.FC<LoadingSpinnerProps>> & {
  FullPage: React.FC<FullPageProps>;
  Inline: React.FC<InlineProps>;
};

interface FullPageProps {
  message?: string;
}

/**
 * Full page loading spinner with centered content
 */
LoadingSpinner.FullPage = function FullPageSpinner({ message = 'Loading...' }: FullPageProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] py-12">
      <LoadingSpinner size="lg" label={message} />
    </div>
  );
};

interface InlineProps {
  className?: string;
}

/**
 * Inline loading spinner for buttons and small areas
 */
LoadingSpinner.Inline = function InlineSpinner({ className = '' }: InlineProps) {
  return (
    <div
      className={`inline-flex items-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="animate-spin h-4 w-4 border-2 rounded-full border-current border-b-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;
