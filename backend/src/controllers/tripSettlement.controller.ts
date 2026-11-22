import tripSettlementService from '../services/tripSettlement.service';
import { createSettlementSchema, updateSettlementSchema } from '../types/tripSettlement.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const tripSettlementController = createCrudController({
  service: tripSettlementService,
  handlers: {
    list: {
      method: 'list',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    create: {
      method: 'create',
      statusCode: 201,
      bodySchema: createSettlementSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    update: {
      method: 'update',
      bodySchema: updateSettlementSchema,
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
        body,
      ],
    },
    remove: {
      method: 'remove',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
      ],
    },
  },
});
