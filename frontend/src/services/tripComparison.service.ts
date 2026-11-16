import axios from '../lib/axios';
import type { TripComparison } from '../types/tripComparison';

export const tripComparisonService = {
  async compare(tripIds: number[]): Promise<TripComparison> {
    const response = await axios.get<TripComparison>('/trip-comparison', {
      params: { ids: tripIds.join(',') },
    });
    return response.data;
  },
};

export default tripComparisonService;
