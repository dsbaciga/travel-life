import path from 'path';
import { config } from '../../config';

const UPLOADS_ROOT = path.resolve(config.upload.dir);

/**
 * Resolve a stored `/uploads/...` web path to an absolute path confined to the
 * uploads root. Returns null when the value is not a stored upload path or when
 * it escapes the root once normalised.
 *
 * Stored paths are server-generated, so anything that fails this check is
 * tampered data (e.g. a poisoned backup restore) and must never reach fs.
 * Mirrors the containment pattern in share.service.getPublicPhotoFilePath().
 */
export function resolveUploadPath(storedPath: string): string | null {
  if (!storedPath.startsWith('/uploads/')) return null;
  const absolute = path.resolve(UPLOADS_ROOT, storedPath.slice('/uploads/'.length));
  if (!absolute.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return absolute;
}
