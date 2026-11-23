import { describe, it, expect, vi } from 'vitest';
import { getApiErrorMessage, NETWORK_ERROR_MESSAGE, OFFLINE_ERROR_MESSAGE } from './errors';

describe('getApiErrorMessage', () => {
  const FALLBACK = "Couldn't finish that. Try again.";

  describe('network failures', () => {
    const networkError = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' };

    it('says the server cannot be reached when the request got no response', () => {
      expect(getApiErrorMessage(networkError, FALLBACK)).toBe(NETWORK_ERROR_MESSAGE);
    });

    it('says the user is offline when the browser reports it', () => {
      const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      expect(getApiErrorMessage(networkError, FALLBACK)).toBe(OFFLINE_ERROR_MESSAGE);
      spy.mockRestore();
    });

    it('keeps the fallback for a cancelled request', () => {
      expect(getApiErrorMessage({ isAxiosError: true, code: 'ERR_CANCELED' }, FALLBACK)).toBe(FALLBACK);
    });

    it('prefers the server message when there is a response', () => {
      const err = { isAxiosError: true, response: { data: { message: 'Nope' } } };
      expect(getApiErrorMessage(err, FALLBACK)).toBe('Nope');
    });
  });

  it('returns the backend message from an axios-shaped error', () => {
    const err = { response: { data: { message: 'Invalid file type' } } };
    expect(getApiErrorMessage(err, FALLBACK)).toBe('Invalid file type');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
    ['a number', 42],
    ['a plain Error (network failure)', new Error('Network Error')],
  ])('falls back for %s', (_label, err) => {
    expect(getApiErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    ['response is null', { response: null }],
    ['data is null', { response: { data: null } }],
    ['data has no message', { response: { data: {} } }],
    ['message is not a string', { response: { data: { message: 123 } } }],
    ['message is an empty string', { response: { data: { message: '' } } }],
  ])('falls back when %s', (_label, err) => {
    expect(getApiErrorMessage(err, FALLBACK)).toBe(FALLBACK);
  });
});
