// Language codes supported by the phrase bank
export type LanguageCode =
  | 'ja' // Japanese
  | 'fr' // French
  | 'es' // Spanish
  | 'it' // Italian
  | 'de' // German
  | 'pt' // Portuguese
  | 'zh' // Mandarin Chinese
  | 'ko' // Korean
  | 'th' // Thai
  | 'vi' // Vietnamese
  | 'ar' // Arabic
  | 'hi' // Hindi
  | 'ru' // Russian
  | 'el' // Greek
  | 'nl' // Dutch
  | 'is'; // Icelandic

// Phrase categories
export type PhraseCategory =
  | 'greetings'
  | 'dining'
  | 'directions'
  | 'emergency'
  | 'shopping'
  | 'courtesy';

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
  languageName: string; // Display name - maps to 'language' field in API
}

// DTO for adding a language to a trip
export interface AddTripLanguageDTO {
  languageCode: LanguageCode;
  languageName: string; // Display name - maps to 'language' field in API
}

// Category display info
export const CATEGORY_INFO: Record<PhraseCategory, { label: string; emoji: string }> = {
  greetings: { label: 'Greetings', emoji: '👋' },
  dining: { label: 'Dining', emoji: '🍽️' },
  directions: { label: 'Directions', emoji: '🧭' },
  emergency: { label: 'Emergency', emoji: '🚨' },
  shopping: { label: 'Shopping', emoji: '🛍️' },
  courtesy: { label: 'Courtesy', emoji: '🙏' },
};
