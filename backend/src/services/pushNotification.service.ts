import webpush, { WebPushError } from 'web-push';
import axios from 'axios';
import prisma from '../config/database';
import config from '../config';
import logger from '../config/logger';
import { resolveTimezone } from './_shared/timezoneResolution';
import type { RegisterMobilePushTokenInput } from '../types/mobile.types';

/** Expo's push gateway, which fans out to FCM (Android) and APNs (iOS). */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const EXPO_PUSH_CHUNK = 100;

interface ExpoPushTicket {
  status?: string;
  details?: { error?: string };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Push notification service: Web Push for browsers, Expo push for the native
 * companion app.
 *
 * Web Push requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT
 * (mailto:) environment variables. When unset the web channel is disabled
 * gracefully: isConfigured() returns false and browsers receive nothing.
 *
 * The native channel needs no server configuration — a phone that registered
 * an Expo push token is reachable through Expo's gateway — so sendToUser()
 * delivers to mobile tokens whether or not VAPID is set.
 *
 * VAPID details are applied lazily on first send so that importing this
 * module never throws when the env vars are missing.
 */
class PushNotificationService {
  private vapidInitialized = false;

  /**
   * In-memory dedupe for scheduled trip-start reminders.
   * Limitation: this resets on process restart, so a reminder could be sent
   * again after a restart on the same day. Acceptable for a simple hourly job.
   */
  private sentTripReminders = new Set<string>();

  isConfigured(): boolean {
    return Boolean(
      config.vapid.publicKey && config.vapid.privateKey && config.vapid.subject
    );
  }

  getPublicKey(): string | null {
    return this.isConfigured() ? config.vapid.publicKey : null;
  }

  /**
   * Lazily apply VAPID details to web-push. Returns false when not configured.
   */
  private ensureVapid(): boolean {
    if (!this.isConfigured()) {
      return false;
    }
    if (!this.vapidInitialized) {
      webpush.setVapidDetails(
        config.vapid.subject,
        config.vapid.publicKey,
        config.vapid.privateKey
      );
      this.vapidInitialized = true;
    }
    return true;
  }

  /**
   * Save (or update) a push subscription for a user. Upserts by endpoint so
   * re-subscribing from the same browser never creates duplicates.
   */
  async saveSubscription(
    userId: number,
    subscription: PushSubscriptionInput,
    userAgent?: string
  ): Promise<{ id: number; endpoint: string }> {
    const record = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
    return { id: record.id, endpoint: record.endpoint };
  }

  /**
   * Remove a subscription by endpoint (scoped to the requesting user).
   */
  async removeSubscription(userId: number, endpoint: string): Promise<number> {
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return result.count;
  }

  /**
   * Register (or refresh) a native push token. Upserts by token: reinstalling
   * the app or signing in as someone else on the same phone moves the token to
   * the new user instead of leaving the previous account receiving alerts.
   */
  async saveMobileToken(
    userId: number,
    data: RegisterMobilePushTokenInput
  ): Promise<{ id: number; platform: string }> {
    const record = await prisma.mobilePushToken.upsert({
      where: { token: data.token },
      create: {
        userId,
        token: data.token,
        platform: data.platform,
        deviceName: data.deviceName ?? null,
      },
      update: {
        userId,
        platform: data.platform,
        deviceName: data.deviceName ?? null,
        lastSeenAt: new Date(),
      },
    });
    return { id: record.id, platform: record.platform };
  }

  /**
   * Remove a native push token (scoped to the requesting user), e.g. on logout.
   */
  async removeMobileToken(userId: number, data: { token: string }): Promise<{ removed: number }> {
    const result = await prisma.mobilePushToken.deleteMany({ where: { userId, token: data.token } });
    return { removed: result.count };
  }

  /**
   * Deliver to a user's native tokens through the Expo push gateway.
   * Tokens the gateway reports as `DeviceNotRegistered` (app uninstalled) are
   * pruned. Returns the number of accepted messages.
   */
  private async sendToMobileTokens(
    userId: number,
    payload: PushNotificationPayload
  ): Promise<number> {
    const tokens = await prisma.mobilePushToken.findMany({ where: { userId } });
    if (tokens.length === 0) {
      return 0;
    }

    let sent = 0;
    for (let i = 0; i < tokens.length; i += EXPO_PUSH_CHUNK) {
      const chunk = tokens.slice(i, i + EXPO_PUSH_CHUNK);
      const messages = chunk.map((t) => ({
        to: t.token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        // The app deep-links on `url`; `tag` lets it collapse repeats.
        data: { url: payload.url ?? '/', tag: payload.tag },
      }));

      try {
        const response = await axios.post(EXPO_PUSH_URL, messages, {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 15000,
        });
        const tickets: unknown = response.data?.data;
        const list: ExpoPushTicket[] = Array.isArray(tickets) ? tickets : [];
        for (let j = 0; j < chunk.length; j += 1) {
          const ticket = list[j];
          if (ticket?.status === 'ok') {
            sent += 1;
          } else if (ticket?.details?.error === 'DeviceNotRegistered') {
            await prisma.mobilePushToken
              .delete({ where: { id: chunk[j].id } })
              .catch(() => undefined);
            logger.info(`Pruned unregistered mobile push token ${chunk[j].id} for user ${userId}`);
          }
        }
      } catch (error) {
        logger.warn(`Failed to send mobile push notifications for user ${userId}`, {
          error: error instanceof Error ? error.message : error,
        });
      }
    }
    return sent;
  }

