import crypto from 'crypto';
import config from '../config';

/**
 * Compute an HMAC-SHA256 signature over the given data using the JWT secret.
 * The data should NOT contain the integrity field itself.
 */
export function computeBackupHmac(data: unknown): string {
  return crypto.createHmac('sha256', config.jwt.secret).update(JSON.stringify(data)).digest('hex');
}

/**
 * Returns the backup with its `integrity` field attached. Every backup written
 * by this application (manual download or scheduled file) must go through this,
 * because restore rejects files without a valid signature.
 */
export function signBackup<T extends object>(data: T) {
  return {
    ...data,
    integrity: {
      algorithm: 'hmac-sha256' as const,
      signature: computeBackupHmac(data),
    },
  };
}

export default { computeBackupHmac, signBackup };
