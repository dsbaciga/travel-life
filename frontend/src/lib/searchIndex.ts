/**
 * Search Index Utilities for Offline Search
 *
 * Provides simple, fast text indexing and search utilities for offline functionality.
 * Designed to be lightweight and efficient for client-side search operations.
 */

// ============================================
// TEXT NORMALIZATION
// ============================================

/**
 * Normalizes text for search indexing.
 * - Converts to lowercase
 * - Removes accents/diacritics
 * - Removes punctuation (keeps alphanumeric and spaces)
 * - Collapses multiple spaces
 * - Trims whitespace
 *
 * @param text - Text to normalize
 * @returns Normalized text string
 */
export function normalize(text: string | null | undefined): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Remove accents/diacritics
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove punctuation, keep alphanumeric and spaces
    .replace(/[^\w\s]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
}

/**
 * Normalizes and joins multiple text parts into a single searchable string.
 *
 * @param parts - Array of text parts (can include null/undefined)
 * @returns Single normalized string
 */
export function normalizeMultiple(parts: (string | null | undefined)[]): string {
  return normalize(
    parts
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .join(' ')
  );
}

// ============================================
// TOKENIZATION
// ============================================

/**
 * Minimum token length for indexing (shorter tokens are filtered out).
 */
export const MIN_TOKEN_LENGTH = 2;

/**
 * Common stop words to filter out (optional, can be skipped for simplicity).
 */
export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
  'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
  'or', 'that', 'the', 'to', 'was', 'were', 'will', 'with',
]);

/**
 * Tokenizes text into searchable words.
 * - Normalizes text first
 * - Splits on whitespace
 * - Filters out short tokens
 * - Optionally filters stop words
 *
 * @param text - Text to tokenize
 * @param options - Tokenization options
 * @returns Array of tokens
 */
export function tokenize(
  text: string | null | undefined,
  options: {
    minLength?: number;
    filterStopWords?: boolean;
  } = {}
): string[] {
  const { minLength = MIN_TOKEN_LENGTH, filterStopWords = false } = options;

  const normalized = normalize(text);
  if (!normalized) return [];

  let tokens = normalized.split(' ').filter((t) => t.length >= minLength);

  if (filterStopWords) {
    tokens = tokens.filter((t) => !STOP_WORDS.has(t));
  }

  return tokens;
}

/**
 * Creates a unique set of tokens from text.
 *
 * @param text - Text to tokenize
 * @returns Set of unique tokens
 */
export function uniqueTokens(text: string | null | undefined): Set<string> {
  return new Set(tokenize(text));
}

// ============================================
// RELEVANCE SCORING
// ============================================

/**
 * Scoring weights for different match types.
 */
export const SCORE_WEIGHTS = {
  /** Score for exact phrase match */
  EXACT_MATCH: 100,
  /** Score when text starts with query */
  STARTS_WITH: 50,
  /** Score when a word starts with query */
  WORD_STARTS_WITH: 20,
  /** Score for each occurrence of query term */
  CONTAINS: 10,
  /** Bonus per word match */
  WORD_MATCH_BONUS: 5,
};

/**
 * Calculates a relevance score for how well text matches a query.
 * Higher scores indicate better matches.
 *
 * @param query - Search query (will be normalized)
 * @param text - Text to match against (will be normalized)
 * @returns Relevance score (0 if no match)
 */
export function calculateRelevance(
  query: string | null | undefined,
  text: string | null | undefined
): number {
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);

  if (!normalizedQuery || !normalizedText) return 0;

  let score = 0;

  // Exact phrase match (highest priority)
  if (normalizedText === normalizedQuery) {
    return SCORE_WEIGHTS.EXACT_MATCH;
  }

  // Text starts with query
  if (normalizedText.startsWith(normalizedQuery)) {
    score += SCORE_WEIGHTS.STARTS_WITH;
  }

  // Check for contains
  if (normalizedText.includes(normalizedQuery)) {
    score += SCORE_WEIGHTS.CONTAINS;
  }

  // Word-level matching
  const queryTokens = tokenize(normalizedQuery);
  const textWords = normalizedText.split(' ');

  for (const queryToken of queryTokens) {
    for (const word of textWords) {
      // Word starts with query token
      if (word.startsWith(queryToken)) {
        score += SCORE_WEIGHTS.WORD_STARTS_WITH;
      }
      // Exact word match
      if (word === queryToken) {
        score += SCORE_WEIGHTS.WORD_MATCH_BONUS;
      }
    }
  }

  // Frequency bonus (number of occurrences)
  const occurrences = normalizedText.split(normalizedQuery).length - 1;
  if (occurrences > 1) {
    score += (occurrences - 1) * 2;
  }

  return score;
}

