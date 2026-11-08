import cron from 'node-cron';
import tripService from '../services/trip.service';
import pushNotificationService from '../services/pushNotification.service';
import emailIngestService from '../services/emailIngest.service';
import { pdfImportService } from '../services/pdfImport.service';
import scheduledBackupService from '../services/scheduledBackup.service';
import config from './index';
import logger from './logger';

/**
 * Initializes all cron jobs for the application
 */
export function initCronJobs(): void {
  // Run trip status auto-update every day at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily trip status auto-update...');
    try {
      const updatedCount = await tripService.autoUpdateGlobalTripStatuses();
      logger.info(`Successfully auto-updated status for ${updatedCount} trips.`);
    } catch (error) {
      logger.error('Error during trip status auto-update cron job:', error);
    }
  });

  // Hourly "trip starts tomorrow" push notification reminders.
  // No-op when web push (VAPID env vars) is not configured.
  cron.schedule('0 * * * *', async () => {
    try {
      const notified = await pushNotificationService.sendTripStartReminders();
      if (notified > 0) {
        logger.info(`Sent trip-start push reminders for ${notified} trip(s).`);
      }
    } catch (error) {
      logger.error('Error during trip-start push reminder cron job:', error);
    }
  });

  // Hourly booking-deadline reminders (cancellation cutoffs, check-in windows,
  // payment due dates). No-op when web push is not configured.
  cron.schedule('15 * * * *', async () => {
    try {
      const notified = await pushNotificationService.sendDeadlineReminders();
      if (notified > 0) {
        logger.info(`Sent booking-deadline push reminders for ${notified} deadline(s).`);
      }
    } catch (error) {
      logger.error('Error during booking-deadline push reminder cron job:', error);
    }
  });

  // Hourly recovery of jobs stuck mid-processing. index.ts also runs both of
  // these once at boot; scheduling them means a job that hangs while the process
  // stays up (an LLM/IMAP call that never returns, a killed worker) is recovered
  // within the hour instead of waiting for the next restart.
  cron.schedule('30 * * * *', async () => {
    try {
      await pdfImportService.resetStaleParsing();
    } catch (error) {
      logger.error('Error during stale PDF import reset cron job:', error);
    }

    if (emailIngestService.isConfigured()) {
      try {
        await emailIngestService.resetStaleProcessing();
      } catch (error) {
        logger.error('Error during stale email ingest reset cron job:', error);
      }
    }
  });

  // Poll the saved-link ingest mailbox.
  // No-op when IMAP_USER / IMAP_PASSWORD are not configured.
  if (emailIngestService.isConfigured()) {
    cron.schedule(config.imap.pollCron, async () => {
      try {
        const handled = await emailIngestService.pollOnce();
        if (handled > 0) {
          logger.info(`Processed ${handled} message(s) from the link ingest mailbox.`);
        }
      } catch (error) {
        logger.error('Error during email ingest cron job:', error);
      }
    });
    logger.info(`Email link ingest enabled (schedule: ${config.imap.pollCron}).`);
  } else {
    logger.info('Email link ingest disabled (IMAP not configured).');
  }

  // Scheduled backups to BACKUP_DIR (opt-in via BACKUP_SCHEDULE_ENABLED=true).
  if (config.scheduledBackup.enabled) {
    cron.schedule(config.scheduledBackup.cron, async () => {
      try {
        const result = await scheduledBackupService.runScheduledBackups();
        logger.info(
          `Scheduled backup finished: ${result.lastSuccessCount} ok, ${result.lastFailureCount} failed.`
        );
      } catch (error) {
        logger.error('Error during scheduled backup cron job:', error);
      }
    });
    logger.info(`Scheduled backups enabled (schedule: ${config.scheduledBackup.cron}).`);
  }

  // Run once on startup to ensure data is fresh
  logger.info('Performing initial trip status update on startup...');
  tripService.autoUpdateGlobalTripStatuses()
    .then(count => logger.info(`Initial trip status update complete. ${count} trips updated.`))
    .catch(err => logger.error('Initial trip status update failed:', err));

  logger.info('Cron jobs initialized.');
}
