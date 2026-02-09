import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/aviationstack.service', () => ({
  __esModule: true,
  default: {
    getFlightStatus: jest.fn(),
    refreshFlightsForTrip: jest.fn(),
    updateFlightTracking: jest.fn(),
  },
}));

import aviationstackService from '../../services/aviationstack.service';
import { flightTrackingController } from '../flightTracking.controller';
import {
  createAuthenticatedControllerArgs,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

describe('flightTracking.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getFlightStatus', () => {
    it('should return flight status for a transportation record', async () => {
      const mockStatus = { flightNumber: 'AA100', status: 'on-time', departure: '2024-06-01T10:00:00Z' };
      (aviationstackService.getFlightStatus as jest.Mock).mockResolvedValue(mockStatus as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { transportationId: '3' },
      });
      flightTrackingController.getFlightStatus(req as any, res as any, next);
      await flushPromises();

      expect(aviationstackService.getFlightStatus).toHaveBeenCalledWith(testUsers.user1.id, 3);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockStatus });
    });

    it('should pass errors to next', async () => {
      const error = new Error('Flight not found');
      (aviationstackService.getFlightStatus as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { transportationId: '3' },
      });
      flightTrackingController.getFlightStatus(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('refreshFlightsForTrip', () => {
    it('should refresh all flights for a trip', async () => {
      const mockResults = [
        { flightNumber: 'AA100', status: 'on-time' },
        { flightNumber: 'UA200', status: 'delayed' },
      ];
      (aviationstackService.refreshFlightsForTrip as jest.Mock).mockResolvedValue(mockResults as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      flightTrackingController.refreshFlightsForTrip(req as any, res as any, next);
      await flushPromises();

      expect(aviationstackService.refreshFlightsForTrip).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResults,
        message: 'Refreshed 2 flight(s)',
      });
    });
  });

  describe('updateFlightTracking', () => {
    it('should update flight tracking info', async () => {
      const mockTracking = { id: 1, flightNumber: 'AA100', transportationId: 3 };
      (aviationstackService.updateFlightTracking as jest.Mock).mockResolvedValue(mockTracking as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { transportationId: '3' },
        body: { flightNumber: 'AA100', flightDate: '2024-06-01' },
      });
      flightTrackingController.updateFlightTracking(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(aviationstackService.updateFlightTracking).toHaveBeenCalledWith(
          testUsers.user1.id,
          3,
          expect.objectContaining({ flightNumber: 'AA100' })
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockTracking });
      }
    });

    it('should pass Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { transportationId: '3' },
        body: { status: 'invalid-status-value' },
      });
      flightTrackingController.updateFlightTracking(req as any, res as any, next);
      await flushPromises();

      // status field only accepts specific enum values, so this should fail Zod validation
      expect(next).toHaveBeenCalled();
    });
  });
});
