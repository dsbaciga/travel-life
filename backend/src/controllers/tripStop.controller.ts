import tripStopService from '../services/tripStop.service';
import {
  createTripStopSchema,
  updateTripStopSchema,
  reorderTripStopsSchema,
} from '../types/tripStop.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const tripStopController = createCrudController({
  service: tripStopService,
  handlers: {
    createStop: {
      method: 'createStop',
      statusCode: 201,
      bodySchema: createTripStopSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    getStopsByTrip: {
      method: 'getStopsByTrip',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    updateStop: {
      method: 'updateStop',
      bodySchema: updateTripStopSchema,
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
        body,
      ],
    },
    deleteStop: {
      method: 'deleteStop',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
      ],
    },
    reorderStops: {
      method: 'reorderStops',
      bodySchema: reorderTripStopsSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});
