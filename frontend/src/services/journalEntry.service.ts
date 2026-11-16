import api from '../lib/axios';
import type {
  JournalEntry,
  CreateJournalEntryInput,
  UpdateJournalEntryInput,
} from '../types/journalEntry';

/** A first-draft journal entry written by the AI for one day. Not saved anywhere. */
export type JournalDayDraft = {
  title: string;
  /** Markdown */
  body: string;
  /** Calendar day the draft is about (YYYY-MM-DD) */
  date: string;
  /** True when the day had more material than fit in the prompt */
  truncated: boolean;
};

class JournalEntryService {
  async createJournalEntry(data: CreateJournalEntryInput): Promise<JournalEntry> {
    const response = await api.post('/journal', data);
    return response.data;
  }

  async getJournalEntriesByTrip(tripId: number): Promise<JournalEntry[]> {
    const response = await api.get(`/journal/trip/${tripId}`);
    return response.data;
  }

  async getJournalEntryById(id: number): Promise<JournalEntry> {
    const response = await api.get(`/journal/${id}`);
    return response.data;
  }

  async updateJournalEntry(
    id: number,
    data: UpdateJournalEntryInput
  ): Promise<JournalEntry> {
    const response = await api.put(`/journal/${id}`, data);
    return response.data;
  }

  /**
   * Ask the AI for a first draft of one day. Returns text only; the server
   * creates nothing, so the caller decides whether it ever becomes an entry.
   */
  async generateDayDraft(tripId: number, date: string): Promise<JournalDayDraft> {
    const response = await api.post<JournalDayDraft>(`/trips/${tripId}/ai/journal-day-draft`, { date });
    return response.data;
  }

  async deleteJournalEntry(id: number): Promise<void> {
    await api.delete(`/journal/${id}`);
  }
}

export default new JournalEntryService();
