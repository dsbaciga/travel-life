import { z } from 'zod';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

// Language codes supported by the phrase bank
export const LanguageCodeSchema = z.enum([
  'ja', // Japanese
  'fr', // French
  'es', // Spanish
  'it', // Italian
  'de', // German
  'pt', // Portuguese
  'zh', // Mandarin Chinese
  'ko', // Korean
  'th', // Thai
  'vi', // Vietnamese
  'ar', // Arabic
  'hi', // Hindi
  'ru', // Russian
  'el', // Greek
  'nl', // Dutch
  'is', // Icelandic
]);

// Phrase categories
export const PhraseCategorySchema = z.enum([
  'greetings',
  'dining',
  'directions',
  'emergency',
  'shopping',
  'courtesy',
]);

// Schema for adding a language to a trip
export const AddTripLanguageSchema = z.object({
  languageCode: LanguageCodeSchema,
  language: z.string().min(1).max(100), // Display name of the language
});

// Schema for removing a language from a trip (used in URL params)
export const RemoveTripLanguageSchema = z.object({
  languageCode: LanguageCodeSchema,
});

// =============================================================================
// TYPESCRIPT TYPES
// =============================================================================

export type LanguageCode = z.infer<typeof LanguageCodeSchema>;
export type PhraseCategory = z.infer<typeof PhraseCategorySchema>;
export type AddTripLanguage = z.infer<typeof AddTripLanguageSchema>;

// A single phrase in the phrase bank
export interface Phrase {
  id: string;
  english: string;
  translation: string;
  pronunciation?: string; // Romanization for non-Latin scripts
  category: PhraseCategory;
}

// A language with its phrases
export interface LanguageWithPhrases {
  code: LanguageCode;
  name: string;
  nativeName: string;
  phrases: Phrase[];
}

// Available language info (without phrases)
export interface AvailableLanguage {
  code: LanguageCode;
  name: string;
  nativeName: string;
  phraseCount: number;
}

// Trip language (language selected for a trip)
export interface TripLanguage {
  id: number;
  tripId: number;
  languageCode: string;
  language: string; // Display name
}

// Trip languages response
export interface TripLanguagesResponse {
  languages: TripLanguage[];
}

// Phrases for trip response
export interface TripPhrasesResponse {
  languages: LanguageWithPhrases[];
}
