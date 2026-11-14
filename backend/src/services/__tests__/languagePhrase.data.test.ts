/**
 * Phrase bank data integrity
 *
 * Test cases:
 * - LANGDATA-001: Every language in the bank has a code the API accepts
 * - LANGDATA-002: Every language has exactly 10 phrases in each of the 6 categories
 * - LANGDATA-003: Phrase ids are unique across all languages and start with the language code
 * - LANGDATA-004: Every language has the same English phrases, so banks stay comparable
 * - LANGDATA-005: Icelandic is available
 */
import languagePhraseService from '../languagePhrase.service';
import { LanguageCodeSchema, PhraseCategorySchema } from '../../types/languagePhrase.types';

jest.mock('../../config/database', () => ({ __esModule: true, default: {} }));

const available = languagePhraseService.getAvailableLanguages();
const banks = available.map((language) => ({
  code: language.code,
  phrases: languagePhraseService.getPhrasesByLanguage(language.code).phrases,
}));

describe('phrase bank data', () => {
  it('LANGDATA-001: every language has a code the API accepts', () => {
    for (const { code } of banks) {
      expect(LanguageCodeSchema.safeParse(code).success).toBe(true);
    }
    // And every accepted code has a bank, so the picker never offers a dead end.
    expect(banks.map((b) => b.code).sort()).toEqual([...LanguageCodeSchema.options].sort());
  });

  it('LANGDATA-002: every language has 10 phrases in each category', () => {
    for (const { code, phrases } of banks) {
      for (const category of PhraseCategorySchema.options) {
        const count = phrases.filter((p) => p.category === category).length;
        expect({ code, category, count }).toEqual({ code, category, count: 10 });
      }
    }
  });

  it('LANGDATA-003: phrase ids are unique and prefixed with the language code', () => {
    const seen = new Set<string>();
    for (const { code, phrases } of banks) {
      for (const phrase of phrases) {
        expect(phrase.id.startsWith(`${code}-`)).toBe(true);
        expect(seen.has(phrase.id)).toBe(false);
        seen.add(phrase.id);
      }
    }
  });

  it('LANGDATA-004: every language covers the same English phrases', () => {
    const [first, ...rest] = banks;
    const reference = first.phrases.map((p) => p.english).sort();
    for (const { code, phrases } of rest) {
      expect({ code, english: phrases.map((p) => p.english).sort() }).toEqual({ code, english: reference });
    }
  });

  it('LANGDATA-005: Icelandic is available', () => {
    expect(available.find((l) => l.code === 'is')).toMatchObject({ name: 'Icelandic', nativeName: 'Íslenska' });
  });
});
