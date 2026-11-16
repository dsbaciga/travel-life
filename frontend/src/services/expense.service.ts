import axios from '../lib/axios';
import type {
  TripExpense,
  CreateExpenseInput,
  UpdateExpenseInput,
  BudgetSummary,
  ExpenseParticipant,
  SetExpenseSplitInput,
  SettleUpSummary,
} from '../types/expense';

export const expenseService = {
  async createExpense(
    tripId: number,
    data: CreateExpenseInput
  ): Promise<TripExpense> {
    const response = await axios.post<TripExpense>(
      `/trips/${tripId}/expenses`,
      data
    );
    return response.data;
  },

  async getExpensesByTrip(tripId: number): Promise<TripExpense[]> {
    const response = await axios.get<TripExpense[]>(`/trips/${tripId}/expenses`);
    return response.data;
  },

  async getExpenseById(tripId: number, expenseId: number): Promise<TripExpense> {
    const response = await axios.get<TripExpense>(
      `/trips/${tripId}/expenses/${expenseId}`
    );
    return response.data;
  },

  async updateExpense(
    tripId: number,
    expenseId: number,
    data: UpdateExpenseInput
  ): Promise<TripExpense> {
    const response = await axios.put<TripExpense>(
      `/trips/${tripId}/expenses/${expenseId}`,
      data
    );
    return response.data;
  },

  /** Attach or replace the receipt photo of an expense. */
  async uploadReceipt(tripId: number, expenseId: number, image: File): Promise<TripExpense> {
    const formData = new FormData();
    formData.append('image', image);
    const response = await axios.post<TripExpense>(
      `/trips/${tripId}/expenses/${expenseId}/receipt`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }
    );
    return response.data;
  },

  async deleteReceipt(tripId: number, expenseId: number): Promise<TripExpense> {
    const response = await axios.delete<TripExpense>(
      `/trips/${tripId}/expenses/${expenseId}/receipt`
    );
    return response.data;
  },

  async deleteExpense(tripId: number, expenseId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/expenses/${expenseId}`);
  },

  async getParticipants(tripId: number): Promise<ExpenseParticipant[]> {
    const response = await axios.get<ExpenseParticipant[]>(
      `/trips/${tripId}/expenses/participants`
    );
    return response.data;
  },

  async setExpenseSplit(
    tripId: number,
    expenseId: number,
    data: SetExpenseSplitInput
  ): Promise<TripExpense> {
    const response = await axios.put<TripExpense>(
      `/trips/${tripId}/expenses/${expenseId}/split`,
      data
    );
    return response.data;
  },

  async getSettleUp(tripId: number): Promise<SettleUpSummary> {
    const response = await axios.get<SettleUpSummary>(`/trips/${tripId}/settle-up`);
    return response.data;
  },

  async getBudgetSummary(tripId: number): Promise<BudgetSummary> {
    const response = await axios.get<BudgetSummary>(
      `/trips/${tripId}/budget-summary`
    );
    return response.data;
  },
};

export default expenseService;
