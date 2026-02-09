import { useState, useEffect, useCallback } from 'react';
import userService from '../services/user.service';
import type { SmtpSettingsResponse } from '../services/user.service';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

type SmtpProvider = 'gmail' | 'outlook' | 'sendgrid' | 'mailgun' | 'other';

interface ProviderPreset {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  userLabel: string;
  userPlaceholder: string;
  passwordLabel: string;
  fixedUser?: string; // If set, user field is hidden and this value is used
  instructions: string[];
}

const PROVIDER_PRESETS: Record<SmtpProvider, ProviderPreset> = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    userLabel: 'Gmail Address',
    userPlaceholder: 'you@gmail.com',
    passwordLabel: 'App Password',
    instructions: [
      'Go to your Google Account > Security',
      'Enable 2-Step Verification if not already enabled',
      'Go to App Passwords (search "App Passwords" in account settings)',
      'Create an app password for "Mail"',
      'Use the generated 16-character password below',
    ],
  },
  outlook: {
    label: 'Outlook / Office 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    userLabel: 'Email Address',
    userPlaceholder: 'you@outlook.com',
    passwordLabel: 'Password',
    instructions: [
      'Use your Outlook / Office 365 email and password',
      'If you have 2FA enabled, you may need an app password',
      'Go to Security > App Passwords in your Microsoft account',
    ],
  },
  sendgrid: {
    label: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    userLabel: 'Username',
    userPlaceholder: '',
    passwordLabel: 'API Key',
    fixedUser: 'apikey',
    instructions: [
      'Log into your SendGrid account',
      'Go to Settings > API Keys',
      'Create an API key with "Mail Send" permission',
      'Paste the API key as the password below',
    ],
  },
  mailgun: {
    label: 'Mailgun',
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    userLabel: 'SMTP Username',
    userPlaceholder: 'postmaster@your-domain.mailgun.org',
    passwordLabel: 'SMTP Password',
    instructions: [
      'Log into your Mailgun dashboard',
      'Go to Sending > Domains and select your domain',
      'Find the SMTP credentials section',
      'Use the SMTP login and password shown there',
    ],
  },
  other: {
    label: 'Other',
    host: '',
    port: 587,
    secure: false,
    userLabel: 'Username',
    userPlaceholder: 'SMTP username or email',
    passwordLabel: 'Password',
    instructions: [
      'Enter your SMTP server details from your email provider',
      'Common ports: 587 (STARTTLS), 465 (SSL/TLS), 25 (unencrypted)',
      'Set "Use SSL/TLS" to on for port 465, off for port 587',
    ],
  },
};

function mapProviderFromString(provider: string | null): SmtpProvider {
  if (provider && provider in PROVIDER_PRESETS) return provider as SmtpProvider;
  return 'other';
}

