/**
 * Listens for content shared into the app from other apps and opens the
 * "Save to Travel Life" sheet. Renders nothing.
 */
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

export default function ShareIntentRouter() {
  const { hasShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent) router.push('/share');
  }, [hasShareIntent]);

  return null;
}
