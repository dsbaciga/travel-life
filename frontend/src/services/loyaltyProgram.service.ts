import axios from '../lib/axios';
import type {
  LoyaltyProgram,
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
} from '../types/loyaltyProgram';

/** TanStack Query key shared by the settings manager and the booking-form field. */
export const LOYALTY_PROGRAMS_QUERY_KEY = ['loyalty-programs'] as const;

export const loyaltyProgramService = {
  /** All of the authenticated user's loyalty programs */
  async getAll(): Promise<LoyaltyProgram[]> {
    const response = await axios.get<LoyaltyProgram[]>('/loyalty-programs');
    return response.data;
  },

  async getById(programId: number): Promise<LoyaltyProgram> {
    const response = await axios.get<LoyaltyProgram>(`/loyalty-programs/${programId}`);
    return response.data;
  },

  async create(data: CreateLoyaltyProgramInput): Promise<LoyaltyProgram> {
    const response = await axios.post<LoyaltyProgram>('/loyalty-programs', data);
    return response.data;
  },

  async update(programId: number, data: UpdateLoyaltyProgramInput): Promise<LoyaltyProgram> {
    const response = await axios.put<LoyaltyProgram>(`/loyalty-programs/${programId}`, data);
    return response.data;
  },

  async delete(programId: number): Promise<void> {
    await axios.delete(`/loyalty-programs/${programId}`);
  },
};

export default loyaltyProgramService;
