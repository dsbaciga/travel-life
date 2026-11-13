import { useState, useEffect } from 'react';
import calendarFeedService from '../services/calendarFeed.service';
import type { CalendarTokenInfo } from '../services/calendarFeed.service';
import { getAssetBaseUrl } from '../lib/config';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

interface ApiError {
  response?: { data?: { message?: string } };
  message?: string;
}

function isApiError(err: unknown): err is ApiError {
  return err !== null && typeof err === 'object' && ('response' in err || 'message' in err);
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (!isApiError(err)) return undefined;
  return err.response?.data?.message ?? err.message;
}

/**
 * Build the absolute feed URL from the server-relative feed path.
 * Uses VITE_API_URL-derived host when absolute, otherwise the current origin
 * (production builds use relative URLs proxied by nginx).
 */
function buildFeedUrl(feedPath: string | null): string | null {
  if (!feedPath) return null;
  const base = getAssetBaseUrl();
  const origin = /^https?:\/\//.test(base) ? base : window.location.origin;
  return `${origin}${feedPath}`;
}

export default function CalendarFeedSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [tokenInfo, setTokenInfo] = useState<CalendarTokenInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadToken();
  }, []);

  const loadToken = async () => {
    try {
      const data = await calendarFeedService.getToken();
      setTokenInfo(data);
    } catch (error) {
      console.error('Failed to load calendar feed settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const feedUrl = buildFeedUrl(tokenInfo?.feedPath ?? null);
  const hasFeed = !!tokenInfo?.token;

  const handleGenerate = async () => {
    if (hasFeed) {
      const confirmed = await confirm({
        title: 'Rotate Calendar Feed URL',
        message:
          'Rotating generates a new secret URL and permanently invalidates the current one. Any calendar app subscribed to the old URL will stop receiving updates and must be re-subscribed. Continue?',
        confirmLabel: 'Rotate URL',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    setIsWorking(true);
    setMessage(null);
    setCopied(false);
    try {
      const data = await calendarFeedService.rotateToken();
      setTokenInfo(data);
      setMessage({
        type: 'success',
        text: hasFeed
          ? 'New feed URL generated. The old URL no longer works.'
          : 'Calendar feed enabled. Copy the URL below into your calendar app.',
      });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(err) || 'Failed to generate feed URL',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: 'Disable Calendar Feed',
      message:
        'This permanently disables the current feed URL. Subscribed calendar apps will stop receiving updates. You can generate a new URL later.',
      confirmLabel: 'Disable Feed',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsWorking(true);
    setMessage(null);
    setCopied(false);
    try {
      await calendarFeedService.revokeToken();
      setTokenInfo({ token: null, feedPath: null });
      setMessage({ type: 'success', text: 'Calendar feed disabled' });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: getApiErrorMessage(err) || 'Failed to disable feed',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ type: 'error', text: 'Could not copy to clipboard — copy the URL manually' });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-dusk-400">Loading calendar feed settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Calendar Feed</h2>

      <p className="text-gray-600 dark:text-dusk-400 mb-6">
        Subscribe to your trips from Google Calendar, Apple Calendar, Outlook, or any calendar app.
        The feed is a read-only iCal (.ics) URL containing your trips, flights and other
        transportation, and lodging stays. Your calendar app refreshes it automatically.
      </p>

      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Keep this URL private.</strong> Anyone who has it can see your trip schedule. If
          it leaks, rotate it — rotating immediately invalidates the old URL.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700'
          }`}
        >
          <p
            className={
              message.type === 'success'
                ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
            }
          >
            {message.text}
          </p>
        </div>
      )}

      {hasFeed && feedUrl && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Your secret feed URL
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={feedUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-gray-50 dark:bg-dusk-700 text-gray-900 dark:text-white font-mono text-sm"
            />
            <button
              onClick={handleCopy}
              type="button"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={handleGenerate}
          disabled={isWorking}
          type="button"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isWorking ? 'Working...' : hasFeed ? 'Rotate Feed URL' : 'Enable Calendar Feed'}
        </button>

        {hasFeed && (
          <button
            onClick={handleRevoke}
            disabled={isWorking}
            type="button"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            Disable Feed
          </button>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How to subscribe:
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
          <li>
            <strong>Google Calendar:</strong> Settings → Add calendar → From URL → paste the feed
            URL (Google refreshes subscribed calendars every 12–24 hours)
          </li>
          <li>
            <strong>Apple Calendar:</strong> File → New Calendar Subscription (Mac) or Settings →
            Calendar → Accounts → Add Subscribed Calendar (iPhone) → paste the feed URL
          </li>
          <li>
            <strong>Outlook:</strong> Add calendar → Subscribe from web → paste the feed URL
          </li>
        </ul>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
