import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../config/logger';

// Email template colors - aligned with application design system (Compass Gold palette)
const EMAIL_COLORS = {
  primary: '#B8860B',      // Compass Gold - primary brand color
  primaryDark: '#8B6914',  // Darker gold for hover states
  background: '#FDF8E8',   // Light cream background
  text: '#1F2937',         // Dark text
  textMuted: '#6B7280',    // Muted text
  border: '#E5E7EB',       // Light border
  white: '#FFFFFF',
  // Additional semantic colors for email
  headerBg: '#1a365d',     // Navy header background
  headerBgEnd: '#2d4a7c',  // Navy gradient end
  headerText: '#e8dfd5',   // Cream header text
  accent: '#d4a574',       // Warm accent (used in header title)
  accentEnd: '#c4956a',    // Accent gradient end
  bodyText: '#4a5568',     // Body text color
  mutedText: '#718096',    // Muted/secondary text
  lightMutedText: '#a0aec0', // Light muted text
  cardBg: '#f8f5f0',       // Card/section background
  cardBorder: '#e8dfd5',   // Card border color
  pageBg: '#f7f7f7',       // Page background
} as const;

/**
 * Escape HTML special characters to prevent XSS in email templates
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Sanitize text for use in email subject/headers (remove CRLF characters)
 */
function sanitizeHeaderText(text: string): string {
  return text.replace(/[\r\n]/g, ' ').trim();
}

/**
 * Validate URL scheme to prevent URL injection attacks
 * Only allows http: and https: schemes
 */
function validateUrlScheme(url: string): string {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      logger.error('Invalid URL scheme in email template', { url, protocol: parsed.protocol });
      return '#invalid-url';
    }
    return url;
  } catch {
    logger.error('Invalid URL in email template', { url });
    return '#invalid-url';
  }
}

// Email templates
interface UserInvitationEmailData {
  recipientEmail: string;
  inviterName?: string;
  inviterEmail?: string;
  personalMessage?: string;
  acceptUrl: string;
  expiresAt: Date;
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/**
 * Check if email is configured
 */
function isEmailConfigured(): boolean {
  return !!(config.email.host && config.email.user && config.email.password);
}

/**
 * Validate SMTP configuration on startup and log warnings
 */
function validateEmailConfiguration(): void {
  const { host, user, password, from } = config.email;

  // Check if email is completely unconfigured (this is fine)
  if (!host && !user && !password) {
    logger.info('Email not configured - invitation emails will not be sent');
    return;
  }

  // Check for partial configuration (this is a problem)
  const missingFields: string[] = [];
  if (!host) missingFields.push('SMTP_HOST');
  if (!user) missingFields.push('SMTP_USER');
  if (!password) missingFields.push('SMTP_PASSWORD');

  if (missingFields.length > 0) {
    logger.warn('Email partially configured - missing: ' + missingFields.join(', ') + '. Emails will not be sent.');
    return;
  }

  // Validate email format in SMTP_FROM
  const emailRegex = /<([^>]+)>|^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (from && !emailRegex.test(from)) {
    logger.warn('SMTP_FROM may have invalid format: ' + from);
  }

  logger.info('Email configured with host: ' + host);
}

/**
 * Create nodemailer transporter, optionally using a per-user SMTP override
 */
function createTransporter(smtpOverride?: SmtpConfig) {
  if (smtpOverride) {
    return nodemailer.createTransport({
      host: smtpOverride.host,
      port: smtpOverride.port,
      secure: smtpOverride.secure,
      auth: {
        user: smtpOverride.user,
        pass: smtpOverride.password,
      },
    });
  }

  if (!isEmailConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.password,
    },
  });
}

/**
 * Send an email, optionally using a per-user SMTP override
 */
