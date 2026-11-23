import { Link } from 'react-router';
import { CloseIcon, SpinnerIcon } from './icons';
import type { BannerContent } from '../utils/pdfImportNotifications';
import Icon, { type IconName } from './ui/Icon';

const TONE_ACCENT: Record<BannerContent['tone'], string> = {
  success: 'border-l-green-600 dark:border-l-green-400',
  neutral: 'border-l-primary-500 dark:border-l-gold',
  error: 'border-l-red-600 dark:border-l-red-400',
  working: 'border-l-primary-500 dark:border-l-gold',
};

const TONE_ICON: Record<BannerContent['tone'], string> = {
  success: 'text-green-700 dark:text-green-400',
  neutral: 'text-primary-600 dark:text-gold',
  error: 'text-red-600 dark:text-red-400',
  working: 'text-primary-600 dark:text-gold',
};

function ToneIcon({ tone }: { tone: BannerContent['tone'] }) {
  if (tone === 'working') {
    return <SpinnerIcon className={`w-5 h-5 flex-none mt-0.5 ${TONE_ICON[tone]}`} />;
  }
  const name: IconName = tone === 'success' ? 'success' : tone === 'error' ? 'alert' : 'document';
  return <Icon name={name} className={`flex-none mt-0.5 ${TONE_ICON[tone]}`} />;
}

const ACTION_CLASSES =
  'mt-2 inline-flex items-center min-h-[44px] sm:min-h-0 text-sm font-semibold text-primary-600 dark:text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 rounded';

interface BannerProps extends BannerContent {
  visible: boolean;
  onDismiss: () => void;
}

export function PdfImportBanner({ tone, title, body, action, visible, onDismiss }: BannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto w-[min(24rem,calc(100vw-2rem))] flex gap-3 p-4 rounded-xl border border-l-4 border-primary-500/20 dark:border-gold/20 ${TONE_ACCENT[tone]} bg-white dark:bg-navy-800 shadow-xl transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <ToneIcon tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-charcoal dark:text-white break-words">{title}</p>
        <p className="mt-0.5 text-sm text-slate dark:text-warm-gray break-words">{body}</p>
        {action && 'to' in action && (
          <Link to={action.to} onClick={onDismiss} className={ACTION_CLASSES}>
            {action.label}
            <Icon name="forward" size={16} className="ml-1" />
          </Link>
        )}
        {action && 'onClick' in action && (
          <button type="button" onClick={action.onClick} className={ACTION_CLASSES}>
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-none self-start p-1 -m-1 rounded text-slate dark:text-warm-gray hover:text-charcoal dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
