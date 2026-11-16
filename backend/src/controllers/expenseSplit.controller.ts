import expenseSplitService from '../services/expenseSplit.service';
import { setExpenseSplitSchema } from '../types/expenseSplit.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const expenseSplitController = createCrudController({
  service: expenseSplitService,
  handlers: {
    getParticipants: {
      method: 'getParticipants',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    setSplit: {
      method: 'setSplit',
      bodySchema: setExpenseSplitSchema,
      buildArgs: (userId, req, body) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        parseId(req.params.id),
        body,
      ],
    },
    getSettleUp: {
      method: 'getSettleUp',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
  },
});
