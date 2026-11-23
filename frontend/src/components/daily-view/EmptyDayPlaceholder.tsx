import { useNavigate } from 'react-router';
import Icon from '../ui/Icon';

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
        <Icon name="calendar" size={40} className="text-gray-400 dark:text-dusk-400" />
      </div>

      {/* Message */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        No activities scheduled
      </h3>
      <p className="text-gray-500 dark:text-dusk-400 mb-6 max-w-md">
        Day {dayNumber} doesn't have any events yet. Add activities, transport, stays, or journal entries to fill your day.
      </p>

      {/* Quick add buttons */}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={handleAddActivity}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          <Icon name="add" size={16} />
          Activity
        </button>

        <button
          type="button"
          onClick={handleAddTransportation}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          <Icon name="add" size={16} />
          Transport
        </button>

        <button
          type="button"
          onClick={handleAddLodging}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          <Icon name="add" size={16} />
          Stay
        </button>

        <button
          type="button"
          onClick={handleAddJournal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Icon name="add" size={16} />
          Journal
        </button>
      </div>
    </div>
  );
}
