import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { EmailIngestStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import config from '../config';
import logger from '../config/logger';
import { extractLinksFromEmail } from './emailLinkExtractor.service';
import savedLinkService from './savedLink.service';
import { findUserIdBySender } from './_shared/userSettings';

/**
 * Polls a dedicated IMAP mailbox and turns forwarded messages into SavedLinks.
 *
 * Deterministic by design: extract hrefs, scrape Open Graph tags. No LLM is
 * involved anywhere. The email-import feature removed in v5.4.0 failed because
 * it asked an LLM to parse booking emails into structured entities; this does
 * not attempt that.
 *
 * Ordering is chosen so a crash is recoverable — see processMessage().
 */

/** Rows stuck in PROCESSING longer than this are reset on startup. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

/** Upper bound on messages handled in a single poll, so one run can't run away. */
const MAX_MESSAGES_PER_POLL = 50;

/**
 * Guards against a slow poll overlapping the next cron tick. Module-level
 * because there is exactly one mailbox and one process polling it.
 */
let isPolling = false;

interface ResolvedSender {
  userId: number;
}

function firstAddress(parsed: ParsedMail, field: 'from' | 'to'): string | null {
  const source = parsed[field];
  if (!source) return null;
  const list = Array.isArray(source) ? source[0] : source;
  const address = list?.value?.[0]?.address;
  return address ? address.toLowerCase().trim() : null;
}

/**
 * Builds a stable identity for a message that lacks a Message-ID header.
 * Rare, but without it such a message would be reprocessed on every poll.
 */
function fallbackMessageId(parsed: ParsedMail, uid: number): string {
  const from = firstAddress(parsed, 'from') ?? 'unknown';
  const date = parsed.date?.toISOString() ?? 'nodate';
  const subject = (parsed.subject ?? '').slice(0, 200);
  return `generated:${uid}:${from}:${date}:${subject}`;
}

class EmailIngestService {
  /**
   * Whether ingest is wired up. Everything no-ops when false, mirroring how
   * pushNotification.service treats missing VAPID keys.
   */
  isConfigured(): boolean {
    return Boolean(config.imap.user && config.imap.password && config.imap.host);
  }

  /**
   * Finds the user a message belongs to: the From address must match a user's
   * own email, or one of the extra addresses they've marked trusted.
   *
   * `From` is spoofable. That is accepted — the mailbox address is the real
   * secret, and this is a private instance. Anything unmatched is rejected.
   */
  private async resolveSender(fromAddress: string | null): Promise<ResolvedSender | null> {
    if (!fromAddress) return null;

    const byEmail = await prisma.user.findFirst({
      where: { email: { equals: fromAddress, mode: 'insensitive' } },
      select: { id: true },
    });
    if (byEmail) return { userId: byEmail.id };

    // linkIngestSenders is a JSON array; matching happens in application code so it stays
    // case-insensitive (see findUserIdBySender).
    const trustedUserId = await findUserIdBySender(fromAddress);
    if (trustedUserId !== null) return { userId: trustedUserId };

    return null;
  }

  /**
   * Handles one message. The caller archives it afterwards regardless of
   * outcome, so nothing is left to be reprocessed forever.
   *
   * Returns true when the message should be archived (always, in practice —
   * the return exists so a future caller can hold a message back).
   */
  private async processMessage(parsed: ParsedMail, uid: number): Promise<boolean> {
    const messageId = parsed.messageId?.trim() || fallbackMessageId(parsed, uid);
    const fromAddress = firstAddress(parsed, 'from');
    const toAddress = firstAddress(parsed, 'to');

    // Step 1 — already seen? Archive without reprocessing. This is what makes a
    // crash between "links created" and "archived" idempotent: the message is
    // still in INBOX next poll, is recognised as done, and is simply filed away.
    const existing = await prisma.emailIngest.findUnique({
      where: { messageId },
      select: { id: true },
    });
    if (existing) {
      logger.info('[EmailIngest] Message already processed, archiving', { messageId });
      return true;
    }

    // Step 2 — claim it. The unique messageId is the claim; a duplicate insert
    // means another poll beat us to it, so treat it as already handled.
    let ingest;
    try {
      ingest = await prisma.emailIngest.create({
        data: {
          messageId,
          fromAddress,
          toAddress,
          subject: parsed.subject?.slice(0, 1000) ?? null,
          receivedAt: parsed.date ?? null,
          status: EmailIngestStatus.PROCESSING,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        logger.info('[EmailIngest] Lost claim race, archiving', { messageId });
        return true;
      }
      throw err;
    }

    try {
      // Step 3 — is this someone we accept mail from?
      const sender = await this.resolveSender(fromAddress);
      if (!sender) {
        logger.warn('[EmailIngest] Rejected message from unrecognised sender', {
          messageId,
          fromAddress,
        });
        await prisma.emailIngest.update({
          where: { id: ingest.id },
          data: {
            status: EmailIngestStatus.REJECTED_SENDER,
            processedAt: new Date(),
          },
        });
        return true;
      }

      // Step 4 — pull candidate URLs out of the body.
      const urls = extractLinksFromEmail({
        html: parsed.html || null,
        text: parsed.text || null,
        maxLinks: config.imap.maxLinksPerMessage,
      });

      if (urls.length === 0) {
        await prisma.emailIngest.update({
          where: { id: ingest.id },
          data: {
            status: EmailIngestStatus.NO_LINKS,
            userId: sender.userId,
            processedAt: new Date(),
          },
        });
        return true;
      }

      // Step 5 — create the links. createFromEmail returns null (rather than
      // throwing) for URLs that fail SSRF validation, so one bad URL cannot
      // abort the rest of the message.
      let created = 0;
      for (const url of urls) {
        const link = await savedLinkService.createFromEmail(
          sender.userId,
          url,
          ingest.id
        );
        if (link) created++;
      }

      // Step 6 — record the outcome. The caller archives next.
      await prisma.emailIngest.update({
        where: { id: ingest.id },
        data: {
          status:
            created > 0 ? EmailIngestStatus.PROCESSED : EmailIngestStatus.NO_LINKS,
          userId: sender.userId,
          linkCount: created,
          processedAt: new Date(),
        },
      });

      logger.info('[EmailIngest] Processed message', {
        messageId,
        userId: sender.userId,
        linkCount: created,
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[EmailIngest] Failed to process message', { messageId, error: message });
      await prisma.emailIngest
        .update({
          where: { id: ingest.id },
          data: {
            status: EmailIngestStatus.FAILED,
            errorMessage: message,
            processedAt: new Date(),
          },
        })
        .catch(() => {
          /* best effort */
        });
      // Archive anyway: leaving it in INBOX would retry forever, and the row
      // records the failure for inspection.
      return true;
    }
  }

  /**
   * Connects, drains INBOX, archives what it handled, disconnects.
   *
   * Archiving is what marks a message done, which makes INBOX the work queue —
   * anything sitting there is by definition unprocessed.
   */
  async pollOnce(): Promise<number> {
    if (!this.isConfigured()) return 0;

    if (isPolling) {
      logger.info('[EmailIngest] Poll already in progress, skipping this tick');
      return 0;
    }
    isPolling = true;

    const client = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: true,
      auth: { user: config.imap.user, pass: config.imap.password },
      // imapflow logs every IMAP command at info level by default.
      logger: false,
    });

    let handled = 0;

    try {
      await client.connect();

      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids: number[] = [];
        for await (const message of client.fetch('1:*', { uid: true })) {
          uids.push(message.uid);
          if (uids.length >= MAX_MESSAGES_PER_POLL) break;
        }

        for (const uid of uids) {
          // Fetch the raw source per-message so a huge attachment doesn't force
          // the whole batch into memory at once.
          const item = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!item || !item.source) continue;

          const parsed = await simpleParser(item.source);
          const shouldArchive = await this.processMessage(parsed, uid);

          if (shouldArchive) {
            // Explicit move, NOT \Deleted + expunge: Gmail's handling of
            // \Deleted depends on a per-account Auto-Expunge preference, so the
            // same code can archive on one account and TRASH on another.
            await client.messageMove(String(uid), config.imap.archiveFolder, {
              uid: true,
            });
            handled++;
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      logger.error('[EmailIngest] Poll failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      isPolling = false;
      try {
        await client.logout();
      } catch {
        /* connection may already be gone */
      }
    }

    return handled;
  }

  /**
   * Reset rows stuck in PROCESSING from a previous crash.
   * Must be awaited before the server starts listening.
   *
   * Modelled on pdfImportService.resetStaleParsing().
   */
  async resetStaleProcessing(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);

    const stale = await prisma.emailIngest.findMany({
      where: {
        status: EmailIngestStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, messageId: true },
    });

    for (const record of stale) {
      logger.warn('[EmailIngest] Resetting stale ingest stuck in PROCESSING', {
        emailIngestId: record.id,
        messageId: record.messageId,
      });
    }

    if (stale.length > 0) {
      await prisma.emailIngest.updateMany({
        where: {
          id: { in: stale.map((r) => r.id) },
          status: EmailIngestStatus.PROCESSING,
        },
        data: {
          status: EmailIngestStatus.FAILED,
          errorMessage: 'Processing timed out and was reset on server restart',
        },
      });
    }
  }
}

export const emailIngestService = new EmailIngestService();
export default emailIngestService;
