import { describe, it, expect } from '@jest/globals';
import { updateUserSettingsSchema } from '../userSettings.types';

describe('updateUserSettingsSchema measurementSystem', () => {
  it('accepts imperial, metric and null (clears the choice)', () => {
    expect(updateUserSettingsSchema.safeParse({ measurementSystem: 'imperial' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ measurementSystem: 'metric' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ measurementSystem: null }).success).toBe(true);
  });

  it('is optional', () => {
    expect(updateUserSettingsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(updateUserSettingsSchema.safeParse({ measurementSystem: 'miles' }).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ measurementSystem: '' }).success).toBe(false);
  });
});
