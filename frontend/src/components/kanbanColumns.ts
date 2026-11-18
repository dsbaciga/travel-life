import { createContext } from 'react';
import type { TripStatusType } from '../types/trip';
import { TripStatus } from '../types/trip';

export const KANBAN_COLUMNS = [
  { status: TripStatus.DREAM, label: 'Dream', color: '#9333EA' },
  { status: TripStatus.PLANNING, label: 'Planning', color: '#EAB308' },
  { status: TripStatus.PLANNED, label: 'Planned', color: '#3B82F6' },
  { status: TripStatus.IN_PROGRESS, label: 'In Progress', color: '#22C55E' },
  { status: TripStatus.COMPLETED, label: 'Completed', color: '#6B7280' },
];

/**
 * Lets a card change its trip's status without drag and drop. Provided by
 * TripsKanbanView; cards outside a provider (the drag overlay) show no control.
 */
export const KanbanStatusChangeContext = createContext<
  ((tripId: number, status: TripStatusType) => Promise<void>) | null
>(null);
