import crypto from 'crypto';
import { config } from '../config';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

/**
 * Domain-separated 32-byte AES-256 key derived from JWT_SECRET so per-user
 * API keys and SMTP passwords can be encrypted at rest without requiring a
 * separate environment variable.
 */
const getEncryptionKey = (): Buffer =>
  crypto.createHash('sha256').update(`field-encryption-v1:${config.jwt.secret}`).digest();

/**
 * Encrypts a per-user secret (API key or SMTP password) using AES-256-GCM.
 *
 * - Returns `undefined` when passed `undefined` so partial update builders can skip it.
 * - Returns `null` when passed `null` or `''` so cleared fields stay `null`.
 * - Idempotent: values already prefixed with `enc:v1:` are returned unchanged.
 * - Output format: `enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>`.
 *
 * @param plaintext - Secret value to encrypt
 * @returns Encrypted `enc:v1:...` string, `null`, or `undefined`
 */
export function encryptSecret(plaintext: undefined): undefined;
export function encryptSecret(plaintext: null): null;
export function encryptSecret(plaintext: string): string | null;
export function encryptSecret(plaintext: string | null): string | null;
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined;
export function encryptSecret(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === undefined) {
    return undefined;
  }
  if (plaintext === null || plaintext === '') {
    return null;
  }
  if (plaintext.startsWith(ENCRYPTION_PREFIX)) {
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a secret produced by {@link encryptSecret}.
 *
 * - Returns `null` for `null`, `undefined`, or `''`.
 * - Values that do NOT start with `enc:v1:` are returned as-is for transparent
 *   backward compatibility with pre-encryption database rows and test fixtures.
 * - Verifies the GCM authentication tag and throws if the ciphertext or tag
 *   has been tampered with or is malformed.
 *
 * @param stored - Stored database value (encrypted `enc:v1:...` or legacy plaintext)
 * @returns Decrypted plaintext secret or `null`
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') {
    return null;
  }
  if (!stored.startsWith(ENCRYPTION_PREFIX)) {
    return stored;
  }

  const remainder = stored.slice(ENCRYPTION_PREFIX.length);
  const parts = remainder.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (
    !/^[a-f0-9]+$/i.test(ivHex) ||
    !/^[a-f0-9]+$/i.test(authTagHex) ||
    !/^[a-f0-9]*$/i.test(ciphertextHex)
  ) {
    throw new Error('Malformed encrypted secret');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_BYTE_LENGTH || authTag.length !== AUTH_TAG_BYTE_LENGTH) {
    throw new Error('Malformed encrypted secret');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
