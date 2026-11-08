import axios from '../lib/axios';
import type {
  BookingDeadline,
  UpcomingBookingDeadline,
  CreateBookingDeadlineInput,
  UpdateBookingDeadlineInput,
} from '../types/bookingDeadline';

export const bookingDeadlineService = {
  async getDeadlinesByTrip(tripId: number): Promise<BookingDeadline[]> {
    const response = await axios.get<BookingDeadline[]>(`/trips/${tripId}/deadlines`);
    return response.data;
  },

  async createDeadline(tripId: number, data: CreateBookingDeadlineInput): Promise<BookingDeadline> {
    const response = await axios.post<BookingDeadline>(`/trips/${tripId}/deadlines`, data);
    return response.data;
  },

  async updateDeadline(
    tripId: number,
    deadlineId: number,
    data: UpdateBookingDeadlineInput
  ): Promise<BookingDeadline> {
    const response = await axios.put<BookingDeadline>(`/trips/${tripId}/deadlines/${deadlineId}`, data);
    return response.data;
  },

  async deleteDeadline(tripId: number, deadlineId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/deadlines/${deadlineId}`);
  },

  async getUpcoming(days?: number): Promise<UpcomingBookingDeadline[]> {
    const response = await axios.get<UpcomingBookingDeadline[]>('/deadlines/upcoming', {
      params: days ? { days } : undefined,
    });
    return response.data;
  },
};

export default bookingDeadlineService;
