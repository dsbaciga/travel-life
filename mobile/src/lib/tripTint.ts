import { useMemo } from 'react';
import { tripTint } from '@travel-life/shared';

import { useResolvedColorScheme } from '@/lib/theme';

/**
 * The hero-card tint for a trip's cover colour, in the current colour scheme, or
 * undefined when the trip has none (the card then keeps its default gradient).
 * Pass the result to `<Card tone="hero" tint={...} />`.
 */
export function useTripTint(coverColor: string | null | undefined): { from: string; to: string } | undefined {
  const scheme = useResolvedColorScheme();
  return useMemo(() => {
    const tint = tripTint(coverColor, scheme === 'dark' ? 'dark' : 'light');
    return tint ? { from: tint.heroFrom, to: tint.heroTo } : undefined;
  }, [coverColor, scheme]);
}
