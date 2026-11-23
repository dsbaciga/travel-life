import { useState, useEffect, useCallback, useRef } from 'react';
import photoService, {
  type AlbumSuggestion,
  type AlbumSuggestionPreviewPhoto,
} from '../services/photo.service';
import { useImmichThumbnailCache } from '../hooks/useImmichThumbnail';
import toast from 'react-hot-toast';
import Icon from './ui/Icon';

interface AlbumSuggestionsProps {
  tripId: number;
  onAlbumCreated: () => void;
}

// Generate a unique key for a suggestion (for dismissal tracking)
function getSuggestionKey(suggestion: AlbumSuggestion): string {
  return `${suggestion.type}-${suggestion.name}-${suggestion.photoIds.length}`;
}

// Get dismissed suggestions from localStorage for a trip
function getDismissedSuggestions(tripId: number): Set<string> {
  try {
    const key = `dismissed-album-suggestions-${tripId}`;
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// Save dismissed suggestion to localStorage
function saveDismissedSuggestion(tripId: number, suggestionKey: string): void {
  try {
    const key = `dismissed-album-suggestions-${tripId}`;
    const dismissed = getDismissedSuggestions(tripId);
    dismissed.add(suggestionKey);
    localStorage.setItem(key, JSON.stringify([...dismissed]));
  } catch (error) {
    console.error('Failed to save dismissed suggestion:', error);
  }
}

// Dismiss all suggestions for a trip
function dismissAllSuggestions(tripId: number, suggestions: AlbumSuggestion[]): void {
  try {
    const key = `dismissed-album-suggestions-${tripId}`;
    const dismissed = getDismissedSuggestions(tripId);
    suggestions.forEach(s => dismissed.add(getSuggestionKey(s)));
    localStorage.setItem(key, JSON.stringify([...dismissed]));
  } catch (error) {
    console.error('Failed to dismiss all suggestions:', error);
  }
}

interface SuggestionPreviewProps {
  albumName: string;
  photos: AlbumSuggestionPreviewPhoto[];
  totalCount: number;
}

/**
 * Thumbnail of the first photo that opens a 3x3 grid of the rest on hover or
 * tap — so a suggestion can be judged without creating the album first.
 */
function SuggestionPreview({ albumName, photos, totalCount }: SuggestionPreviewProps) {
  const [open, setOpen] = useState(false);
  const { loadThumbnails, getThumbnailUrl } = useImmichThumbnailCache();
  const containerRef = useRef<HTMLDivElement>(null);
  const firstPhoto = photos[0];

  // The trigger only needs the first thumbnail; the rest wait until the grid opens
  // so a screen full of suggestions does not fetch 45 Immich thumbnails up front.
  useEffect(() => {
    if (firstPhoto) {
      void loadThumbnails([firstPhoto]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPhoto?.id]);

  useEffect(() => {
    if (open) {
      void loadThumbnails(photos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tapping elsewhere closes the grid on touch devices, which have no mouse-leave.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  if (!firstPhoto) {
    return null;
  }

  const firstUrl = getThumbnailUrl(firstPhoto.id);
  const remaining = totalCount - photos.length;

  return (
    <div
      ref={containerRef}
      className="relative flex-shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        // Click (which Enter/Space also fire) toggles, so touch and keyboard both
        // work without an onFocus handler fighting the toggle on tap.
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-expanded={open}
        aria-label={`Preview photos in "${albumName}"`}
        className="block w-12 h-12 rounded overflow-hidden border border-primary-200 dark:border-gold/25 bg-primary-100 dark:bg-navy-700"
      >
        {firstUrl ? (
          <img src={firstUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="flex items-center justify-center w-full h-full text-[10px] text-slate dark:text-warm-gray/60">
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="tooltip"
          // Anchored left: the trigger sits at the card's left edge, so opening
          // rightward keeps the grid on screen on narrow phones.
          className="absolute left-0 top-full mt-2 z-30 w-44 p-2 bg-white dark:bg-navy-800 border border-primary-200 dark:border-gold/25 rounded-lg shadow-lg"
        >
          <div className="grid grid-cols-3 gap-1">
            {photos.map((photo) => {
              const url = getThumbnailUrl(photo.id);
              return (
                <div
                  key={photo.id}
                  title={photo.caption ?? undefined}
                  className="relative aspect-square rounded-sm overflow-hidden bg-primary-100 dark:bg-navy-700"
                >
                  {url && (
                    <img
                      src={url}
                      alt={photo.caption ?? ''}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {photo.mediaType === 'video' && (
                    <span className="absolute bottom-0.5 right-0.5 text-white drop-shadow">
                      <Icon name="play" size={12} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate dark:text-warm-gray/60">
            {remaining > 0
              ? `Showing ${photos.length} of ${totalCount} photos`
              : `All ${totalCount} photos`}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AlbumSuggestions({
  tripId,
  onAlbumCreated,
}: AlbumSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AlbumSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  // Collapsed by default so the suggestions never push the photo grid out of view.
  const [expanded, setExpanded] = useState(false);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await photoService.getAlbumSuggestions(tripId);
      // Filter out previously dismissed suggestions
      const dismissed = getDismissedSuggestions(tripId);
      const filteredData = data.filter(s => !dismissed.has(getSuggestionKey(s)));
      setSuggestions(filteredData);
    } catch (error) {
      console.error('Failed to load album suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleAccept = async (suggestion: AlbumSuggestion) => {
    const key = `${suggestion.type}-${suggestion.name}`;
    setAccepting(key);
    try {
      await photoService.acceptAlbumSuggestion(tripId, {
        name: suggestion.name,
        photoIds: suggestion.photoIds,
      });
      toast.success(`Album "${suggestion.name}" created`);
      // Remove this suggestion from the list
      setSuggestions(prev => prev.filter(s =>
        !(s.type === suggestion.type && s.name === suggestion.name)
      ));
      onAlbumCreated();
    } catch (error) {
      toast.error("Couldn't create album. Try again.");
      console.error(error);
    } finally {
      setAccepting(null);
    }
  };

  const handleDismiss = (suggestion: AlbumSuggestion) => {
    // Persist dismissal to localStorage
    saveDismissedSuggestion(tripId, getSuggestionKey(suggestion));
    // Remove from local state
    setSuggestions(prev => prev.filter(s =>
      !(s.type === suggestion.type && s.name === suggestion.name)
    ));
  };

  const handleDismissAll = () => {
    // Persist all dismissals to localStorage
    dismissAllSuggestions(tripId, suggestions);
    // Clear local state
    setSuggestions([]);
  };

  // Loading and empty states render nothing: a spinner line above the grid would
  // shift the photos down only to disappear again.
  if (loading || suggestions.length === 0) {
    return null;
  }

  const listId = `album-suggestions-${tripId}`;

  return (
    <div className="bg-primary-50 dark:bg-navy-800/80 border border-primary-200 dark:border-gold/25 rounded-lg">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
        >
          <Icon name="lightbulb" className="text-primary-600 dark:text-gold" />
          <h3 className="text-sm font-semibold text-charcoal dark:text-warm-gray truncate">
            Smart Album Suggestions
          </h3>
          <span className="flex-shrink-0 rounded-full bg-primary-100 dark:bg-navy-700 px-2 py-0.5 text-xs font-medium text-primary-700 dark:text-gold">
            {suggestions.length}
          </span>
          <Icon name="expand" size={16} className={`text-slate dark:text-warm-gray/70 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleDismissAll}
          className="flex-shrink-0 text-slate/60 dark:text-warm-gray/50 hover:text-slate dark:hover:text-warm-gray"
          title="Dismiss all suggestions"
          aria-label="Dismiss all suggestions"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {expanded && (
        <div id={listId} className="space-y-2 px-4 pb-4">
          {suggestions.map((suggestion) => {
            const key = `${suggestion.type}-${suggestion.name}`;
            const isAccepting = accepting === key;

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-navy-800 rounded-lg p-3 shadow-sm border border-primary-100 dark:border-gold/15"
              >
                <SuggestionPreview
                  albumName={suggestion.name}
                  photos={suggestion.previewPhotos ?? []}
                  totalCount={suggestion.photoIds.length}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {suggestion.type === 'date' ? (
                      <Icon name="calendar" size={16} className="text-orange-500" />
                    ) : (
                      <Icon name="place" size={16} className="text-green-500" />
                    )}
                    <span className="font-medium text-charcoal dark:text-warm-gray truncate">
                      {suggestion.name}
                    </span>
                  </div>
                  {suggestion.description && (
                    <p className="text-xs text-slate dark:text-warm-gray/70 mt-1 break-words">
                      {suggestion.description}
                    </p>
                  )}
                  <p className="text-xs text-slate dark:text-warm-gray/60 mt-0.5">
                    {suggestion.photoIds.length} photos
                    <span className="mx-1">·</span>
                    {Math.round(suggestion.confidence * 100)}% match
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleDismiss(suggestion)}
                    disabled={isAccepting}
                    className="px-2 py-1 text-xs text-slate dark:text-warm-gray/70 hover:bg-primary-50 dark:hover:bg-navy-700 rounded"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAccept(suggestion)}
                    disabled={isAccepting}
                    className="px-3 py-1 text-xs font-medium bg-primary-500 dark:bg-gold text-white dark:text-navy-900 rounded hover:bg-primary-600 dark:hover:bg-gold/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isAccepting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Creating…
                      </>
                    ) : (
                      'Create Album'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
