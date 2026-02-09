/**
 * Email Service Tests
 *
 * Test cases:
 * - EM-001: Check email configuration status
 * - EM-002: Send user invitation email - configured
 * - EM-003: Send user invitation email - not configured
 * - EM-004: Send test email
 * - EM-005: Handle email send failure
 * - EM-006: Email content sanitization (XSS prevention)
 */

// Mock nodemailer BEFORE any imports
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
});

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// We need to control config.email for tests
let mockEmailConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'testuser',
  password: 'testpass',
  from: 'Travel Life <noreply@example.com>',
};

jest.mock('../../config', () => ({
  config: {
    get email() {
      return mockEmailConfig;
    },
    nodeEnv: 'test',
    frontendUrl: 'http://localhost:3000',
  },
}));

import { emailService } from '../email.service';

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to configured state
    mockEmailConfig = {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'testuser',
      password: 'testpass',
      from: 'Travel Life <noreply@example.com>',
    };
  });

  // ============================================================
  // EM-001: Check email configuration status
  // ============================================================
  describe('EM-001: Email configuration check', () => {
    it('should return true when email is fully configured', () => {
      expect(emailService.isConfigured()).toBe(true);
    });

    it('should return false when host is missing', () => {
      mockEmailConfig = { ...mockEmailConfig, host: '' };
      expect(emailService.isConfigured()).toBe(false);
    });

    it('should return false when user is missing', () => {
      mockEmailConfig = { ...mockEmailConfig, user: '' };
      expect(emailService.isConfigured()).toBe(false);
    });

    it('should return false when password is missing', () => {
      mockEmailConfig = { ...mockEmailConfig, password: '' };
      expect(emailService.isConfigured()).toBe(false);
    });
  });

  // ============================================================
  // EM-002: Send user invitation email - configured
  // ============================================================
  describe('EM-002: Send invitation - configured', () => {
    it('should send an invitation email successfully', async () => {
      const result = await emailService.sendUserInvitation({
        recipientEmail: 'newuser@example.com',
        inviterName: 'TestUser',
        inviterEmail: 'test@example.com',
        personalMessage: 'Welcome!',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc123',
        expiresAt: new Date('2025-06-01'),
      });

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newuser@example.com',
          subject: expect.stringContaining('TestUser'),
          text: expect.stringContaining('Travel Life'),
          html: expect.stringContaining('Travel Life'),
        })
      );
    });

    it('should include inviter name in subject', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        inviterName: 'John',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.subject).toContain('John');
    });

    it('should use generic subject when no inviter name', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.subject).toContain('invited');
    });

    it('should include accept URL in email body', async () => {
      const acceptUrl = 'http://localhost:3000/accept-invite?token=abc123';

      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl,
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.text).toContain(acceptUrl);
      expect(sentOptions.html).toContain(acceptUrl);
    });

    it('should include personal message when provided', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        inviterName: 'John',
        personalMessage: 'Join our adventure!',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.text).toContain('Join our adventure!');
      expect(sentOptions.html).toContain('Join our adventure!');
    });

    it('should include expiry date in email body', async () => {
      const expiresAt = new Date('2025-12-25');

      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt,
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.text).toContain('December');
      expect(sentOptions.text).toContain('25');
    });
  });

  // ============================================================
  // EM-003: Send invitation - not configured
  // ============================================================
  describe('EM-003: Send invitation - not configured', () => {
    it('should return false when email is not configured', async () => {
      mockEmailConfig = { ...mockEmailConfig, host: '', user: '', password: '' };

      const result = await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // EM-004: Send test email
  // ============================================================
  describe('EM-004: Send test email', () => {
    it('should send a test email', async () => {
      const result = await emailService.sendTestEmail('admin@example.com');

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
          subject: expect.stringContaining('Test'),
        })
      );
    });

    it('should return false when email not configured', async () => {
      mockEmailConfig = { ...mockEmailConfig, host: '' };

      const result = await emailService.sendTestEmail('admin@example.com');

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // EM-005: Handle email send failure
  // ============================================================
  describe('EM-005: Email send failure', () => {
    it('should return false when sendMail throws an error', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const result = await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      expect(result).toBe(false);
    });

    it('should not throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        emailService.sendUserInvitation({
          recipientEmail: 'user@example.com',
          acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
          expiresAt: new Date(),
        })
      ).resolves.toBe(false);
    });
  });

  // ============================================================
  // EM-006: Email content sanitization
  // ============================================================
  describe('EM-006: Content sanitization', () => {
    it('should sanitize HTML characters in inviter name', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        inviterName: '<script>alert("xss")</script>',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      // HTML content should have escaped characters
      expect(sentOptions.html).not.toContain('<script>');
      expect(sentOptions.html).toContain('&lt;script&gt;');
    });

    it('should sanitize personal message in HTML content', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        inviterName: 'SafeUser',
        personalMessage: '<img src=x onerror=alert(1)>',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.html).not.toContain('<img src=x');
      expect(sentOptions.html).toContain('&lt;img');
    });

    it('should validate URL scheme in accept URL', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        acceptUrl: 'javascript:alert(1)',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      // Should not contain the javascript: URL
      expect(sentOptions.html).not.toContain('javascript:');
      expect(sentOptions.html).toContain('#invalid-url');
    });

    it('should strip CRLF from header fields', async () => {
      await emailService.sendUserInvitation({
        recipientEmail: 'user@example.com',
        inviterName: 'User\r\nBcc: hacker@evil.com',
        acceptUrl: 'http://localhost:3000/accept-invite?token=abc',
        expiresAt: new Date(),
      });

      const sentOptions = mockSendMail.mock.calls[0][0];
      // Subject should not contain CRLF
      expect(sentOptions.subject).not.toContain('\r');
      expect(sentOptions.subject).not.toContain('\n');
    });
  });
});
