import foodLogService from '../services/foodLog.service';
import { createFoodLogEntrySchema, updateFoodLogEntrySchema } from '../types/foodLog.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

/** Lenient query parsing: invalid values are ignored rather than rejected. */
function parseMinRating(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function parseBool(value: unknown): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export const foodLogController = createCrudController({
  service: foodLogService,
  handlers: {
    createEntry: {
      method: 'createEntry',
      statusCode: 201,
      bodySchema: createFoodLogEntrySchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    getEntriesByTrip: {
      method: 'getEntriesByTrip',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    updateEntry: {
      method: 'updateEntry',
      bodySchema: updateFoodLogEntrySchema,
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
        body,
      ],
    },
    deleteEntry: {
      method: 'deleteEntry',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
      ],
    },
    searchEntries: {
      method: 'searchEntries',
      buildArgs: (userId, req) => [
        userId,
        {
          minRating: parseMinRating(req.query.minRating),
          orderAgain: parseBool(req.query.orderAgain),
          q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined,
        },
      ],
    },
  },
});
