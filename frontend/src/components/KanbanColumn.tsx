import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Trip } from '../types/trip';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  status: string;
  label: string;
  trips: Trip[];
  coverPhotoUrls: { [key: number]: string };
  color: string;
  /** Callback before navigating away (e.g., to save scroll position) */
  onNavigateAway?: () => void;
}

export default function KanbanColumn({
  status,
  label,
  trips,
  coverPhotoUrls,
  color,
  onNavigateAway,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });

  const tripIds = trips.map((trip) => trip.id.toString());

  return (
    <div className="flex flex-col min-w-[240px] w-[240px] sm:min-w-[280px] sm:w-[280px] flex-shrink-0">
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg"
        style={{ backgroundColor: color }}
      >
        <h3 className="font-semibold text-white text-sm">{label}</h3>
        <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white">
          {trips.length}
        </span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] p-2 bg-gray-100 dark:bg-gray-800 rounded-b-lg space-y-2 overflow-y-auto transition-colors ${
          isOver ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400 ring-inset' : ''
        }`}
      >
        <SortableContext items={tripIds} strategy={verticalListSortingStrategy}>
          {trips.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-400 text-sm">
              Drop trips here
            </div>
          ) : (
            trips.map((trip) => (
              <KanbanCard
                key={trip.id}
                trip={trip}
                coverPhotoUrl={coverPhotoUrls[trip.id]}
                onNavigateAway={onNavigateAway}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
