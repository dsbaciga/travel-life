import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useScrollStore } from '../store/scrollStore';

/**
 * Component that scrolls to the top of the page whenever the route changes,
 * unless skipNextScrollToTop is set in the scroll store or the user navigated
 * via browser back/forward (POP navigation).
 *
 * This allows pages to preserve scroll position when returning from
 * navigation (e.g., returning to trips list after editing a trip).
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const { skipNextScrollToTop, setSkipNextScrollToTop } = useScrollStore();

  useEffect(() => {
    if (skipNextScrollToTop) {
      // Reset the flag but don't scroll
      setSkipNextScrollToTop(false);
    } else if (navigationType === 'POP') {
      // Browser back/forward - let page restore its own scroll position
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType, skipNextScrollToTop, setSkipNextScrollToTop]);

  return null;
}
