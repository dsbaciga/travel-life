import bookingDeadlineService from '../services/bookingDeadline.service';
import {
  createBookingDeadlineSchema,
  updateBookingDeadlineSchema,
} from '../types/bookingDeadline.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

/** Parses ?days= leniently: anything invalid or out of range falls back to the default window. */
function parseDays(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : undefined;
}

export const bookingDeadlineController = createCrudController({
  service: bookingDeadlineService,
  handlers: {
    createDeadline: {
      method: 'createDeadline',
      statusCode: 201,
      bodySchema: createBookingDeadlineSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    getDeadlinesByTrip: {
      method: 'getDeadlinesByTrip',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    updateDeadline: {
      method: 'updateDeadline',
      bodySchema: updateBookingDeadlineSchema,
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
        body,
      ],
    },
    deleteDeadline: {
      method: 'deleteDeadline',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
      ],
    },
    getUpcoming: {
      method: 'getUpcoming',
      buildArgs: (userId, req) => [userId, parseDays(req.query.days)],
    },
  },
});
