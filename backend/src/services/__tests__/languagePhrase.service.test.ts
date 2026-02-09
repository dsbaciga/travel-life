/**
 * LanguagePhrase Service Tests
 *
 * Test cases:
 * - LP-001: Get available languages
 * - LP-002: Get phrases by language code
 * - LP-003: Get phrases by language and category
 * - LP-004: Get phrases for a trip
 * - LP-005: Get categories
 * - LP-006: Search phrases
 */

// Mock the middleware/errorHandler BEFORE imports (it transitively loads config which validates DATABASE_URL)
jest.mock('../../middleware/errorHandler', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
    }
  },
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock the language data modules with minimal data
const mockLanguageData = [
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Espanol',
    phrases: [
      { english: 'Hello', translation: 'Hola', pronunciation: 'OH-lah', category: 'greetings' },
      { english: 'Thank you', translation: 'Gracias', pronunciation: 'GRAH-see-ahs', category: 'courtesy' },
      { english: 'Where is the restaurant?', translation: 'Donde esta el restaurante?', pronunciation: null, category: 'dining' },
    ],
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Francais',
    phrases: [
      { english: 'Hello', translation: 'Bonjour', pronunciation: 'bohn-ZHOOR', category: 'greetings' },
      { english: 'Goodbye', translation: 'Au revoir', pronunciation: 'oh ruh-VWAHR', category: 'greetings' },
    ],
  },
];

jest.mock('../../data/language-phrases', () => ({
  LANGUAGE_PHRASES: mockLanguageData,
}));

jest.mock('../../data/language-phrases-extended', () => ({
  LANGUAGE_PHRASES_EXTENDED: [],
}));

jest.mock('../../data/language-phrases-more', () => ({
  LANGUAGE_PHRASES_MORE: [],
}));

import languagePhraseService from '../languagePhrase.service';

describe('LanguagePhraseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // LP-001: Get available languages
  // ============================================================
  describe('LP-001: Get available languages', () => {
    it('should return list of available languages with phrase counts', () => {
      const languages = languagePhraseService.getAvailableLanguages();

      expect(languages.length).toBe(2);
      expect(languages[0]).toEqual({
        code: 'es',
        name: 'Spanish',
        nativeName: 'Espanol',
        phraseCount: 3,
      });
      expect(languages[1]).toEqual({
        code: 'fr',
        name: 'French',
        nativeName: 'Francais',
        phraseCount: 2,
      });
    });
  });

  // ============================================================
  // LP-002: Get phrases by language code
  // ============================================================
  describe('LP-002: Get phrases by language code', () => {
    it('should return phrases for a valid language code', () => {
      const result = languagePhraseService.getPhrasesByLanguage('es');

      expect(result).not.toBeNull();
      expect(result!.code).toBe('es');
      expect(result!.name).toBe('Spanish');
      expect(result!.phrases.length).toBe(3);
    });

    it('should return null for an unknown language code', () => {
      const result = languagePhraseService.getPhrasesByLanguage('xx');

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // LP-003: Get phrases by language and category
  // ============================================================
  describe('LP-003: Get phrases by language and category', () => {
    it('should return phrases filtered by category', () => {
      const result = languagePhraseService.getPhrasesByLanguageAndCategory('es', 'greetings');

      expect(result).not.toBeNull();
      expect(result!.phrases.length).toBe(1);
      expect(result!.phrases[0].english).toBe('Hello');
    });

    it('should return empty phrases array if category has no matches', () => {
      const result = languagePhraseService.getPhrasesByLanguageAndCategory('es', 'emergency');

      expect(result).not.toBeNull();
      expect(result!.phrases.length).toBe(0);
    });

    it('should return null for an unknown language code', () => {
      const result = languagePhraseService.getPhrasesByLanguageAndCategory('xx', 'greetings');

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // LP-004: Get phrases for a trip
  // ============================================================
  describe('LP-004: Get phrases for a trip', () => {
    it('should return phrases for languages selected in a trip', async () => {
      const trip = {
        id: 1,
        userId: 1,
        languages: [
          { id: 1, tripId: 1, languageCode: 'es', language: 'Spanish' },
          { id: 2, tripId: 1, languageCode: 'fr', language: 'French' },
        ],
      };

      mockPrisma.trip.findFirst.mockResolvedValue(trip);

      const result = await languagePhraseService.getPhrasesForTrip(1, 1);

      expect(result.length).toBe(2);
      expect(result[0].code).toBe('es');
      expect(result[1].code).toBe('fr');
    });

    it('should return empty array if trip has no languages selected', async () => {
      const trip = {
        id: 1,
        userId: 1,
        languages: [],
      };

      mockPrisma.trip.findFirst.mockResolvedValue(trip);

      const result = await languagePhraseService.getPhrasesForTrip(1, 1);

      expect(result).toEqual([]);
    });

    it('should throw error if trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        languagePhraseService.getPhrasesForTrip(999, 1)
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should skip languages that have no phrase data', async () => {
      const trip = {
        id: 1,
        userId: 1,
        languages: [
          { id: 1, tripId: 1, languageCode: 'unknown_lang', language: 'Unknown' },
          { id: 2, tripId: 1, languageCode: 'es', language: 'Spanish' },
        ],
      };

      mockPrisma.trip.findFirst.mockResolvedValue(trip);

      const result = await languagePhraseService.getPhrasesForTrip(1, 1);

      expect(result.length).toBe(1);
      expect(result[0].code).toBe('es');
    });
  });

  // ============================================================
  // LP-005: Get categories
  // ============================================================
  describe('LP-005: Get categories', () => {
    it('should return all phrase categories', () => {
      const categories = languagePhraseService.getCategories();

      expect(categories).toContain('greetings');
      expect(categories).toContain('dining');
      expect(categories).toContain('directions');
      expect(categories).toContain('emergency');
      expect(categories).toContain('shopping');
      expect(categories).toContain('courtesy');
      expect(categories.length).toBe(6);
    });
  });

  // ============================================================
  // LP-006: Search phrases
  // ============================================================
  describe('LP-006: Search phrases', () => {
    it('should search across all languages by English text', () => {
      const results = languagePhraseService.searchPhrases('Hello');

      expect(results.length).toBe(2); // found in both Spanish and French
      expect(results[0].phrases[0].english).toBe('Hello');
    });

    it('should search by translation text', () => {
      const results = languagePhraseService.searchPhrases('Hola');

      expect(results.length).toBe(1);
      expect(results[0].code).toBe('es');
    });

    it('should search by pronunciation', () => {
      const results = languagePhraseService.searchPhrases('OH-lah');

      expect(results.length).toBe(1);
      expect(results[0].code).toBe('es');
    });

    it('should return empty array when no matches found', () => {
      const results = languagePhraseService.searchPhrases('zzzzzzz');

      expect(results).toEqual([]);
    });

    it('should filter search to specific language codes', () => {
      const results = languagePhraseService.searchPhrases('Hello', ['fr']);

      expect(results.length).toBe(1);
      expect(results[0].code).toBe('fr');
    });

    it('should be case-insensitive', () => {
      const results = languagePhraseService.searchPhrases('hello');

      expect(results.length).toBe(2);
    });
  });
});
