import { useNavigate } from 'react-router';

interface EmptyDayPlaceholderProps {
  tripId: number;
  dayNumber: number;
}

export default function EmptyDayPlaceholder({
  tripId,
  dayNumber,
}: EmptyDayPlaceholderProps) {
  const navigate = useNavigate();

  const handleAddActivity = () => {
    navigate(`/trips/${tripId}?tab=activities`);
  };

  const handleAddTransportation = () => {
    navigate(`/trips/${tripId}?tab=transportation`);
  };

  const handleAddLodging = () => {
    navigate(`/trips/${tripId}?tab=lodging`);
  };

  const handleAddJournal = () => {
    navigate(`/trips/${tripId}?tab=journal`);
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {/* Empty state icon */}
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-dusk-700 flex items-center justify-center mb-4">
        <svg
          className="w-10 h-10 text-gray-400 dark:text-dusk-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Message */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No activities scheduled
      </h3>
      <p className="text-gray-500 dark:text-dusk-400 mb-6 max-w-md">
        Day {dayNumber} doesn't have any events yet. Add activities, transportation, lodging, or journal entries to fill your day.
      </p>

      {/* Quick add buttons */}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={handleAddActivity}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Activity
        </button>

        <button
          type="button"
          onClick={handleAddTransportation}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Transport
        </button>

        <button
          type="button"
          onClick={handleAddLodging}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Lodging
        </button>

        <button
          type="button"
          onClick={handleAddJournal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Journal
        </button>
      </div>
    </div>
  );
}
