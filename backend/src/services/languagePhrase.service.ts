import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  LanguageWithPhrases,
  AvailableLanguage,
  PhraseCategory,
} from '../types/languagePhrase.types';
import { LANGUAGE_PHRASES } from '../data/language-phrases';
import { LANGUAGE_PHRASES_EXTENDED } from '../data/language-phrases-extended';
import { LANGUAGE_PHRASES_MORE } from '../data/language-phrases-more';
import { LANGUAGE_PHRASES_ADDITIONAL } from '../data/language-phrases-additional';

// Combine all language phrases into a single array
const ALL_LANGUAGE_PHRASES: LanguageWithPhrases[] = [
  ...LANGUAGE_PHRASES,
  ...LANGUAGE_PHRASES_EXTENDED,
  ...LANGUAGE_PHRASES_MORE,
  ...LANGUAGE_PHRASES_ADDITIONAL,
];

// Create a map for quick lookup
const LANGUAGE_PHRASES_MAP = new Map<string, LanguageWithPhrases>(
  ALL_LANGUAGE_PHRASES.map((lang) => [lang.code, lang])
);

class LanguagePhraseService {
  /**
   * Get all available languages with phrase counts
   */
  getAvailableLanguages(): AvailableLanguage[] {
    return ALL_LANGUAGE_PHRASES.map((lang) => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.nativeName,
      phraseCount: lang.phrases.length,
    }));
  }

  /**
   * Get phrases for a specific language
   */
  getPhrasesByLanguage(languageCode: string): LanguageWithPhrases | null {
    return LANGUAGE_PHRASES_MAP.get(languageCode) || null;
  }

  /**
   * Get phrases for a specific language filtered by category
   */
  getPhrasesByLanguageAndCategory(
    languageCode: string,
    category: PhraseCategory
  ): LanguageWithPhrases | null {
    const language = LANGUAGE_PHRASES_MAP.get(languageCode);
    if (!language) {
      return null;
    }

    return {
      ...language,
      phrases: language.phrases.filter((p) => p.category === category),
    };
  }

  /**
   * Get phrases for all languages selected for a trip
   */
  async getPhrasesForTrip(
    tripId: number,
    userId: number
  ): Promise<LanguageWithPhrases[]> {
    // Verify trip ownership or collaboration
    const trip = await prisma.trip.findFirst({
      where: {
        id: tripId,
        OR: [
          { userId },
          { collaborators: { some: { userId } } },
        ],
      },
      include: {
        languages: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new AppError('Trip not found or access denied', 404);
    }

    // Get phrases for each selected language
    const languagesWithPhrases: LanguageWithPhrases[] = [];

    for (const tripLang of trip.languages) {
      const langPhrases = LANGUAGE_PHRASES_MAP.get(tripLang.languageCode);
      if (langPhrases) {
        languagesWithPhrases.push(langPhrases);
      }
    }

    return languagesWithPhrases;
  }

  /**
   * Get all phrase categories
   */
  getCategories(): PhraseCategory[] {
    return ['greetings', 'dining', 'directions', 'emergency', 'shopping', 'courtesy'];
  }

  /**
   * Search phrases across all languages
   */
  searchPhrases(
    query: string,
    languageCodes?: string[]
  ): LanguageWithPhrases[] {
    const searchQuery = query.toLowerCase();
    const results: LanguageWithPhrases[] = [];

    const languagesToSearch = languageCodes
      ? ALL_LANGUAGE_PHRASES.filter((lang) => languageCodes.includes(lang.code))
      : ALL_LANGUAGE_PHRASES;

    for (const lang of languagesToSearch) {
      const matchingPhrases = lang.phrases.filter(
        (phrase) =>
          phrase.english.toLowerCase().includes(searchQuery) ||
          phrase.translation.toLowerCase().includes(searchQuery) ||
          (phrase.pronunciation &&
            phrase.pronunciation.toLowerCase().includes(searchQuery))
      );

      if (matchingPhrases.length > 0) {
        results.push({
          ...lang,
          phrases: matchingPhrases,
        });
      }
    }

    return results;
  }
}

export default new LanguagePhraseService();
