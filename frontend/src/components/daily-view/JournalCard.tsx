import { useState } from 'react';
import Icon from '../ui/Icon';
import { useNavigate } from 'react-router';
import type { JournalEntry } from '../../types/journalEntry';
import type { Location } from '../../types/location';
import type { PhotoAlbum } from '../../types/photo';
import EmbeddedLocationCard from './EmbeddedLocationCard';
import EmbeddedAlbumCard from './EmbeddedAlbumCard';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import MarkdownRenderer from '../MarkdownRenderer';
import { stripMarkdown } from '../../utils/stripMarkdown';
import { getTypeColors, getMoodEmoji } from './utils';

interface JournalCardProps {
  journal: JournalEntry;
  tripId: number;
  tripTimezone?: string;
  linkedLocations?: Location[];
  linkedAlbums?: PhotoAlbum[];
  /** Current date being displayed (for filtering linked journal entries) */
  currentDate?: Date;
}

export default function JournalCard({
  journal,
  tripId,
  tripTimezone,
  linkedLocations = [],
  linkedAlbums = [],
  currentDate,
}: JournalCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('journal');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleEdit = () => {
    navigate(`/trips/${tripId}?tab=journal&edit=${journal.id}`);
  };

  // Format entry type display
  const entryTypeDisplay =
    journal.entryType.charAt(0).toUpperCase() +
    journal.entryType.slice(1).replace(/_/g, ' ');

  // Get mood emoji
  const moodEmoji = getMoodEmoji(journal.mood);

  // Check if content is long enough to need expand/collapse
  const isLongContent = journal.content && journal.content.length > 300;

  return (
    <div
      className={`bg-white dark:bg-dusk-800 rounded-xl shadow-sm border ${colors.border} border-l-4 ${colors.accent} overflow-hidden hover:shadow-md transition-shadow`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center flex-shrink-0`}
            >
              <Icon name="journal" size={24} />
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 break-words [overflow-wrap:anywhere]">
                {journal.title || 'Untitled Entry'}
              </h3>

              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500 dark:text-dusk-400">
                <span>{entryTypeDisplay}</span>

                {journal.mood && (
                  <>
                    <span className="text-gray-300 dark:text-dusk-600">·</span>
                    <span className="inline-flex items-center gap-1">
                      {moodEmoji} {journal.mood}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleEdit}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
              title="Edit journal entry"
            >
              <Icon name="edit" size={20} />
            </button>
          </div>
        </div>

        {/* Weather notes */}
        {journal.weatherNotes && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-dusk-400">
            <Icon name="cloud" size={16} />
            <span>{journal.weatherNotes}</span>
          </div>
        )}

        {/* Content */}
        {journal.content && (
          <div className="mt-4">
            {isExpanded ? (
              <MarkdownRenderer content={journal.content} />
            ) : (
              <p
                className={`journal-prose text-gray-700 dark:text-dusk-300 ${
                  isLongContent ? 'line-clamp-6' : ''
                }`}
              >
                {stripMarkdown(journal.content)}
              </p>
            )}

            {isLongContent && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {isExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

        {/* Linked locations */}
        {linkedLocations.length > 0 && (
          <div className="mt-3">
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-2">
              Related Locations ({linkedLocations.length})
            </div>
            <div className="space-y-3">
              {linkedLocations.map((loc) => (
                <EmbeddedLocationCard
                  key={loc.id}
                  location={loc}
                  tripId={tripId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Linked albums */}
        {linkedAlbums.length > 0 && (
          <div className="mt-4">
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-2">
              Related Albums ({linkedAlbums.length})
            </div>
            <div className="space-y-3">
              {linkedAlbums.map((album) => (
                <EmbeddedAlbumCard
                  key={album.id}
                  album={album}
                  tripId={tripId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other linked entities (photos, etc.) */}
        <LinkedEntitiesDisplay
          tripId={tripId}
          entityType="JOURNAL_ENTRY"
          entityId={journal.id}
          excludeTypes={['LOCATION', 'PHOTO_ALBUM']}
          compact
          currentDate={currentDate}
          timezone={tripTimezone}
        />
      </div>
    </div>
  );
}
