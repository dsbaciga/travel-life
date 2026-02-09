/**
 * User Controller Tests
 *
 * Tests for all user controller methods:
 * - getMe: GET - gets current user by req.user.userId, returns 200
 * - updateSettings: PATCH - validates body, calls userService.updateUserSettings, returns 200
 * - updateImmichSettings: PATCH - validates body, calls userService.updateImmichSettings, returns 200
 * - getImmichSettings: GET - calls userService.getImmichSettings, returns 200
 * - updateWeatherSettings: PATCH - validates body, calls userService.updateWeatherSettings, returns 200
 * - getWeatherSettings: GET - calls userService.getWeatherSettings, returns 200
 * - updateAviationstackSettings: PATCH - validates body, returns 200
 * - getAviationstackSettings: GET - returns 200
 * - updateOpenrouteserviceSettings: PATCH - validates body, returns 200
 * - getOpenrouteserviceSettings: GET - returns 200
 * - updateUsername: PATCH - validates body, calls userService.updateUsername, returns 200
 * - updatePassword: PATCH - validates body, calls userService.updatePassword, returns 200
 * - searchUsers: GET - validates query, calls userService.searchUsers, returns 200
 * - getTravelPartnerSettings: GET - calls userService.getTravelPartnerSettings, returns 200
 * - renameTripType: PATCH - validates body, calls userService.renameTripType, returns 200
 * - deleteTripType: DELETE - reads param, calls userService.deleteTripType, returns 200
 * - updateTravelPartnerSettings: PATCH - validates body, returns 200
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the user service module
const mockGetUserById = jest.fn();
const mockUpdateUserSettings = jest.fn();
const mockUpdateImmichSettings = jest.fn();
const mockGetImmichSettings = jest.fn();
const mockUpdateWeatherSettings = jest.fn();
const mockGetWeatherSettings = jest.fn();
const mockUpdateAviationstackSettings = jest.fn();
const mockGetAviationstackSettings = jest.fn();
const mockUpdateOpenrouteserviceSettings = jest.fn();
const mockGetOpenrouteserviceSettings = jest.fn();
const mockUpdateUsername = jest.fn();
const mockUpdatePassword = jest.fn();
const mockSearchUsers = jest.fn();
const mockGetTravelPartnerSettings = jest.fn();
const mockRenameTripType = jest.fn();
const mockDeleteTripType = jest.fn();
const mockUpdateTravelPartnerSettings = jest.fn();

jest.mock('../../services/user.service', () => ({
  __esModule: true,
  default: {
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    updateUserSettings: (...args: unknown[]) => mockUpdateUserSettings(...args),
    updateImmichSettings: (...args: unknown[]) => mockUpdateImmichSettings(...args),
    getImmichSettings: (...args: unknown[]) => mockGetImmichSettings(...args),
    updateWeatherSettings: (...args: unknown[]) => mockUpdateWeatherSettings(...args),
    getWeatherSettings: (...args: unknown[]) => mockGetWeatherSettings(...args),
    updateAviationstackSettings: (...args: unknown[]) => mockUpdateAviationstackSettings(...args),
    getAviationstackSettings: (...args: unknown[]) => mockGetAviationstackSettings(...args),
    updateOpenrouteserviceSettings: (...args: unknown[]) => mockUpdateOpenrouteserviceSettings(...args),
    getOpenrouteserviceSettings: (...args: unknown[]) => mockGetOpenrouteserviceSettings(...args),
    updateUsername: (...args: unknown[]) => mockUpdateUsername(...args),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
    searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
    getTravelPartnerSettings: (...args: unknown[]) => mockGetTravelPartnerSettings(...args),
    renameTripType: (...args: unknown[]) => mockRenameTripType(...args),
    deleteTripType: (...args: unknown[]) => mockDeleteTripType(...args),
    updateTravelPartnerSettings: (...args: unknown[]) => mockUpdateTravelPartnerSettings(...args),
  },
}));

import { userController } from '../user.controller';
import { createAuthenticatedControllerArgs } from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { Request, Response, NextFunction } from 'express';

describe('User Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('should return the current user with 200', async () => {
      const mockUser = { id: 1, username: 'testuser1', email: 'test1@example.com' };
      mockGetUserById.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getMe(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetUserById).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUser,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('User not found');
      mockGetUserById.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getMe(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateSettings', () => {
    it('should update user settings and return 200', async () => {
      const mockUser = { id: 1, timezone: 'Europe/London' };
      mockUpdateUserSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { timezone: 'Europe/London' },
      });

      await userController.updateSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateUserSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        timezone: 'Europe/London',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUser,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateUserSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { timezone: 'Europe/London' },
      });

      await userController.updateSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateImmichSettings', () => {
    it('should update immich settings and return success message', async () => {
      const mockUser = { immichApiUrl: 'http://localhost:2283', immichApiKey: 'key123' };
      mockUpdateImmichSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { immichApiUrl: 'http://localhost:2283', immichApiKey: 'key123' },
      });

      await userController.updateImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateImmichSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        immichApiUrl: 'http://localhost:2283',
        immichApiKey: 'key123',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Immich settings updated successfully',
          immichConfigured: true,
        },
      });
    });

    it('should return immichConfigured as false when URL/key are cleared', async () => {
      const mockUser = { immichApiUrl: null, immichApiKey: null };
      mockUpdateImmichSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { immichApiUrl: null, immichApiKey: null },
      });

      await userController.updateImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Immich settings updated successfully',
          immichConfigured: false,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateImmichSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { immichApiUrl: 'http://localhost:2283' },
      });

      await userController.updateImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid URL', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { immichApiUrl: 'not-a-url' },
      });

      await userController.updateImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUpdateImmichSettings).not.toHaveBeenCalled();
    });
  });

  describe('getImmichSettings', () => {
    it('should return immich settings with 200', async () => {
      const mockSettings = { immichApiUrl: 'http://localhost:2283', hasApiKey: true };
      mockGetImmichSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetImmichSettings).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSettings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetImmichSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getImmichSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateWeatherSettings', () => {
    it('should update weather settings and return success message', async () => {
      const mockUser = { weatherApiKey: 'weather-key-123' };
      mockUpdateWeatherSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { weatherApiKey: 'weather-key-123' },
      });

      await userController.updateWeatherSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateWeatherSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        weatherApiKey: 'weather-key-123',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Weather API key updated successfully',
          weatherApiKeySet: true,
        },
      });
    });

    it('should return weatherApiKeySet as false when key is cleared', async () => {
      const mockUser = { weatherApiKey: null };
      mockUpdateWeatherSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { weatherApiKey: null },
      });

      await userController.updateWeatherSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Weather API key updated successfully',
          weatherApiKeySet: false,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateWeatherSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { weatherApiKey: 'key' },
      });

      await userController.updateWeatherSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getWeatherSettings', () => {
    it('should return weather settings with 200', async () => {
      const mockSettings = { hasWeatherApiKey: true };
      mockGetWeatherSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getWeatherSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetWeatherSettings).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSettings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetWeatherSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getWeatherSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateAviationstackSettings', () => {
    it('should update aviationstack settings and return success message', async () => {
      const mockUser = { aviationstackApiKey: 'av-key-123' };
      mockUpdateAviationstackSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { aviationstackApiKey: 'av-key-123' },
      });

      await userController.updateAviationstackSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateAviationstackSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        aviationstackApiKey: 'av-key-123',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Aviationstack API key updated successfully',
          aviationstackApiKeySet: true,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateAviationstackSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { aviationstackApiKey: 'key' },
      });

      await userController.updateAviationstackSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getAviationstackSettings', () => {
    it('should return aviationstack settings with 200', async () => {
      const mockSettings = { hasAviationstackApiKey: true };
      mockGetAviationstackSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getAviationstackSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetAviationstackSettings).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSettings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetAviationstackSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getAviationstackSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateOpenrouteserviceSettings', () => {
    it('should update openrouteservice settings and return success message', async () => {
      const mockUser = { openrouteserviceApiKey: 'ors-key-123' };
      mockUpdateOpenrouteserviceSettings.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { openrouteserviceApiKey: 'ors-key-123' },
      });

      await userController.updateOpenrouteserviceSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateOpenrouteserviceSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        openrouteserviceApiKey: 'ors-key-123',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'OpenRouteService API key updated successfully',
          openrouteserviceApiKeySet: true,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateOpenrouteserviceSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { openrouteserviceApiKey: 'key' },
      });

      await userController.updateOpenrouteserviceSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getOpenrouteserviceSettings', () => {
    it('should return openrouteservice settings with 200', async () => {
      const mockSettings = { hasOpenrouteserviceApiKey: true };
      mockGetOpenrouteserviceSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getOpenrouteserviceSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetOpenrouteserviceSettings).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSettings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetOpenrouteserviceSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getOpenrouteserviceSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateUsername', () => {
    it('should update username and return success message', async () => {
      const mockUser = { username: 'newusername' };
      mockUpdateUsername.mockResolvedValue(mockUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { username: 'newusername' },
      });

      await userController.updateUsername(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateUsername).toHaveBeenCalledWith(testUsers.user1.id, 'newusername');
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Username updated successfully',
          username: 'newusername',
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Username taken');
      mockUpdateUsername.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { username: 'newusername' },
      });

      await userController.updateUsername(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for short username', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { username: 'ab' }, // min 3 chars
      });

      await userController.updateUsername(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('should update password and return success message', async () => {
      mockUpdatePassword.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { currentPassword: 'oldpassword', newPassword: 'newpassword123' },
      });

      await userController.updatePassword(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdatePassword).toHaveBeenCalledWith(
        testUsers.user1.id,
        'oldpassword',
        'newpassword123',
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Password updated successfully',
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Wrong current password');
      mockUpdatePassword.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { currentPassword: 'wrongpass', newPassword: 'newpassword123' },
      });

      await userController.updatePassword(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for short new password', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { currentPassword: 'oldpass', newPassword: 'short' }, // min 8 chars
      });

      await userController.updatePassword(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUpdatePassword).not.toHaveBeenCalled();
    });
  });

  describe('searchUsers', () => {
    it('should search users and return results with 200', async () => {
      const mockUsers = [
        { id: 2, username: 'testuser2', email: 'test2@example.com' },
      ];
      mockSearchUsers.mockResolvedValue(mockUsers);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { query: 'testuser2' },
      });

      await userController.searchUsers(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockSearchUsers).toHaveBeenCalledWith(testUsers.user1.id, 'testuser2');
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUsers,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Search failed');
      mockSearchUsers.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { query: 'testuser' },
      });

      await userController.searchUsers(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for short query', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { query: 'ab' }, // min 3 chars
      });

      await userController.searchUsers(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockSearchUsers).not.toHaveBeenCalled();
    });
  });

  describe('getTravelPartnerSettings', () => {
    it('should return travel partner settings with 200', async () => {
      const mockSettings = { travelPartnerId: 2, defaultPartnerPermission: 'view' };
      mockGetTravelPartnerSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getTravelPartnerSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetTravelPartnerSettings).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSettings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetTravelPartnerSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await userController.getTravelPartnerSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('renameTripType', () => {
    it('should rename a trip type and return updated types', async () => {
      const updatedTypes = [
        { name: 'Vacation Renamed', emoji: '🏖' },
        { name: 'Business', emoji: '💼' },
      ];
      mockRenameTripType.mockResolvedValue(updatedTypes);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { oldName: 'Vacation', newName: 'Vacation Renamed' },
      });

      await userController.renameTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockRenameTripType).toHaveBeenCalledWith(testUsers.user1.id, 'Vacation', 'Vacation Renamed');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Trip type renamed successfully',
        tripTypes: updatedTypes,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Rename failed');
      mockRenameTripType.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { oldName: 'Vacation', newName: 'Holiday' },
      });

      await userController.renameTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for empty names', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { oldName: '', newName: 'Holiday' }, // oldName min 1 char
      });

      await userController.renameTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockRenameTripType).not.toHaveBeenCalled();
    });
  });

  describe('deleteTripType', () => {
    it('should delete a trip type and return updated types', async () => {
      const updatedTypes = [{ name: 'Business', emoji: '💼' }];
      mockDeleteTripType.mockResolvedValue(updatedTypes);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { typeName: 'Vacation' },
      });

      await userController.deleteTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteTripType).toHaveBeenCalledWith(testUsers.user1.id, 'Vacation');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Trip type deleted successfully',
        tripTypes: updatedTypes,
      });
    });

    it('should handle URL-encoded type names', async () => {
      const updatedTypes = [{ name: 'Business', emoji: '💼' }];
      mockDeleteTripType.mockResolvedValue(updatedTypes);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { typeName: 'Road%20Trip' },
      });

      await userController.deleteTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteTripType).toHaveBeenCalledWith(testUsers.user1.id, 'Road Trip');
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteTripType.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { typeName: 'Vacation' },
      });

      await userController.deleteTripType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateTravelPartnerSettings', () => {
    it('should update travel partner settings and return success message', async () => {
      const mockSettings = { travelPartnerId: 2, defaultPartnerPermission: 'edit' };
      mockUpdateTravelPartnerSettings.mockResolvedValue(mockSettings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { travelPartnerId: 2, defaultPartnerPermission: 'edit' },
      });

      await userController.updateTravelPartnerSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateTravelPartnerSettings).toHaveBeenCalledWith(testUsers.user1.id, {
        travelPartnerId: 2,
        defaultPartnerPermission: 'edit',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Travel partner settings updated successfully',
          ...mockSettings,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateTravelPartnerSettings.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { travelPartnerId: 2 },
      });

      await userController.updateTravelPartnerSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid permission', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { defaultPartnerPermission: 'invalid_perm' },
      });

      await userController.updateTravelPartnerSettings(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUpdateTravelPartnerSettings).not.toHaveBeenCalled();
    });
  });
});
