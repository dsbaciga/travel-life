/**
 * JournalEntry Controller Tests
 *
 * Tests for all journalEntry controller methods:
 * - createJournalEntry: POST - validates body, calls journalEntryService.createJournalEntry, returns 201
 * - getJournalEntriesByTrip: GET - parses tripId, calls journalEntryService.getJournalEntriesByTrip, returns 200
 * - getJournalEntryById: GET - parses id, calls journalEntryService.getJournalEntryById, returns 200
 * - updateJournalEntry: PATCH - parses id, validates body, calls journalEntryService.updateJournalEntry, returns 200
 * - deleteJournalEntry: DELETE - parses id, calls journalEntryService.deleteJournalEntry, returns 200
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the journalEntry service module
const mockCreateJournalEntry = jest.fn();
const mockGetJournalEntriesByTrip = jest.fn();
const mockGetJournalEntryById = jest.fn();
const mockUpdateJournalEntry = jest.fn();
const mockDeleteJournalEntry = jest.fn();

jest.mock('../../services/journalEntry.service', () => ({
  __esModule: true,
  default: {
    createJournalEntry: (...args: unknown[]) => mockCreateJournalEntry(...args),
    getJournalEntriesByTrip: (...args: unknown[]) => mockGetJournalEntriesByTrip(...args),
    getJournalEntryById: (...args: unknown[]) => mockGetJournalEntryById(...args),
    updateJournalEntry: (...args: unknown[]) => mockUpdateJournalEntry(...args),
    deleteJournalEntry: (...args: unknown[]) => mockDeleteJournalEntry(...args),
  },
}));

import { journalEntryController } from '../journalEntry.controller';
import { createAuthenticatedControllerArgs } from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { Request, Response, NextFunction } from 'express';

describe('JournalEntry Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createJournalEntry', () => {
    it('should create a journal entry and return 201', async () => {
      const mockEntry = {
        id: 1,
        tripId: 10,
        title: 'Day 1',
        content: 'We arrived at the hotel.',
        entryType: 'daily',
      };
      mockCreateJournalEntry.mockResolvedValue(mockEntry);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 10,
          title: 'Day 1',
          content: 'We arrived at the hotel.',
        },
      });

      await journalEntryController.createJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockCreateJournalEntry).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        title: 'Day 1',
        content: 'We arrived at the hotel.',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockEntry,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockCreateJournalEntry.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 10,
          title: 'Day 1',
          content: 'Content here.',
        },
      });

      await journalEntryController.createJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for missing required fields', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 10,
          // missing title and content
        },
      });

      await journalEntryController.createJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockCreateJournalEntry).not.toHaveBeenCalled();
    });

    it('should accept optional entryDate and entryType fields', async () => {
      const mockEntry = {
        id: 2,
        tripId: 10,
        title: 'Day 2',
        content: 'Great day!',
        entryType: 'daily',
        entryDate: '2024-06-15',
      };
      mockCreateJournalEntry.mockResolvedValue(mockEntry);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 10,
          title: 'Day 2',
          content: 'Great day!',
          entryDate: '2024-06-15',
          entryType: 'daily',
        },
      });

      await journalEntryController.createJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockCreateJournalEntry).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        title: 'Day 2',
        content: 'Great day!',
        entryDate: '2024-06-15',
        entryType: 'daily',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('getJournalEntriesByTrip', () => {
    it('should return journal entries for a trip with 200', async () => {
      const mockEntries = [
        { id: 1, tripId: 10, title: 'Day 1', content: 'Entry 1' },
        { id: 2, tripId: 10, title: 'Day 2', content: 'Entry 2' },
      ];
      mockGetJournalEntriesByTrip.mockResolvedValue(mockEntries);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await journalEntryController.getJournalEntriesByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetJournalEntriesByTrip).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockEntries,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockGetJournalEntriesByTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await journalEntryController.getJournalEntriesByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid tripId param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: 'abc' },
      });

      await journalEntryController.getJournalEntriesByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockGetJournalEntriesByTrip).not.toHaveBeenCalled();
    });
  });

  describe('getJournalEntryById', () => {
    it('should return a journal entry by id with 200', async () => {
      const mockEntry = { id: 5, tripId: 10, title: 'Day 1', content: 'Content' };
      mockGetJournalEntryById.mockResolvedValue(mockEntry);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await journalEntryController.getJournalEntryById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetJournalEntryById).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockEntry,
      });
    });

    it('should propagate error for invalid id param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      await journalEntryController.getJournalEntryById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockGetJournalEntryById).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Not found');
      mockGetJournalEntryById.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await journalEntryController.getJournalEntryById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateJournalEntry', () => {
    it('should update a journal entry and return 200', async () => {
      const mockEntry = { id: 5, tripId: 10, title: 'Updated Title', content: 'Updated' };
      mockUpdateJournalEntry.mockResolvedValue(mockEntry);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { title: 'Updated Title', content: 'Updated' },
      });

      await journalEntryController.updateJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateJournalEntry).toHaveBeenCalledWith(testUsers.user1.id, 5, {
        title: 'Updated Title',
        content: 'Updated',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockEntry,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateJournalEntry.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { title: 'Updated' },
      });

      await journalEntryController.updateJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid content', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { content: '' }, // content must be min 1 char
      });

      await journalEntryController.updateJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUpdateJournalEntry).not.toHaveBeenCalled();
    });
  });

  describe('deleteJournalEntry', () => {
    it('should delete a journal entry and return 200', async () => {
      const mockResult = { id: 5, deleted: true };
      mockDeleteJournalEntry.mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await journalEntryController.deleteJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteJournalEntry).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteJournalEntry.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await journalEntryController.deleteJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid id param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      await journalEntryController.deleteJournalEntry(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockDeleteJournalEntry).not.toHaveBeenCalled();
    });
  });
});