/**
 * Checks if text matches a query (simple boolean match).
 *
 * @param query - Search query
 * @param text - Text to check
 * @returns True if there's any match
 */
export function matches(
  query: string | null | undefined,
  text: string | null | undefined
): boolean {
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);

  if (!normalizedQuery || !normalizedText) return false;

  // Check if text contains the query
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  // Check for word-level matches
  const queryTokens = tokenize(normalizedQuery);
  const textTokens = new Set(tokenize(normalizedText));

  return queryTokens.some((qt) =>
    Array.from(textTokens).some((tt) => tt.startsWith(qt) || qt.startsWith(tt))
  );
}

// ============================================
// SNIPPET EXTRACTION
// ============================================

/**
 * Default maximum length for snippets.
 */
export const DEFAULT_SNIPPET_LENGTH = 150;

/**
 * Context characters to show before/after match.
 */
export const SNIPPET_CONTEXT = 40;

/**
 * Extracts a snippet from text around the matched query.
 * Highlights the matched portion with surrounding context.
 *
 * @param text - Full text to extract from
 * @param query - Query that was matched
 * @param maxLength - Maximum snippet length
 * @returns Object with snippet text and match positions
 */
export function extractSnippet(
  text: string | null | undefined,
  query: string | null | undefined,
  maxLength: number = DEFAULT_SNIPPET_LENGTH
): {
  snippet: string;
  matchStart: number;
  matchEnd: number;
  hasMore: boolean;
} {
  if (!text || !query) {
    return {
      snippet: text?.substring(0, maxLength) || '',
      matchStart: -1,
      matchEnd: -1,
      hasMore: (text?.length || 0) > maxLength,
    };
  }

  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);

  // Find the position in normalized text
  const normalizedMatchIndex = normalizedText.indexOf(normalizedQuery);

  if (normalizedMatchIndex === -1) {
    // No match found, return start of text
    const snippet = text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    return {
      snippet,
      matchStart: -1,
      matchEnd: -1,
      hasMore: text.length > maxLength,
    };
  }

  // Find approximate position in original text
  // This is a heuristic since normalization changes character positions
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  let matchIndex = lowerText.indexOf(lowerQuery);

  // If direct match fails, try finding any word from query
  if (matchIndex === -1) {
    const queryWords = lowerQuery.split(/\s+/);
    for (const word of queryWords) {
      if (word.length >= MIN_TOKEN_LENGTH) {
        matchIndex = lowerText.indexOf(word);
        if (matchIndex !== -1) break;
      }
    }
  }

  // If still no match, use normalized position as approximation
  if (matchIndex === -1) {
    matchIndex = Math.min(normalizedMatchIndex, text.length - 1);
  }

  // Calculate start and end positions for snippet
  const halfContext = Math.floor((maxLength - query.length) / 2);
  let start = Math.max(0, matchIndex - halfContext);
  let end = Math.min(text.length, matchIndex + query.length + halfContext);

  // Adjust to not cut words
  if (start > 0) {
    const spaceIndex = text.indexOf(' ', start);
    if (spaceIndex !== -1 && spaceIndex < matchIndex) {
      start = spaceIndex + 1;
    }
  }
  if (end < text.length) {
    const spaceIndex = text.lastIndexOf(' ', end);
    if (spaceIndex > matchIndex + query.length) {
      end = spaceIndex;
    }
  }

  // Build snippet
  let snippet = text.substring(start, end);
  const hasMoreBefore = start > 0;
  const hasMoreAfter = end < text.length;

  if (hasMoreBefore) {
    snippet = '...' + snippet;
  }
  if (hasMoreAfter) {
    snippet = snippet + '...';
  }

  // Calculate match positions in snippet
  const snippetMatchStart = hasMoreBefore
    ? matchIndex - start + 3
    : matchIndex - start;
  const snippetMatchEnd = snippetMatchStart + query.length;

  return {
    snippet,
    matchStart: snippetMatchStart,
    matchEnd: snippetMatchEnd,
    hasMore: hasMoreBefore || hasMoreAfter,
  };
}

/**
 * Escapes HTML special characters to prevent XSS when using dangerouslySetInnerHTML.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Highlights matched text in a snippet using HTML tags.
 * All text is HTML-escaped before insertion to prevent XSS.
 *
 * @param text - Text to highlight in
 * @param query - Query to highlight
 * @param tag - HTML tag to use for highlighting (default: 'mark')
 * @returns HTML-escaped text with highlighted matches
 */
