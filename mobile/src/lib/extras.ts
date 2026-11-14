/**
 * Read-only trip data that is cached whole rather than mirrored row by row:
 * the emergency card and the phrasebook. Both must work with no signal, so
 * they are fetched whenever a sync succeeds and served from the key-value
 * cache afterwards.
 */
import { kvGet, kvSet } from '../db/repository';
import { getDb } from './db';
import { api } from './session';

export interface EmergencyCompanion {
  id: number;
  name: string;
  relationship: string | null;
  phone: string | null;
  /** Null when the server withheld it (non-owners on a shared trip). */
  medicalNotes: string | null;
  allergies: string[];
  dietaryPreferences: string[];
}

export interface EmergencyCard {
  tripId: number;
  tripTitle: string;
  countryCode: string | null;
  info: {
    insuranceProvider: string | null;
    insurancePolicyNumber: string | null;
    insuranceAssistancePhone: string | null;
    embassyName: string | null;
    embassyPhone: string | null;
    embassyAddress: string | null;
    notes: string | null;
  } | null;
  locationAddresses: string[];
  companions: EmergencyCompanion[];
  /** False when medical fields were redacted server-side. */
  includesMedicalDetails: boolean;
}

export interface Phrase {
  category?: string | null;
  english?: string | null;
  translation?: string | null;
  pronunciation?: string | null;
  languageName?: string | null;
}

export const emergencyKey = (tripId: number): string => `emergency:${tripId}`;
export const phrasesKey = (tripId: number): string => `phrases:${tripId}`;
export const languagesKey = (tripId: number): string => `languages:${tripId}`;

/** A language selected for a trip (the server's `TripLanguage`). */
export interface TripLanguage {
  languageCode: string;
  language: string;
}

/** A language the server has a phrase bank for. */
export interface AvailableLanguage {
  code: string;
  name: string;
  nativeName: string;
  phraseCount: number;
}

/** Needs a connection: the phrase banks live on the server. */
export async function fetchAvailableLanguages(): Promise<AvailableLanguage[]> {
  return (await api.request<AvailableLanguage[]>('/languages', {})) ?? [];
}

/** Add a language to a trip, then cache its phrases so the book works offline. */
export async function addTripLanguage(tripId: number, language: AvailableLanguage): Promise<void> {
  await api.request(`/trips/${tripId}/languages`, {
    method: 'POST',
    body: { languageCode: language.code, language: language.name },
  });
  await refreshTripExtras(tripId);
}

export async function removeTripLanguage(tripId: number, languageCode: string): Promise<void> {
  await api.request(`/trips/${tripId}/languages/${encodeURIComponent(languageCode)}`, { method: 'DELETE' });
  await refreshTripExtras(tripId);
}

/** Refresh the cached extras for a trip. Failures leave the previous cache in place. */
export async function refreshTripExtras(tripId: number): Promise<void> {
  const db = await getDb();
  await Promise.all([
    api
      .request<EmergencyCard>(`/trips/${tripId}/emergency-info`)
      .then((card) => (card ? kvSet(db, emergencyKey(tripId), card) : undefined))
      .catch(() => undefined),
    api
      .request<unknown>(`/trips/${tripId}/phrases`)
      .then((phrases) => kvSet(db, phrasesKey(tripId), normalizePhrases(phrases)))
      .catch(() => undefined),
    api
      .request<TripLanguage[]>(`/trips/${tripId}/languages`)
      .then((languages) => kvSet(db, languagesKey(tripId), languages ?? []))
      .catch(() => undefined),
  ]);
}

/**
 * The phrase endpoint groups by language; flatten whatever shape arrives into
 * a simple list, ignoring anything that is not a phrase-like object.
 */
export function normalizePhrases(input: unknown): Phrase[] {
  const out: Phrase[] = [];
  const visit = (value: unknown, languageName: string | null): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, languageName);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const text = (key: string): string | null => (typeof row[key] === 'string' ? (row[key] as string) : null);
    const translation = text('translation') ?? text('phrase') ?? text('translated');
    const english = text('english') ?? text('englishPhrase') ?? text('text');
    if (translation && english) {
      out.push({
        category: text('category'),
        english,
        translation,
        pronunciation: text('pronunciation') ?? text('romanization'),
        languageName: text('languageName') ?? languageName,
      });
      return;
    }
    const name = text('languageName') ?? text('language') ?? text('name') ?? languageName;
    for (const child of Object.values(row)) visit(child, name);
  };
  visit(input, null);
  return out;
}

export async function getCachedEmergencyCard(tripId: number): Promise<EmergencyCard | null> {
  return kvGet<EmergencyCard>(await getDb(), emergencyKey(tripId));
}