async function sendEmail(options: EmailOptions, smtpOverride?: SmtpConfig): Promise<boolean> {
  const transporter = createTransporter(smtpOverride);

  if (!transporter) {
    logger.warn('Email not configured. Would have sent email to:', options.to);
    logger.warn('Subject:', options.subject);
    // In development, log the email content for debugging
    if (config.nodeEnv === 'development') {
      logger.info('Email text content:', options.text);
    }
    return false;
  }

  const fromAddress = smtpOverride?.from || config.email.from;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Format a date for display in emails
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate user invitation email content
 */
function generateUserInvitationEmail(data: UserInvitationEmailData): { subject: string; text: string; html: string } {
  // Sanitize inputs for header injection and XSS prevention
  const safeInviterName = data.inviterName ? sanitizeHeaderText(data.inviterName) : undefined;
  const safeInviterEmail = data.inviterEmail ? sanitizeHeaderText(data.inviterEmail) : undefined;
  const safePersonalMessage = data.personalMessage ? data.personalMessage.trim() : undefined;
  // Validate URL scheme to prevent URL injection attacks (e.g., javascript: URLs)
  const safeAcceptUrl = validateUrlScheme(data.acceptUrl);

  const inviterInfo = safeInviterName
    ? `${safeInviterName}${safeInviterEmail ? ` (${safeInviterEmail})` : ''}`
    : 'Someone';

  // HTML-escaped versions for HTML template
  const inviterInfoHtml = safeInviterName
    ? `${escapeHtml(safeInviterName)}${safeInviterEmail ? ` (${escapeHtml(safeInviterEmail)})` : ''}`
    : 'Someone';

  const subject = safeInviterName
    ? `${safeInviterName} invited you to join Travel Life`
    : 'You\'ve been invited to join Travel Life';

  const personalMessageSection = safePersonalMessage
    ? `\n\nPersonal message from ${safeInviterName || 'the inviter'}:\n"${safePersonalMessage}"`
    : '';

  const personalMessageHtml = safePersonalMessage
    ? `
      <div style="background-color: ${EMAIL_COLORS.cardBg}; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${EMAIL_COLORS.accent};">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: ${EMAIL_COLORS.headerBg};">Personal message from ${escapeHtml(safeInviterName || 'the inviter')}:</p>
        <p style="margin: 0; font-style: italic; color: ${EMAIL_COLORS.bodyText};">"${escapeHtml(safePersonalMessage)}"</p>
      </div>
    `
    : '';

  const text = `
${inviterInfo} has invited you to join Travel Life!

Travel Life is a personal travel documentation application that helps you plan, track, and remember your adventures. Keep track of your trips, locations, photos, transportation, lodging, and more.
${personalMessageSection}

To accept this invitation and create your account, visit the following link:
${safeAcceptUrl}

This invitation expires on ${formatDate(data.expiresAt)}.

If you didn't expect this invitation, you can safely ignore this email.

---
Travel Life - Document Your Journey
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Travel Life</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${EMAIL_COLORS.pageBg};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: ${EMAIL_COLORS.white}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${EMAIL_COLORS.headerBg} 0%, ${EMAIL_COLORS.headerBgEnd} 100%); padding: 40px 32px; text-align: center;">
              <h1 style="margin: 0; color: ${EMAIL_COLORS.accent}; font-size: 28px; font-weight: 700;">Travel Life</h1>
              <p style="margin: 8px 0 0 0; color: ${EMAIL_COLORS.headerText}; font-size: 14px;">Document Your Journey</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="margin: 0 0 20px 0; color: ${EMAIL_COLORS.headerBg}; font-size: 24px; font-weight: 600;">You're Invited!</h2>

              <p style="margin: 0 0 16px 0; color: ${EMAIL_COLORS.bodyText}; font-size: 16px; line-height: 1.6;">
                <strong style="color: ${EMAIL_COLORS.headerBg};">${inviterInfoHtml}</strong> has invited you to join Travel Life!
              </p>

              <p style="margin: 0 0 24px 0; color: ${EMAIL_COLORS.bodyText}; font-size: 16px; line-height: 1.6;">
                Travel Life is a personal travel documentation application that helps you plan, track, and remember your adventures. Keep track of your trips, locations, photos, transportation, lodging, and more.
              </p>

              ${personalMessageHtml}

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 32px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${safeAcceptUrl}" style="display: inline-block; background: linear-gradient(135deg, ${EMAIL_COLORS.accent} 0%, ${EMAIL_COLORS.accentEnd} 100%); color: ${EMAIL_COLORS.headerBg}; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(212, 165, 116, 0.3);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; color: ${EMAIL_COLORS.mutedText}; font-size: 14px; text-align: center;">
                This invitation expires on <strong>${formatDate(data.expiresAt)}</strong>
              </p>

              <!-- Link fallback -->
              <div style="margin: 24px 0 0 0; padding: 16px; background-color: ${EMAIL_COLORS.cardBg}; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; color: ${EMAIL_COLORS.mutedText}; font-size: 12px;">If the button doesn't work, copy and paste this link:</p>
                <p style="margin: 0; word-break: break-all; font-size: 12px;">
                  <a href="${safeAcceptUrl}" style="color: ${EMAIL_COLORS.accent};">${safeAcceptUrl}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${EMAIL_COLORS.cardBg}; padding: 24px 32px; text-align: center; border-top: 1px solid ${EMAIL_COLORS.cardBorder};">
              <p style="margin: 0; color: ${EMAIL_COLORS.mutedText}; font-size: 12px;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 12px 0 0 0; color: ${EMAIL_COLORS.lightMutedText}; font-size: 11px;">
                Travel Life - Document Your Journey
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

// Validate email configuration on module load
validateEmailConfiguration();

export const emailService = {
  /**
   * Check if email is configured
   */
  isConfigured: isEmailConfigured,

  /**
   * Send a user invitation email
   */
  async sendUserInvitation(data: UserInvitationEmailData, smtpOverride?: SmtpConfig): Promise<boolean> {
    const { subject, text, html } = generateUserInvitationEmail(data);

    return sendEmail({
      to: data.recipientEmail,
      subject,
      text,
      html,
    }, smtpOverride);
  },

  /**
   * Test email configuration by sending a test email
   */
  async sendTestEmail(to: string, smtpOverride?: SmtpConfig): Promise<boolean> {
    return sendEmail({
      to,
      subject: 'Travel Life - Email Configuration Test',
      text: 'If you received this email, your Travel Life email configuration is working correctly.',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: ${EMAIL_COLORS.headerBg};">Email Configuration Test</h2>
          <p>If you received this email, your Travel Life email configuration is working correctly.</p>
        </div>
      `,
    }, smtpOverride);
  },
};