export function highlightMatches(
  text: string | null | undefined,
  query: string | null | undefined,
  tag: string = 'mark'
): string {
  if (!text || !query) return escapeHtml(text || '');

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerText.includes(lowerQuery)) {
    return escapeHtml(text);
  }

  // Find all match positions
  const positions: Array<{ start: number; end: number }> = [];
  let searchStart = 0;

  while (searchStart < text.length) {
    const index = lowerText.indexOf(lowerQuery, searchStart);
    if (index === -1) break;

    positions.push({
      start: index,
      end: index + query.length,
    });
    searchStart = index + 1;
  }

  if (positions.length === 0) return escapeHtml(text);

  // Build result with highlights (escape non-matched text, escape matched text inside tags)
  let result = '';
  let lastEnd = 0;

  for (const pos of positions) {
    result += escapeHtml(text.substring(lastEnd, pos.start));
    result += `<${tag}>${escapeHtml(text.substring(pos.start, pos.end))}</${tag}>`;
    lastEnd = pos.end;
  }
  result += escapeHtml(text.substring(lastEnd));

  return result;
}

// ============================================
// SEARCH RESULT TYPES
// ============================================

/**
 * Entity types that can be searched.
 * Note: Uses JOURNAL (not JOURNAL_ENTRY) for UI display consistency.
 * The offlineSearch.service.ts handles the mapping to/from JOURNAL_ENTRY.
 */
export type SearchableEntityType =
  | 'TRIP'
  | 'LOCATION'
  | 'ACTIVITY'
  | 'JOURNAL'
  | 'TRANSPORTATION'
  | 'LODGING';

/**
 * Storage entity types used in IndexedDB (aligns with offline.types.ts).
 * Includes JOURNAL_ENTRY which is the backend entity type name.
 */
export type StorageEntityType =
  | 'TRIP'
  | 'LOCATION'
  | 'ACTIVITY'
  | 'JOURNAL_ENTRY'
  | 'TRANSPORTATION'
  | 'LODGING'
  | 'PHOTO_ALBUM'
  | 'PHOTO';

/**
 * Single search result item.
 */
export interface SearchResultItem {
  /** Entity type */
  entityType: SearchableEntityType;
  /** Entity ID */
  entityId: string;
  /** Trip ID the entity belongs to */
  tripId: string;
  /** Display title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Field name where match was found */
  matchedField: string;
  /** Snippet with context around match */
  snippet?: string;
  /** Relevance score */
  score: number;
  /** URL to navigate to */
  url: string;
}

/**
 * Grouped search results by entity type.
 */
export interface GroupedSearchResults {
  /** Results grouped by entity type */
  groups: {
    entityType: SearchableEntityType;
    label: string;
    results: SearchResultItem[];
  }[];
  /** Total number of results */
  total: number;
  /** Query that was searched */
  query: string;
  /** Timestamp of search */
  timestamp: number;
}

/**
 * Labels for entity types in search results.
 */
export const ENTITY_TYPE_LABELS: Record<SearchableEntityType, string> = {
  TRIP: 'Trips',
  LOCATION: 'Locations',
  ACTIVITY: 'Activities',
  JOURNAL: 'Journal Entries',
  TRANSPORTATION: 'Transportation',
  LODGING: 'Lodging',
};

/**
 * Icons for entity types (using SVG path data).
 */
export const ENTITY_TYPE_ICONS: Record<SearchableEntityType, string> = {
  TRIP: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
  LOCATION: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  ACTIVITY: 'M13 10V3L4 14h7v7l9-11h-7z',
  JOURNAL: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  TRANSPORTATION: 'M5 17h14M5 17a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2M5 17l-2 4h18l-2-4M12 12V5',
  LODGING: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
};

/**
 * Creates URL for a search result based on entity type and IDs.
 *
 * @param entityType - Type of entity
 * @param entityId - Entity ID
 * @param tripId - Trip ID
 * @returns URL path to navigate to
 */
export function createResultUrl(
  entityType: SearchableEntityType,
  entityId: string,
  tripId: string
): string {
  switch (entityType) {
    case 'TRIP':
      return `/trips/${entityId}`;
    case 'LOCATION':
      return `/trips/${tripId}?tab=locations&highlight=${entityId}`;
    case 'ACTIVITY':
      return `/trips/${tripId}?tab=activities&highlight=${entityId}`;
    case 'JOURNAL':
      return `/trips/${tripId}?tab=journal&highlight=${entityId}`;
    case 'TRANSPORTATION':
      return `/trips/${tripId}?tab=transportation&highlight=${entityId}`;
    case 'LODGING':
      return `/trips/${tripId}?tab=lodging&highlight=${entityId}`;
    default:
      return `/trips/${tripId}`;
  }
}
