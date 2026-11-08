import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyEntityInTrip, verifyTripAccessWithPermission } from './_shared/tripAccess';
import {
  CreateBookingDeadlineInput,
  UpdateBookingDeadlineInput,
  DeadlineEntityType,
} from '../types/bookingDeadline.types';

/** How far ahead the dashboard "upcoming" list looks by default. */
const DEFAULT_UPCOMING_DAYS = 30;

const targetField = {
  lodging: 'lodgingId',
  transportation: 'transportationId',
  activity: 'activityId',
} as const satisfies Record<DeadlineEntityType, string>;

/** Adds a derived entityType/entityId so clients don't have to inspect three nullable FKs. */
function withTarget<
  T extends { lodgingId: number | null; transportationId: number | null; activityId: number | null }
>(row: T) {
  const entityType: DeadlineEntityType = row.lodgingId
    ? 'lodging'
    : row.transportationId
      ? 'transportation'
      : 'activity';
  const entityId = (row.lodgingId ?? row.transportationId ?? row.activityId) as number;
  return { ...row, entityType, entityId };
}

async function findInTrip(deadlineId: number, tripId: number) {
  const deadline = await prisma.bookingDeadline.findFirst({ where: { id: deadlineId, tripId } });
  if (!deadline) {
    throw new AppError('Deadline not found or does not belong to trip', 404);
  }
  return deadline;
}

class BookingDeadlineService {
  async createDeadline(userId: number, tripId: number, data: CreateBookingDeadlineInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await verifyEntityInTrip(data.entityType, data.entityId, tripId);

    const created = await prisma.bookingDeadline.create({
      data: {
        tripId,
        [targetField[data.entityType]]: data.entityId,
        kind: data.kind,
        dueAt: new Date(data.dueAt),
        note: data.note ?? null,
      },
    });
    return withTarget(created);
  }

  async getDeadlinesByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    const rows = await prisma.bookingDeadline.findMany({
      where: { tripId },
      orderBy: { dueAt: 'asc' },
    });
    return rows.map(withTarget);
  }

  async updateDeadline(
    userId: number,
    tripId: number,
    deadlineId: number,
    data: UpdateBookingDeadlineInput
  ) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await findInTrip(deadlineId, tripId);

    const dueChanged =
      data.dueAt !== undefined && new Date(data.dueAt).getTime() !== existing.dueAt.getTime();

    const updated = await prisma.bookingDeadline.update({
      where: { id: deadlineId },
      data: {
        ...(data.kind !== undefined && { kind: data.kind }),
        ...(data.dueAt !== undefined && { dueAt: new Date(data.dueAt) }),
        ...(data.note !== undefined && { note: data.note }),
        ...(data.dismissed !== undefined && {
          dismissedAt: data.dismissed ? new Date() : null,
        }),
        // A moved deadline deserves a fresh reminder.
        ...(dueChanged && { notifiedAt: null }),
      },
    });
    return withTarget(updated);
  }

  async deleteDeadline(userId: number, tripId: number, deadlineId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(deadlineId, tripId);
    await prisma.bookingDeadline.delete({ where: { id: deadlineId } });
    return { id: deadlineId };
  }

  /**
   * Undismissed deadlines due within `days` across every trip the user can see
   * (owned or collaborated). Overdue-but-undismissed ones are included so a
   * missed cutoff stays visible until acknowledged.
   */
  async getUpcoming(userId: number, days: number = DEFAULT_UPCOMING_DAYS) {
    const horizon = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const rows = await prisma.bookingDeadline.findMany({
      where: {
        dismissedAt: null,
        dueAt: { lte: horizon },
        trip: {
          status: { notIn: ['cancelled', 'Cancelled'] },
          OR: [{ userId }, { collaborators: { some: { userId } } }],
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
      include: { trip: { select: { id: true, title: true, timezone: true } } },
    });
    return rows.map(withTarget);
  }
}

export const bookingDeadlineService = new BookingDeadlineService();
export default bookingDeadlineService;
