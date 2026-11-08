/**
 * Field Encryption Tests
 *
 * Test cases:
 * - ENC-001: Round-trip encryptSecret / decryptSecret restores original plaintext
 * - ENC-002: Random IV produces distinct ciphertexts for identical plaintexts
 * - ENC-003: encryptSecret is idempotent on already-encrypted enc:v1: strings
 * - ENC-004: Null, undefined, and empty string handling
 * - ENC-005: Plaintext fallback in decryptSecret for legacy unencrypted rows
 * - ENC-006: Tamper detection on IV, authTag, and ciphertext
 * - ENC-007: Malformed enc:v1: payloads throw an error
 */

import { describe, it, expect } from '@jest/globals';
import { encryptSecret, decryptSecret } from '../encryption';

describe('Field Encryption (encryption.ts)', () => {
  it('ENC-001: round-trips arbitrary API keys and passwords with AES-256-GCM', () => {
    const samples = [
      'sk-proj-1234567890abcdef',
      'immich-api-key-with-special-chars!@#$%^&*()_+-=[]{}|;:,.<>?',
      'smtp-p@ssw0rd-with-unicode-🔒-✈️',
    ];

    for (const secret of samples) {
      const encrypted = encryptSecret(secret);
      expect(encrypted).not.toBeNull();
      expect(encrypted).toMatch(/^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      expect(encrypted).not.toContain(secret);
      expect(decryptSecret(encrypted)).toBe(secret);
    }
  });

  it('ENC-002: generates a fresh random IV on every encryption call', () => {
    const secret = 'repeatable-api-key-value';
    const first = encryptSecret(secret);
    const second = encryptSecret(secret);

    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(secret);
    expect(decryptSecret(second)).toBe(secret);
  });

  it('ENC-003: is idempotent when passed an already-encrypted enc:v1: value', () => {
    const encrypted = encryptSecret('my-secret-key');
    expect(encrypted).not.toBeNull();
    expect(encryptSecret(encrypted)).toBe(encrypted);
    expect(decryptSecret(encryptSecret(encrypted))).toBe('my-secret-key');
  });

  it('ENC-004: handles null, undefined, and empty string inputs cleanly', () => {
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret(undefined)).toBeUndefined();
    expect(encryptSecret('')).toBeNull();

    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(decryptSecret('')).toBeNull();
  });

  it('ENC-005: returns legacy unencrypted values as-is for backward compatibility', () => {
    const legacyKey = 'legacy-plaintext-api-key-12345';
    expect(decryptSecret(legacyKey)).toBe(legacyKey);
  });

  it('ENC-006: detects tampering in ciphertext, auth tag, or IV', () => {
    const encrypted = encryptSecret('sensitive-smtp-password')!;
    const [, , ivHex, tagHex, ciphertextHex] = encrypted.split(':');

    const flipHex = (hex: string): string =>
      (hex[0] === '0' ? '1' : '0') + hex.slice(1);

    const tamperedCiphertext = `enc:v1:${ivHex}:${tagHex}:${flipHex(ciphertextHex)}`;
    expect(() => decryptSecret(tamperedCiphertext)).toThrow();

    const tamperedTag = `enc:v1:${ivHex}:${flipHex(tagHex)}:${ciphertextHex}`;
    expect(() => decryptSecret(tamperedTag)).toThrow();

    const tamperedIv = `enc:v1:${flipHex(ivHex)}:${tagHex}:${ciphertextHex}`;
    expect(() => decryptSecret(tamperedIv)).toThrow();
  });

  it('ENC-007: rejects malformed enc:v1: strings', () => {
    expect(() => decryptSecret('enc:v1:only-one-part')).toThrow('Malformed encrypted secret');
    expect(() => decryptSecret('enc:v1:a:b:c:d')).toThrow('Malformed encrypted secret');
    expect(() => decryptSecret('enc:v1:shortiv:shorttag:deadbeef')).toThrow(
      'Malformed encrypted secret'
    );
    expect(() =>
      decryptSecret(`enc:v1:${'z'.repeat(24)}:${'a'.repeat(32)}:deadbeef`)
    ).toThrow('Malformed encrypted secret');
  });
});
