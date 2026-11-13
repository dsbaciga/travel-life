import { useState, useEffect } from 'react';
import userService from '../services/user.service';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function WeatherSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [settings, setSettings] = useState<{ weatherApiKeySet: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await userService.getWeatherSettings();
      setSettings(data);
      // Don't set API key from server for security
    } catch (error) {
      console.error('Failed to load weather settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey) {
      setMessage({ type: 'error', text: 'Please enter an API key' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const result = await userService.updateWeatherSettings({
        weatherApiKey: apiKey,
      });

      setMessage({ type: 'success', text: result.message });
      await loadSettings();
      setApiKey(''); // Clear the input after successful save
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSettings = async () => {
    const confirmed = await confirm({
      title: 'Remove Weather API Key',
      message: 'Are you sure you want to remove your weather API key?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await userService.updateWeatherSettings({
        weatherApiKey: null,
      });

      setApiKey('');
      setMessage({ type: 'success', text: 'Weather API key removed' });
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
        <p className="text-gray-600 dark:text-dusk-400">Loading weather settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Weather Settings</h2>

      <p className="text-gray-600 dark:text-dusk-400 mb-6">
        Configure your OpenWeatherMap One Call API 3.0 key to enable weather data for your trips. Weather information will be displayed in the timeline for each day of your trip.
      </p>

      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Note:</strong> This feature requires the <strong>One Call API 3.0</strong> subscription (separate from the free tier).
          It includes 1,000 complimentary daily calls. Historical weather data for past trips requires a paid subscription.
        </p>
      </div>

      {settings?.weatherApiKeySet && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
          <p className="text-green-800 dark:text-green-200 font-medium">
            ✓ Weather API key is configured
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
            OpenWeatherMap API Key *
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.weatherApiKeySet ? "Enter new API key to update" : "Enter your API key"}
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            Your OpenWeatherMap API key (free tier is sufficient)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !apiKey}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? 'Saving...' : 'Save API Key'}
          </button>

          {settings?.weatherApiKeySet && (
            <button
              onClick={handleClearSettings}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              Clear API Key
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How to get your OpenWeatherMap One Call API 3.0 Key:
        </h3>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
          <li>Go to <a href="https://openweathermap.org/api/one-call-3" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">openweathermap.org/api/one-call-3</a></li>
          <li>Click "Subscribe" and select the One Call API 3.0 plan</li>
          <li>Complete the subscription process (1,000 free daily calls included)</li>
          <li>Navigate to "API keys" in your account dashboard</li>
          <li>Copy your API key and paste it above</li>
          <li>Note: It may take a few minutes for a new API key to become active</li>
        </ol>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
