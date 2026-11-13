import { useState, useEffect } from 'react';
import immichService from '../services/immich.service';
import type { ImmichSettings } from '../types/immich';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function ImmichSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [settings, setSettings] = useState<ImmichSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await immichService.getSettings();
      setSettings(data);
      setApiUrl(data.immichApiUrl || '');
      // Don't set API key from server for security
    } catch (error) {
      console.error('Failed to load Immich settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiUrl || !apiKey) {
      setMessage({ type: 'error', text: 'Please enter both API URL and API Key' });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const result = await immichService.testConnection(apiUrl, apiKey);
      if (result.connected) {
        setMessage({ type: 'success', text: 'Successfully connected to Immich!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to connect to Immich' });
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to test connection' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiUrl || !apiKey) {
      setMessage({ type: 'error', text: 'Please enter both API URL and API Key' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const result = await immichService.updateSettings({
        immichApiUrl: apiUrl,
        immichApiKey: apiKey,
      });

      setMessage({ type: 'success', text: result.message });
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSettings = async () => {
    const confirmed = await confirm({
      title: 'Remove Immich Integration',
      message: 'Are you sure you want to remove Immich integration?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await immichService.updateSettings({
        immichApiUrl: null,
        immichApiKey: null,
      });

      setApiUrl('');
      setApiKey('');
      setMessage({ type: 'success', text: 'Immich integration removed' });
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to clear settings' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-dusk-400">Loading Immich settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Immich Integration</h2>

      <p className="text-gray-600 dark:text-dusk-400 mb-6">
        Connect your self-hosted Immich instance to browse and link photos to your trips without uploading duplicates.
      </p>

      {settings?.immichConfigured && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
          <p className="text-green-800 dark:text-green-200 font-medium">
            ✓ Immich is connected and configured
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
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Immich API URL *
          </label>
          <input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://immich.example.com/api"
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            The base URL of your Immich instance API (e.g., https://immich.example.com/api)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Immich API Key *
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Immich API key"
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            Your Immich API key (found in Account Settings → API Keys in Immich)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !apiUrl || !apiKey}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || !apiUrl || !apiKey}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>

          {settings?.immichConfigured && (
            <button
              onClick={handleClearSettings}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              Clear Settings
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How to get your Immich API Key:
        </h3>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
          <li>Log into your Immich instance</li>
          <li>Go to Account Settings (click your profile picture)</li>
          <li>Navigate to the "API Keys" section</li>
          <li>Click "New API Key"</li>
          <li>Give it a name (e.g., "Travel Life")</li>
          <li>Copy the generated API key and paste it above</li>
        </ol>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
