import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { addRecentTrip, readRecentTrips, writeRecentTrips } from '../utils/recentTrips';

/**
 * Record that the signed-in user opened a trip. Fires once per visit: it
 * depends on the trip id and user, not on the title or the active tab.
 * Pass `loaded` as true once the trip has resolved, so a trip that does not
 * exist is never recorded.
 */
export function useRecordTripView(tripId: number, title: string | undefined, loaded: boolean): void {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId || !loaded || !Number.isInteger(tripId) || tripId <= 0) return;
    writeRecentTrips(userId, addRecentTrip(readRecentTrips(userId), { tripId, title }));
    // Title is deliberately omitted: a rename must not count as a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tripId, loaded]);
}
