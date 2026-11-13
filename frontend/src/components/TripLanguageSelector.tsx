import { useState, useEffect, useCallback } from 'react';
import languagePhraseService from '../services/languagePhrase.service';
import type { AvailableLanguage, TripLanguage, LanguageCode } from '../types/languagePhrase';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';

interface TripLanguageSelectorProps {
  tripId: number;
  onUpdate?: () => void;
}

export default function TripLanguageSelector({ tripId, onUpdate }: TripLanguageSelectorProps) {
  const [availableLanguages, setAvailableLanguages] = useState<AvailableLanguage[]>([]);
  const [tripLanguages, setTripLanguages] = useState<TripLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [available, selected] = await Promise.all([
        languagePhraseService.getAvailableLanguages(),
        languagePhraseService.getTripLanguages(tripId),
      ]);
      setAvailableLanguages(available);
      setTripLanguages(selected);
    } catch {
      toast.error('Failed to load languages');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddLanguage = async () => {
    if (!selectedCode) return;

    const language = availableLanguages.find((l) => l.code === selectedCode);
    if (!language) return;

    try {
      setAdding(true);
      await languagePhraseService.addTripLanguage(tripId, {
        languageCode: language.code as LanguageCode,
        languageName: language.name,
      });
      toast.success(`${language.name} added to trip`);
      setSelectedCode('');
      await loadData();
      onUpdate?.();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      if (error.response?.data?.message?.includes('already added')) {
        toast.error('Language already added to this trip');
      } else {
        toast.error('Failed to add language');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveLanguage = async (languageCode: string) => {
    const language = tripLanguages.find((l) => l.languageCode === languageCode);
    if (!language) return;

    try {
      await languagePhraseService.removeTripLanguage(tripId, languageCode);
      toast.success(`${language.languageName} removed from trip`);
      await loadData();
      onUpdate?.();
    } catch {
      toast.error('Failed to remove language');
    }
  };

  // Filter out languages that are already selected
  const unselectedLanguages = availableLanguages.filter(
    (lang) => !tripLanguages.some((tl) => tl.languageCode === lang.code)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Language selector dropdown */}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
          className="input flex-1"
          disabled={unselectedLanguages.length === 0}
        >
          <option value="">
            {unselectedLanguages.length === 0
              ? 'All languages added'
              : 'Select a language...'}
          </option>
          {unselectedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name} ({lang.nativeName}) - {lang.phraseCount} phrases
            </option>
          ))}
        </select>
        <button
          onClick={handleAddLanguage}
          disabled={!selectedCode || adding}
          className="btn btn-primary whitespace-nowrap"
        >
          {adding ? (
            <>
              <LoadingSpinner.Inline /> Adding...
            </>
          ) : (
            'Add Language'
          )}
        </button>
      </div>

      {/* Selected languages as chips */}
      {tripLanguages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tripLanguages.map((lang) => {
            const fullLang = availableLanguages.find((l) => l.code === lang.languageCode);
            return (
              <div
                key={lang.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 rounded-full text-sm"
              >
                <span className="font-medium">{lang.languageName}</span>
                {fullLang && (
                  <span className="text-primary-600 dark:text-primary-400">
                    ({fullLang.nativeName})
                  </span>
                )}
                <button
                  onClick={() => handleRemoveLanguage(lang.languageCode)}
                  className="ml-1 p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800 rounded-full transition-colors"
                  aria-label={`Remove ${lang.languageName}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {tripLanguages.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-dusk-400">
          No languages selected. Add languages to access the phrase bank.
        </p>
      )}
    </div>
  );
}
