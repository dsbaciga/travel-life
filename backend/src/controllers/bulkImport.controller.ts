import bulkImportService from '../services/bulkImport.service';
import {
  importActivitiesSchema,
  importLocationsSchema,
  importLodgingSchema,
  importTransportationSchema,
} from '../types/bulkImport.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const bulkImportController = createCrudController({
  service: bulkImportService,
  handlers: {
    importLocations: {
      method: 'importLocations',
      bodySchema: importLocationsSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    importActivities: {
      method: 'importActivities',
      bodySchema: importActivitiesSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    importLodging: {
      method: 'importLodging',
      bodySchema: importLodgingSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    importTransportation: {
      method: 'importTransportation',
      bodySchema: importTransportationSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});
