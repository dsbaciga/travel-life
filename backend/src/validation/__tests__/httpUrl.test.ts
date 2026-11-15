import { describe, it, expect } from '@jest/globals';
import { httpUrl, optionalUrl, optionalUrlOrEmpty } from '../zodHelpers';
import { createActivitySchema } from '../../types/activity.types';
import { createSavedLinkSchema } from '../../types/savedLink.types';
import { backupLinkUrl } from '../../types/backup.types';

/**
 * URL fields are rendered as link targets (web, mobile, shared trips), so only
 * plain web links may be stored. `z.string().url()` alone accepts any scheme.
 */
describe('httpUrl', () => {
  it.each(['https://example.com/booking?id=1', 'http://example.com', 'HTTPS://EXAMPLE.COM/x'])(
    'accepts %s',
    (value) => {
      expect(httpUrl().safeParse(value).success).toBe(true);
    }
  );

  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'intent://scan/#Intent;scheme=zxing;end',
    'not a url',
  ])('rejects %s', (value) => {
    expect(httpUrl().safeParse(value).success).toBe(false);
  });

  it('keeps the optional helpers nullable, clearable and length-limited', () => {
    expect(optionalUrl().safeParse(null).success).toBe(true);
    expect(optionalUrl().safeParse(undefined).success).toBe(true);
    expect(optionalUrlOrEmpty().safeParse('').success).toBe(true);
    expect(optionalUrl(30).safeParse(`https://example.com/${'a'.repeat(40)}`).success).toBe(false);
    expect(optionalUrl().safeParse('javascript:alert(1)').success).toBe(false);
    expect(optionalUrlOrEmpty().safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('is what the entity schemas use for their link fields', () => {
    const activity = { tripId: 1, name: 'Museum', bookingUrl: 'javascript:alert(1)' };
    expect(createActivitySchema.safeParse(activity).success).toBe(false);
    expect(
      createActivitySchema.safeParse({ ...activity, bookingUrl: 'https://example.com' }).success
    ).toBe(true);

    expect(createSavedLinkSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(createSavedLinkSchema.safeParse({ url: ' https://example.com/a ' }).success).toBe(true);
  });

  it('drops non-web links when a backup is restored instead of writing them', () => {
    // Restore bypasses the request schemas, so the backup schema filters too.
    expect(backupLinkUrl.parse('https://example.com/b')).toBe('https://example.com/b');
    expect(backupLinkUrl.parse('javascript:alert(1)')).toBeNull();
    expect(backupLinkUrl.parse('data:text/html,x')).toBeNull();
    expect(backupLinkUrl.parse(null)).toBeNull();
    expect(backupLinkUrl.parse(undefined)).toBeUndefined();
  });
});
