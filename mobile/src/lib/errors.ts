import { ApiError } from '@/sync/engine';

/**
 * A message that is safe to show. An `ApiError` already carries either the server's own
 * wording or our offline text; anything else (a thrown string, a bug) is not written for
 * a person, so it is replaced with `fallback`.
 */
export function friendlyMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
