export const DEADLINE_KINDS = ['cancellation', 'check_in', 'payment', 'other'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  cancellation: 'Free cancellation ends',
  check_in: 'Online check-in opens',
  payment: 'Payment due',
  other: 'Other deadline',
};

export type DeadlineEntityType = 'lodging' | 'transportation' | 'activity';

export type BookingDeadline = {
  id: number;
  tripId: number;
  entityType: DeadlineEntityType;
  entityId: number;
  kind: DeadlineKind;
  /** ISO instant. */
  dueAt: string;
  note: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpcomingBookingDeadline = BookingDeadline & {
  trip: { id: number; title: string; timezone: string | null };
};

export type CreateBookingDeadlineInput = {
  entityType: DeadlineEntityType;
  entityId: number;
  kind: DeadlineKind;
  dueAt: string;
  note?: string | null;
};

export type UpdateBookingDeadlineInput = {
  kind?: DeadlineKind;
  dueAt?: string;
  note?: string | null;
  dismissed?: boolean;
};
