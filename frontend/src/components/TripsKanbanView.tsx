import { useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useState } from 'react';
import type { Trip, TripStatusType } from '../types/trip';
import { KANBAN_COLUMNS as COLUMNS, KanbanStatusChangeContext } from './kanbanColumns';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';

interface TripsKanbanViewProps {
  trips: Trip[];
  coverPhotoUrls: { [key: number]: string };
  onStatusChange: (tripId: number, newStatus: TripStatusType) => Promise<void>;
  /** Callback before navigating away (e.g., to save scroll position) */
  onNavigateAway?: () => void;
}

export default function TripsKanbanView({
  trips,
  coverPhotoUrls,
  onStatusChange,
  onNavigateAway,
}: TripsKanbanViewProps) {
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);

  const sensors = useSensors(
    // Mouse drags after 8px of movement. Touch needs a press-and-hold so a swipe
    // still scrolls the board.
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    })
  );

  // Group trips by status
  const tripsByStatus = useMemo(() => {
    const grouped: Record<string, Trip[]> = {};
    COLUMNS.forEach((col) => {
      grouped[col.status] = [];
    });
    trips.forEach((trip) => {
      if (grouped[trip.status]) {
        grouped[trip.status].push(trip);
      }
    });
    return grouped;
  }, [trips]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const tripData = active.data.current?.trip as Trip | undefined;
    if (tripData) {
      setActiveTrip(tripData);
    }
  }, []);

  const handleDragOver = useCallback(() => {
    // Handle drag over logic if needed
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTrip(null);

      if (!over) return;

      const tripId = parseInt(active.id as string);
      if (isNaN(tripId)) {
        console.error('Invalid trip ID:', active.id);
        return;
      }
      const trip = trips.find((t) => t.id === tripId);
      if (!trip) return;

      // Determine the target status
      let targetStatus: string | null = null;

      if (over.data.current?.type === 'column') {
        // Dropped directly on a column
        targetStatus = over.data.current.status;
      } else if (over.data.current?.type === 'trip') {
        // Dropped on another trip - find its column
        const overTrip = trips.find((t) => t.id.toString() === over.id);
        if (overTrip) {
          targetStatus = overTrip.status;
        }
      } else if (typeof over.id === 'string' && COLUMNS.find((c) => c.status === over.id)) {
        // Dropped on column by ID
        targetStatus = over.id;
      }

      // If status changed, update it
      if (targetStatus && targetStatus !== trip.status) {
        try {
          await onStatusChange(tripId, targetStatus as TripStatusType);
        } catch (error) {
          console.error('Failed to update trip status:', error);
        }
      }
    },
    [trips, onStatusChange]
  );

  return (
    <KanbanStatusChangeContext.Provider value={onStatusChange}>
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.status}
              status={column.status}
              label={column.label}
              trips={tripsByStatus[column.status] || []}
              coverPhotoUrls={coverPhotoUrls}
              color={column.color}
              onNavigateAway={onNavigateAway}
            />
          ))}
        </div>
      </div>

      {/* Drag overlay - shows the dragged card */}
      <DragOverlay>
        {activeTrip ? (
          <div className="opacity-90 rotate-3">
            <KanbanCard
              trip={activeTrip}
              coverPhotoUrl={coverPhotoUrls[activeTrip.id]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </KanbanStatusChangeContext.Provider>
  );
}
