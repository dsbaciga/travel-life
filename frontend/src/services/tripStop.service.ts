import axios from '../lib/axios';
import type { TripStop, TripStopLegs, CreateTripStopInput, UpdateTripStopInput } from '../types/tripStop';

export const tripStopService = {
  async getStopsByTrip(tripId: number): Promise<TripStop[]> {
    const response = await axios.get<TripStop[]>(`/trips/${tripId}/stops`);
    return response.data;
  },

  /** Road distance and time between consecutive stops; legs that cannot be routed come back with routed false. */
  async getLegs(tripId: number): Promise<TripStopLegs> {
    const response = await axios.get<TripStopLegs>(`/trips/${tripId}/stops/legs`, {
      params: { profile: 'driving-car' },
    });
    return response.data;
  },

  async createStop(tripId: number, data: CreateTripStopInput): Promise<TripStop> {
    const response = await axios.post<TripStop>(`/trips/${tripId}/stops`, data);
    return response.data;
  },

  async updateStop(tripId: number, stopId: number, data: UpdateTripStopInput): Promise<TripStop> {
    const response = await axios.put<TripStop>(`/trips/${tripId}/stops/${stopId}`, data);
    return response.data;
  },

  async deleteStop(tripId: number, stopId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/stops/${stopId}`);
  },

  /** Sends the full ordered id list; the server rejects a list that is not exactly the trip's stops. */
  async reorderStops(tripId: number, stopIds: number[]): Promise<TripStop[]> {
    const response = await axios.put<TripStop[]>(`/trips/${tripId}/stops/reorder`, { stopIds });
    return response.data;
  },
};

export default tripStopService;
