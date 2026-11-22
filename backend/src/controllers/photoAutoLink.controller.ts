import photoAutoLinkService from '../services/photoAutoLink.service';
import { applyPhotoActivityLinksSchema } from '../types/photoAutoLink.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const photoAutoLinkController = createCrudController({
  service: photoAutoLinkService,
  handlers: {
    getActivitySuggestions: {
      method: 'getActivitySuggestions',
      buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
    },
    applyActivityLinks: {
      method: 'applyActivityLinks',
      statusCode: 201,
      bodySchema: applyPhotoActivityLinksSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});
