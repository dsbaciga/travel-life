import axios from '../lib/axios';
import type { Location, LocationCategory, CreateLocationInput, UpdateLocationInput } from '../types/location';

class LocationService {
  async createLocation(data: CreateLocationInput): Promise<Location> {
    const response = await axios.post('/locations', data);
    return response.data;
  }

  async getLocationsByTrip(tripId: number): Promise<Location[]> {
    const response = await axios.get(`/locations/trip/${tripId}`);
    return response.data;
  }

  async getAllVisitedLocations(): Promise<Location[]> {
    const response = await axios.get('/locations/visited');
    // Backend returns paginated response { locations, total, page, limit, totalPages }
    const data = response.data;
    return Array.isArray(data) ? data : data.locations;
  }

  /** Mappable places from every trip except cancelled ones, planned or not. */
  async getAllTripLocations(): Promise<Location[]> {
    const response = await axios.get('/locations/visited', { params: { scope: 'all' } });
    const data = response.data;
    return Array.isArray(data) ? data : data.locations;
  }

  async getFavoriteLocations(): Promise<Location[]> {
    const response = await axios.get<Location[]>('/locations/favorites');
    return response.data;
  }

  async getLocationById(id: number): Promise<Location> {
    const response = await axios.get(`/locations/${id}`);
    return response.data;
  }

  async updateLocation(id: number, data: UpdateLocationInput): Promise<Location> {
    const response = await axios.put(`/locations/${id}`, data);
    return response.data;
  }

  async deleteLocation(id: number): Promise<void> {
    await axios.delete(`/locations/${id}`);
  }

  // Categories
  async getCategories(): Promise<LocationCategory[]> {
    const response = await axios.get('/locations/categories/list');
    return response.data;
  }

  async createCategory(data: { name: string; icon?: string; color?: string }): Promise<LocationCategory> {
    const response = await axios.post('/locations/categories', data);
    return response.data;
  }

  async bulkDeleteLocations(tripId: number, ids: number[]): Promise<{ success: boolean; deletedCount: number }> {
    const response = await axios.delete(`/locations/trip/${tripId}/bulk`, { data: { ids } });
    return response.data;
  }

  async bulkUpdateLocations(
    tripId: number,
    ids: number[],
    updates: { categoryId?: number; notes?: string }
  ): Promise<{ success: boolean; updatedCount: number }> {
    const response = await axios.patch(`/locations/trip/${tripId}/bulk`, { ids, updates });
    return response.data;
  }
}

export default new LocationService();
