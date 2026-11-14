/**
 * Phrase bank data integrity
 *
 * Test cases:
 * - LANGDATA-001: Every language in the bank has a code the API accepts
 * - LANGDATA-002: Every language has exactly 10 phrases in each of the 6 categories
 * - LANGDATA-003: Phrase ids are unique across all languages and start with the language code
 * - LANGDATA-004: Every language has the same English phrases, so banks stay comparable
 * - LANGDATA-005: Icelandic is available
 * - LANGDATA-007: Accents are kept (a sample per language) and native names are spelled properly
 * - LANGDATA-006: Every phrase has a pronunciation guide, with no stray characters
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

  it('LANGDATA-006: every phrase has a pronunciation guide', () => {
    for (const { code, phrases } of banks) {
      for (const phrase of phrases) {
        const guide = phrase.pronunciation;
        expect({ id: phrase.id, hasGuide: typeof guide === 'string' && guide.trim().length > 0 }).toEqual({
          id: phrase.id,
          hasGuide: true,
        });
        // A respelling is plain letters, hyphens, spaces and light punctuation; markup or
        // an unescaped quote here would be a data-entry slip.
        expect({ code, id: phrase.id, ok: /^[\p{L}\s,.()/?!'-]+$/u.test(guide as string) }).toEqual({
          code,
          id: phrase.id,
          ok: true,
        });
      }
    }
  });

  it('LANGDATA-007: accents are kept and native names are spelled properly', () => {
    const text = (id: string): string | undefined => {
      const code = id.split('-')[0];
      return banks.find((b) => b.code === code)?.phrases.find((p) => p.id === id)?.translation;
    };
    expect(text('fr-d9')).toBe("C'est épicé?");
    expect(text('es-g5')).toBe('¿Cómo estás?');
    expect(text('es-c5')).toBe('Sí');
    expect(text('es-e9')).toBe('Llame a una ambulancia');
    // Gendered greetings show both forms, like the rest of the bank.
    expect(text('es-g10')).toBe('Bienvenido/a');
    expect(text('it-g10')).toBe('Benvenuto/a');
    expect(text('pt-g10')).toBe('Bem-vindo/a');
    expect(text('pt-g6')).toBe('Prazer em conhecê-lo(a)');
    expect(text('it-c5')).toBe('Sì');
    expect(text('de-s10')).toBe('Größe');
    expect(text('nl-d7')).toBe('Ik ben vegetariër');
    expect(text('vi-g2')).toBe('Chào buổi sáng');

    const nativeNames = Object.fromEntries(available.map((l) => [l.code, l.nativeName]));
    expect(nativeNames).toMatchObject({
      fr: 'Français',
      es: 'Español',
      pt: 'Português',
      vi: 'Tiếng Việt',
    });
  });

  it('LANGDATA-005: Icelandic is available', () => {
    expect(available.find((l) => l.code === 'is')).toMatchObject({ name: 'Icelandic', nativeName: 'Íslenska' });
  });
});
