import { describe, it, expect } from 'vitest';
import { isAuthPagePath, isCredentialEndpoint, safeRedirectPath } from '../authRedirect';

describe('safeRedirectPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirectPath('/trips/1?tab=photos')).toBe('/trips/1?tab=photos');
  });

  it('falls back for missing, external and protocol-relative values', () => {
    expect(safeRedirectPath(null)).toBe('/dashboard');
    expect(safeRedirectPath('https://evil.test')).toBe('/dashboard');
    expect(safeRedirectPath('//evil.test')).toBe('/dashboard');
  });

  it('ignores auth pages', () => {
    expect(safeRedirectPath('/login')).toBe('/dashboard');
    expect(safeRedirectPath('/login?redirect=%2Flogin')).toBe('/dashboard');
    expect(safeRedirectPath('/register/')).toBe('/dashboard');
    expect(safeRedirectPath('/accept-invite?token=x')).toBe('/dashboard');
  });
});

describe('isAuthPagePath', () => {
  it('matches only the exact auth pages', () => {
    expect(isAuthPagePath('/login')).toBe(true);
    expect(isAuthPagePath('/loginx')).toBe(false);
    expect(isAuthPagePath('/trips')).toBe(false);
  });
});

describe('isCredentialEndpoint', () => {
  it('flags endpoints whose 401 is a credential error', () => {
    expect(isCredentialEndpoint('/auth/login')).toBe(true);
    expect(isCredentialEndpoint('/auth/register')).toBe(true);
    expect(isCredentialEndpoint('/auth/silent-refresh')).toBe(true);
  });

  it('does not flag ordinary API calls', () => {
    expect(isCredentialEndpoint('/trips')).toBe(false);
    expect(isCredentialEndpoint('/auth/me')).toBe(false);
    expect(isCredentialEndpoint(undefined)).toBe(false);
  });
});
