import { useState, useEffect } from 'react';
import languagePhraseService from '../services/languagePhrase.service';
import type {
  LanguageWithPhrases,
  PhraseCategory,
  Phrase,
} from '../types/languagePhrase';
import { CATEGORY_INFO } from '../types/languagePhrase';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

interface PhraseBankProps {
  tripId: number;
}

export default function PhraseBank({ tripId }: PhraseBankProps) {
  const [languages, setLanguages] = useState<LanguageWithPhrases[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PhraseCategory | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Note: Only tripId is in the dependency array intentionally.
  // Languages are loaded once when tripId changes, then user selects from the loaded list.
  // activeLanguage is used inside loadPhrases but we don't want to reload when it changes.
  useEffect(() => {
    loadPhrases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const loadPhrases = async () => {
    try {
      setLoading(true);
      const data = await languagePhraseService.getTripPhrases(tripId);
      setLanguages(data.languages);
      if (data.languages.length > 0 && !activeLanguage) {
        setActiveLanguage(data.languages[0].code);
      }
    } catch {
      toast.error('Failed to load phrases');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPhrase = async (phrase: Phrase) => {
    try {
      await navigator.clipboard.writeText(phrase.translation);
      setCopiedId(phrase.id);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const categories: (PhraseCategory | 'all')[] = [
    'all',
    'greetings',
    'dining',
    'directions',
    'emergency',
    'shopping',
    'courtesy',
  ];

  const currentLanguage = languages.find((l) => l.code === activeLanguage);
  const filteredPhrases =
    currentLanguage?.phrases.filter(
      (p) => activeCategory === 'all' || p.category === activeCategory
    ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" label="Loading phrases..." />
      </div>
    );
  }

  if (languages.length === 0) {
    return (
      <EmptyState
        icon="🗣️"
        message="No languages selected"
        subMessage="Add languages to your trip to access the phrase bank"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Language tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-dusk-700 pb-3">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setActiveLanguage(lang.code)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeLanguage === lang.code
                ? 'bg-primary-500 dark:bg-gold text-white'
                : 'bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-200 dark:hover:bg-navy-600'
            }`}
          >
            {lang.name}
            <span className="ml-1 text-xs opacity-75">({lang.nativeName})</span>
          </button>
        ))}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const info = cat === 'all' ? { label: 'All', emoji: '📚' } : CATEGORY_INFO[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                activeCategory === cat
                  ? 'bg-accent-400 dark:bg-accent-500 text-white'
                  : 'bg-gray-100 dark:bg-navy-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-200 dark:hover:bg-navy-600'
              }`}
            >
              <span className="mr-1">{info.emoji}</span>
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Phrase cards */}
      {filteredPhrases.length === 0 ? (
        <EmptyState.Compact
          icon="🔍"
          message="No phrases in this category"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPhrases.map((phrase) => (
            <div
              key={phrase.id}
              className="card p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* English phrase */}
                  <p className="text-sm text-gray-500 dark:text-dusk-400 mb-1">
                    {phrase.english}
                  </p>
                  {/* Translation */}
                  <p className="text-lg font-medium text-gray-900 dark:text-white mb-1 break-words">
                    {phrase.translation}
                  </p>
                  {/* Pronunciation (if available) */}
                  {phrase.pronunciation && (
                    <p className="text-sm text-primary-600 dark:text-gold italic">
                      {phrase.pronunciation}
                    </p>
                  )}
                </div>
                {/* Copy button */}
                <button
                  onClick={() => handleCopyPhrase(phrase)}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                    copiedId === phrase.id
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-navy-700 text-gray-600 dark:text-dusk-400 hover:bg-gray-200 dark:hover:bg-navy-600'
                  }`}
                  aria-label={`Copy "${phrase.english}" to clipboard`}
                  title="Copy to clipboard"
                >
                  {copiedId === phrase.id ? (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {/* Category badge */}
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dusk-700">
                <span className="inline-flex items-center text-xs text-gray-500 dark:text-dusk-400">
                  <span className="mr-1">{CATEGORY_INFO[phrase.category].emoji}</span>
                  {CATEGORY_INFO[phrase.category].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phrase count */}
      {filteredPhrases.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-dusk-400 text-center">
          Showing {filteredPhrases.length} phrase{filteredPhrases.length !== 1 ? 's' : ''}
          {activeCategory !== 'all' && ` in ${CATEGORY_INFO[activeCategory].label}`}
        </p>
      )}
    </div>
  );
}
