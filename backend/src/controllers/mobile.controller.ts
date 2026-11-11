import mobileSyncService from '../services/mobileSync.service';
import trackService from '../services/track.service';
import receiptService from '../services/receipt.service';
import pushNotificationService from '../services/pushNotification.service';
import {
  inferPhotoLocationsSchema,
  parseReceiptSchema,
  registerMobilePushTokenSchema,
  trackBatchSchema,
  unregisterMobilePushTokenSchema,
} from '../types/mobile.types';
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const mobileSyncController = createCrudController({
  service: mobileSyncService,
  handlers: {
    getSnapshot: {
      method: 'getSnapshot',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        queryString(req.query.since),
      ],
    },
  },
});

export const trackController = createCrudController({
  service: trackService,
  handlers: {
    ingestBatch: {
      method: 'ingestBatch',
      statusCode: 201,
      bodySchema: trackBatchSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
    getTrackForDay: {
      method: 'getTrackForDay',
      buildArgs: (userId, req) => [
        userId,
        parseId(req.params.tripId, 'tripId'),
        queryString(req.query.date) ?? '',
        queryString(req.query.timezone),
      ],
    },
    inferPhotoLocations: {
      method: 'inferPhotoLocations',
      bodySchema: inferPhotoLocationsSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});

export const receiptController = createCrudController({
  service: receiptService,
  handlers: {
    parseReceipt: {
      method: 'parseReceipt',
      bodySchema: parseReceiptSchema,
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});

export const mobilePushController = createCrudController({
  service: pushNotificationService,
  handlers: {
    registerToken: {
      method: 'saveMobileToken',
      statusCode: 201,
      bodySchema: registerMobilePushTokenSchema,
      buildArgs: (userId, _req, body) => [userId, body],
    },
    unregisterToken: {
      method: 'removeMobileToken',
      bodySchema: unregisterMobilePushTokenSchema,
      buildArgs: (userId, _req, body) => [userId, body],
    },
  },
});
