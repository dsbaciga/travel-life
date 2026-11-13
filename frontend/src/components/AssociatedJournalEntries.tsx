import { Link } from 'react-router';
import { stripMarkdown } from '../utils/stripMarkdown';
import { formatDate } from '../utils/dateFormat';

interface JournalEntryInfo {
  id: number;
  title: string | null;
  content: string;
  date: string | null;
  entryType: string;
}

interface AssociatedJournalEntriesProps {
  journalEntries?: { journal: JournalEntryInfo }[];
  tripId: number;
  title?: string;
}

export default function AssociatedJournalEntries({
  journalEntries,
  tripId,
  title = 'Associated Journal Entries'
}: AssociatedJournalEntriesProps) {
  if (!journalEntries || journalEntries.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-dusk-300 mb-2">
        {title}
      </h4>
      <div className="space-y-2">
        {journalEntries.map(({ journal }) => (
          <Link
            key={journal.id}
            to={`/trips/${tripId}?tab=journal`}
            className="block p-3 bg-gray-50 dark:bg-dusk-700 hover:bg-gray-100 dark:hover:bg-dusk-600 rounded-lg transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {journal.title && (
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {journal.title}
                  </div>
                )}
                <div className="text-sm text-gray-600 dark:text-dusk-400 line-clamp-2 mt-1">
                  {stripMarkdown(journal.content)}
                </div>
              </div>
              <div className="ml-3 text-xs text-gray-500 dark:text-dusk-400 whitespace-nowrap">
                {formatDate(journal.date, 'medium', 'Trip Journal')}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