  /**
   * Send a notification to every destination a user has: browser
   * subscriptions (when VAPID is configured) and native app tokens.
   * Subscriptions rejected with 404/410 (expired/unsubscribed) are pruned.
   * Returns the number of successful sends across both channels.
   */
  async sendToUser(
    userId: number,
    payload: PushNotificationPayload
  ): Promise<number> {
    const mobileSent = await this.sendToMobileTokens(userId, payload);

    if (!this.ensureVapid()) {
      return mobileSent;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return mobileSent;
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag,
    });

    let sent = mobileSent;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
      } catch (error) {
        if (
          error instanceof WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          // Subscription expired or was revoked - prune it
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
          logger.info(
            `Pruned expired push subscription ${sub.id} for user ${userId}`
          );
        } else {
          logger.warn(
            `Failed to send push notification to subscription ${sub.id}:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
    return sent;
  }

  /**
   * True when a notification could reach anyone: web push is configured, or at
   * least one native app has registered. Lets the hourly reminder jobs stay
   * no-ops on installs that use neither.
   */
  private async hasAnyDestination(): Promise<boolean> {
    if (this.isConfigured()) return true;
    return (await prisma.mobilePushToken.count()) > 0;
  }

  /**
   * Format "today + dayOffset" as YYYY-MM-DD in the given IANA timezone.
   *
   * Callers pass the trip's zone and then the owner's, so "tomorrow" means
   * tomorrow where the traveller is. Only falls back to UTC when neither is
   * set, or when the zone is invalid.
   */
  private dateStringInTimezone(dayOffset: number, timezone?: string | null): string {
    const date = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
    try {
      // en-CA locale formats as YYYY-MM-DD
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: resolveTimezone(timezone),
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  /**
   * Scheduled job: notify trip owners when a trip starts tomorrow.
   * Uses the trip's timezone when set (server/UTC date otherwise).
   * Deduped in-memory per process (see sentTripReminders limitation above).
   */
  async sendTripStartReminders(): Promise<number> {
    if (!(await this.hasAnyDestination())) {
      return 0;
    }

    // Fetch trips starting within a +/- 2 day window around "tomorrow" (UTC)
    // to cover all timezones, then match exactly per-trip below.
    const now = Date.now();
    const windowStart = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 3 * 24 * 60 * 60 * 1000);

    const trips = await prisma.trip.findMany({
      where: {
        startDate: { gte: windowStart, lte: windowEnd },
        status: { notIn: ['cancelled', 'Cancelled', 'completed', 'Completed'] },
      },
      select: {
        id: true,
        userId: true,
        title: true,
        startDate: true,
        timezone: true,
        // The owner's zone stands in when the trip has none of its own.
        user: { select: { timezone: true } },
      },
    });

    let notified = 0;
    for (const trip of trips) {
      if (!trip.startDate) continue;

      // startDate is a @db.Date stored at UTC midnight
      const startDateStr = trip.startDate.toISOString().slice(0, 10);
      const tomorrowStr = this.dateStringInTimezone(
        1,
        resolveTimezone(trip.timezone, trip.user.timezone)
      );
      if (startDateStr !== tomorrowStr) continue;

      const dedupeKey = `${trip.id}:${startDateStr}`;
      if (this.sentTripReminders.has(dedupeKey)) continue;

      const sent = await this.sendToUser(trip.userId, {
        title: 'Trip starts tomorrow',
        body: `"${trip.title}" starts tomorrow. Safe travels!`,
        url: `/trips/${trip.id}`,
        tag: `trip-start-${trip.id}`,
      });

      // Mark as handled even if the user has no subscriptions, so we do not
      // re-query on every hourly run for the same trip/day.
      this.sentTripReminders.add(dedupeKey);
      if (sent > 0) notified += 1;
    }

    // Prevent unbounded growth across long-running processes
    if (this.sentTripReminders.size > 10000) {
      this.sentTripReminders.clear();
    }

    return notified;
  }

  /**
   * Remind trip owners about booking deadlines (cancellation cutoffs, check-in
   * windows, payment due dates) falling within the next 24 hours. Unlike the
   * trip-start reminders, "already sent" is persisted on the row (notifiedAt)
   * so a restart cannot cause a duplicate, and editing dueAt re-arms it.
   * Returns the number of deadlines notified.
   */
  async sendDeadlineReminders(): Promise<number> {
    // Must stay a hard early-return: the loop below stamps notifiedAt even when
    // nothing was delivered, so running it with no channel at all would silently
    // consume every deadline before anyone could be told about it.
    if (!(await this.hasAnyDestination())) {
      return 0;
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const deadlines = await prisma.bookingDeadline.findMany({
      where: {
        dismissedAt: null,
        notifiedAt: null,
        dueAt: { gt: now, lte: horizon },
        trip: { status: { notIn: ['cancelled', 'Cancelled'] } },
      },
      include: { trip: { select: { id: true, title: true, userId: true } } },
      take: 200,
    });

    const labels: Record<string, string> = {
      cancellation: 'Free cancellation ends',
      check_in: 'Online check-in opens',
      payment: 'Payment due',
      other: 'Booking deadline',
    };

    let notified = 0;
    for (const d of deadlines) {
      const sent = await this.sendToUser(d.trip.userId, {
        title: labels[d.kind] ?? labels.other,
        body: `"${d.trip.title}": ${d.note ?? labels[d.kind] ?? 'deadline'} within 24 hours.`,
        url: `/trips/${d.trip.id}`,
        tag: `deadline-${d.id}`,
      });
      // Mark handled even with no subscriptions, so we don't re-query every hour.
      await prisma.bookingDeadline.update({
        where: { id: d.id },
        data: { notifiedAt: new Date() },
      });
      if (sent > 0) notified += 1;
    }
    return notified;
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