export default function SmtpSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [settings, setSettings] = useState<SmtpSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [provider, setProvider] = useState<SmtpProvider>('gmail');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState('');

  const preset = PROVIDER_PRESETS[provider];
  const isOther = provider === 'other';

  const loadSettings = useCallback(async () => {
    try {
      const data = await userService.getSmtpSettings();
      setSettings(data);
      // Populate form with saved values
      const savedProvider = mapProviderFromString(data.smtpProvider);
      setProvider(savedProvider);
      if (savedProvider === 'other') {
        setHost(data.smtpHost || '');
        setPort(data.smtpPort ?? 587);
        setSecure(data.smtpSecure ?? false);
      }
      setUser(data.smtpUser || '');
      setFrom(data.smtpFrom || '');
      // Don't set password from server for security
    } catch (error) {
      console.error('Failed to load SMTP settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleProviderChange = (newProvider: SmtpProvider) => {
    setProvider(newProvider);
    const newPreset = PROVIDER_PRESETS[newProvider];
    if (newProvider !== 'other') {
      setHost(newPreset.host);
      setPort(newPreset.port);
      setSecure(newPreset.secure);
      if (newPreset.fixedUser) {
        setUser(newPreset.fixedUser);
      }
    }
    setMessage(null);
  };

  const getEffectiveHost = () => isOther ? host : preset.host;
  const getEffectivePort = () => isOther ? port : preset.port;
  const getEffectiveSecure = () => isOther ? secure : preset.secure;
  const getEffectiveUser = () => preset.fixedUser || user;

  const canSave = () => {
    if (!getEffectiveUser() && !preset.fixedUser) return false;
    if (!password && !settings?.smtpPasswordSet) return false;
    if (isOther && !host) return false;
    return true;
  };

  const handleSave = async () => {
    if (!canSave()) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const data: Record<string, string | number | boolean | null> = {
        smtpProvider: provider,
        smtpHost: getEffectiveHost(),
        smtpPort: getEffectivePort(),
        smtpSecure: getEffectiveSecure(),
        smtpUser: getEffectiveUser(),
        smtpFrom: from || null,
      };
      // Only send password if the user entered one
      if (password) {
        data.smtpPassword = password;
      }

      const result = await userService.updateSmtpSettings(data);
      setMessage({ type: 'success', text: result.message });
      setPassword(''); // Clear password input after save
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save SMTP settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setMessage(null);

    try {
      const result = await userService.testSmtpSettings();
      setMessage({ type: 'success', text: result.message });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send test email' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Remove SMTP Settings',
      message: 'Are you sure you want to remove your SMTP email settings? The server will fall back to the global configuration (if any).',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await userService.updateSmtpSettings({
        smtpProvider: null,
        smtpHost: null,
        smtpPort: null,
        smtpSecure: null,
        smtpUser: null,
        smtpPassword: null,
        smtpFrom: null,
      });

      setProvider('gmail');
      setHost('');
      setPort(587);
      setSecure(false);
      setUser('');
      setPassword('');
      setFrom('');
      setMessage({ type: 'success', text: 'SMTP settings removed' });
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to clear SMTP settings' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-gray-400">Loading email settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Email (SMTP) Settings</h2>

      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Configure SMTP to send invitation emails. Choose your email provider for automatic setup, or select "Other" for custom SMTP servers.
      </p>

      {settings?.smtpConfigured && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
          <p className="text-green-800 dark:text-green-200 font-medium">
            &#10003; Email is configured
            {settings.smtpHost && <span className="font-normal text-sm ml-2">({settings.smtpHost})</span>}
          </p>
        </div>
      )}

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700'
        }`}>
          <p className={message.type === 'success'
            ? 'text-green-800 dark:text-green-200'
            : 'text-red-800 dark:text-red-200'
          }>
            {message.text}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Provider selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email Provider
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as SmtpProvider)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          >
            {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Host (only for "Other") */}
        {isOther && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              SMTP Host *
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.com"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>
        )}

        {/* Port and Secure (only for "Other") */}
        {isOther && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Port *
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 587)}
                min={1}
                max={65535}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Use SSL/TLS
              </label>
              <div className="flex items-center h-[42px]">
                <button
                  type="button"
                  onClick={() => setSecure(!secure)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    secure ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  role="switch"
                  aria-checked={secure}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      secure ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  {secure ? 'On (port 465)' : 'Off (port 587)'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Username (hidden for SendGrid which uses fixed "apikey") */}
        {!preset.fixedUser && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {preset.userLabel} *
            </label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder={preset.userPlaceholder}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
          </div>
        )}

        {/* Password / API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {preset.passwordLabel} *
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={settings?.smtpPasswordSet ? `Enter new ${preset.passwordLabel.toLowerCase()} to update` : `Enter your ${preset.passwordLabel.toLowerCase()}`}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
        </div>

        {/* From address (always shown) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            From Address
          </label>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder='Travel Life <noreply@example.com>'
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            The "From" address shown on sent emails. Leave blank to use your SMTP username.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {settings?.smtpConfigured && (
            <button
              onClick={handleTest}
              disabled={isTesting || isSaving}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isTesting ? 'Sending...' : 'Send Test Email'}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving || !canSave()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>

          {settings?.smtpConfigured && (
            <button
              onClick={handleClear}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              Clear Settings
            </button>
          )}
        </div>
      </div>

      {/* Provider-specific instructions */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Setup Instructions ({preset.label}):
        </h3>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
          {preset.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      <ConfirmDialogComponent />
    </div>
  );
}
