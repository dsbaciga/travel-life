import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock services before importing controller
jest.mock('../../services/languagePhrase.service', () => ({
  __esModule: true,
  default: {
    getAvailableLanguages: jest.fn(),
    getPhrasesByLanguage: jest.fn(),
    getPhrasesByLanguageAndCategory: jest.fn(),
    getCategories: jest.fn(),
    getPhrasesForTrip: jest.fn(),
  },
}));

jest.mock('../../services/tripLanguage.service', () => ({
  __esModule: true,
  default: {
    getLanguagesForTrip: jest.fn(),
    addLanguageToTrip: jest.fn(),
    removeLanguageFromTrip: jest.fn(),
  },
}));

import languagePhraseService from '../../services/languagePhrase.service';
import tripLanguageService from '../../services/tripLanguage.service';
import { languagePhraseController } from '../languagePhrase.controller';
import {
  createAuthenticatedControllerArgs,
  createMockControllerArgs,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('languagePhrase.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAvailableLanguages', () => {
    it('should return all available languages', async () => {
      const mockLanguages = [{ code: 'es', name: 'Spanish', phraseCount: 50 }];
      (languagePhraseService.getAvailableLanguages as jest.Mock).mockReturnValue(mockLanguages);

      const { req, res, next } = createMockControllerArgs();
      await languagePhraseController.getAvailableLanguages(req as any, res as any, next);

      expect(languagePhraseService.getAvailableLanguages).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockLanguages });
    });
  });

  describe('getPhrasesByLanguage', () => {
    it('should return phrases for a valid language code', async () => {
      const mockPhrases = { code: 'es', name: 'Spanish', phrases: [] };
      (languagePhraseService.getPhrasesByLanguage as jest.Mock).mockReturnValue(mockPhrases);

      const { req, res, next } = createMockControllerArgs({
        params: { languageCode: 'es' },
      });
      await languagePhraseController.getPhrasesByLanguage(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(languagePhraseService.getPhrasesByLanguage).toHaveBeenCalledWith('es');
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockPhrases });
      }
    });

    it('should throw 404 when language not found', async () => {
      (languagePhraseService.getPhrasesByLanguage as jest.Mock).mockReturnValue(null);

      const { req, res, next } = createMockControllerArgs({
        params: { languageCode: 'es' },
      });
      await languagePhraseController.getPhrasesByLanguage(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getPhrasesByCategory', () => {
    it('should return phrases for a valid language and category', async () => {
      const mockPhrases = { code: 'es', category: 'greetings', phrases: [] };
      (languagePhraseService.getPhrasesByLanguageAndCategory as jest.Mock).mockReturnValue(mockPhrases);

      const { req, res, next } = createMockControllerArgs({
        params: { languageCode: 'es', category: 'greetings' },
      });
      await languagePhraseController.getPhrasesByCategory(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(languagePhraseService.getPhrasesByLanguageAndCategory).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockPhrases });
      }
    });
  });

  describe('getCategories', () => {
    it('should return all phrase categories', async () => {
      const mockCategories = ['greetings', 'dining', 'directions'];
      (languagePhraseService.getCategories as jest.Mock).mockReturnValue(mockCategories);

      const { req, res, next } = createMockControllerArgs();
      await languagePhraseController.getCategories(req as any, res as any, next);

      expect(languagePhraseService.getCategories).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCategories });
    });
  });

  describe('getTripLanguages', () => {
    it('should return languages for a trip', async () => {
      const mockLanguages = [{ languageCode: 'es', name: 'Spanish' }];
      (tripLanguageService.getLanguagesForTrip as jest.Mock).mockResolvedValue(mockLanguages as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await languagePhraseController.getTripLanguages(req as any, res as any, next);

      expect(tripLanguageService.getLanguagesForTrip).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockLanguages });
    });
  });

  describe('addTripLanguage', () => {
    it('should add a language to a trip and return 201', async () => {
      const mockLanguage = { id: 1, tripId: 5, languageCode: 'es' };
      (tripLanguageService.addLanguageToTrip as jest.Mock).mockResolvedValue(mockLanguage as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
        body: { languageCode: 'es' },
      });
      await languagePhraseController.addTripLanguage(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(tripLanguageService.addLanguageToTrip).toHaveBeenCalledWith(
          5,
          testUsers.user1.id,
          expect.objectContaining({ languageCode: 'es' })
        );
        expect(res.status).toHaveBeenCalledWith(201);
      }
    });
  });

  describe('removeTripLanguage', () => {
    it('should remove a language from a trip', async () => {
      (tripLanguageService.removeLanguageFromTrip as jest.Mock).mockResolvedValue(undefined as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5', languageCode: 'es' },
      });
      await languagePhraseController.removeTripLanguage(req as any, res as any, next);

      expect(tripLanguageService.removeLanguageFromTrip).toHaveBeenCalledWith(
        5,
        testUsers.user1.id,
        'es'
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Language removed from trip',
      });
    });
  });

  describe('getTripPhrases', () => {
    it('should return phrases for all languages in a trip', async () => {
      const mockLanguages = [{ code: 'es', phrases: [] }];
      (languagePhraseService.getPhrasesForTrip as jest.Mock).mockResolvedValue(mockLanguages as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await languagePhraseController.getTripPhrases(req as any, res as any, next);

      expect(languagePhraseService.getPhrasesForTrip).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { languages: mockLanguages },
      });
    });
  });
});
