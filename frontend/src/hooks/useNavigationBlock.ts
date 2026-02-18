import { useEffect, useCallback, useRef, useState } from 'react';

/**
 * Custom hook to block in-app navigation when a condition is met.
 * Works with BrowserRouter (unlike useBlocker which requires a data router).
 *
 * Returns a blocker object with state, reset, and proceed methods
 * matching the useBlocker API shape for easy migration.
 */
export function useNavigationBlock(shouldBlock: boolean) {
  const [blocked, setBlocked] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  // Skip the next popstate event when we're allowing a navigation through
  const allowNextPopRef = useRef(false);

  const reset = useCallback(() => {
    pendingNavRef.current = null;
    setBlocked(false);
  }, []);

  const proceed = useCallback(() => {
    const nav = pendingNavRef.current;
    pendingNavRef.current = null;
    setBlocked(false);
    if (nav) nav();
  }, []);

  useEffect(() => {
    if (!shouldBlock) {
      pendingNavRef.current = null;
      return;
    }

    // Intercept pushState and replaceState
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const interceptNav = (
      original: typeof history.pushState,
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) => {
      // Only block if the pathname is actually changing
      const newUrl = url ? new URL(url.toString(), location.href) : null;
      if (newUrl && newUrl.pathname !== location.pathname) {
        pendingNavRef.current = () => original(data, unused, url);
        setBlocked(true);
        return;
      }
      original(data, unused, url);
    };

    history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      interceptNav(originalPushState, data, unused, url);
    };

    history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      interceptNav(originalReplaceState, data, unused, url);
    };

    // Intercept back/forward navigation
    const handlePopState = () => {
      // If we're allowing this navigation through (user clicked "Leave"), skip
      if (allowNextPopRef.current) {
        allowNextPopRef.current = false;
        return;
      }

      // Cancel the back/forward by pushing the current URL back onto the stack
      originalPushState(history.state, '', location.href);

      // Store a pending nav that flags allowNextPop before triggering back()
      pendingNavRef.current = () => {
        allowNextPopRef.current = true;
        history.back();
      };
      setBlocked(true);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handlePopState);
      pendingNavRef.current = null;
    };
  }, [shouldBlock]);

  return {
    state: blocked ? 'blocked' as const : 'idle' as const,
    reset,
    proceed,
  };
}
