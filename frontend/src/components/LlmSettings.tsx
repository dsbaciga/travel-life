import { useState, useEffect, useId } from 'react';
import userService, { type LlmSettingsResponse } from '../services/user.service';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

interface Preset {
  label: string;
  baseUrl: string;
  model: string;
  requiresApiKey: boolean;
  hint: string;
}

const PRESETS: Preset[] = [
  {
    label: 'Ollama (local)',
    baseUrl: 'http://ollama:11434/v1',
    model: 'llama3.1:8b',
    requiresApiKey: false,
    hint: 'Uses the Ollama container on the same Docker network. No API key needed. Update the host if your Ollama service is named differently.',
  },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    hint: 'Requires an OpenAI API key starting with sk-.',
  },
  {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4.6',
    requiresApiKey: true,
    hint: 'Routes to many providers. Requires an OpenRouter API key.',
  },
];

export default function LlmSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [settings, setSettings] = useState<LlmSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const apiKeyId = useId();
  const baseUrlId = useId();
  const modelId = useId();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await userService.getLlmSettings();
      setSettings(data);
      setBaseUrl(data.llmBaseUrl ?? '');
      setModel(data.llmModel ?? '');
      // Never populate apiKey from server
    } catch (error) {
      console.error('Failed to load LLM settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    if (!preset.requiresApiKey) {
      setApiKey('');
    }
    setMessage({ type: 'success', text: preset.hint });
  };

  const handleSave = async () => {
    if (!baseUrl && !apiKey && !settings?.llmConfigured) {
      setMessage({ type: 'error', text: 'Please provide at least a base URL or an API key' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const payload: { llmApiKey?: string | null; llmBaseUrl?: string | null; llmModel?: string | null } = {
        llmBaseUrl: baseUrl || null,
        llmModel: model || null,
      };
      // Only send apiKey if user typed a new one — empty means "leave as-is"
      if (apiKey) {
        payload.llmApiKey = apiKey;
      }

      const result = await userService.updateLlmSettings(payload);
      setMessage({ type: 'success', text: result.message });
      await loadSettings();
      setApiKey('');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Clear LLM Settings',
      message: 'Remove your LLM configuration? AI features will fall back to any server-level LLM_API_KEY env var, or be disabled if none is set.',
      confirmLabel: 'Clear',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await userService.updateLlmSettings({
        llmApiKey: null,
        llmBaseUrl: null,
        llmModel: null,
      });
      setApiKey('');
      setBaseUrl('');
      setModel('');
      setMessage({ type: 'success', text: 'LLM settings cleared' });
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to clear settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearApiKey = async () => {
    const confirmed = await confirm({
      title: 'Remove API Key',
      message: 'Remove the stored API key? This is useful when switching to a no-auth local LLM like Ollama.',
      confirmLabel: 'Remove Key',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await userService.updateLlmSettings({ llmApiKey: null });
      setApiKey('');
      setMessage({ type: 'success', text: 'API key removed' });
      await loadSettings();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to remove API key' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-dusk-400">Loading LLM settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">LLM (AI) Settings</h2>

      <p className="text-gray-600 dark:text-dusk-400 mb-6">
        Configure an OpenAI-compatible endpoint to enable AI features: PDF booking import, journal
        summaries and title/mood suggestions, and smart entity link suggestions. Works with OpenAI,
        OpenRouter, Ollama, LM Studio, or any other OpenAI-compatible server.
      </p>

      {settings?.llmConfigured && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
          <p className="text-green-800 dark:text-green-200 font-medium">
            ✓ LLM is configured
            {settings.llmApiKeySet ? ' (with API key)' : ' (no-auth / local mode)'}
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

      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-dusk-700 dark:hover:bg-dusk-600 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1" htmlFor={baseUrlId}>
            Base URL
          </label>
          <input
            id={baseUrlId}
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            OpenAI-compatible endpoint. Must include the <code>/v1</code> path suffix.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1" htmlFor={modelId}>
            Model
          </label>
          <input
            id={modelId}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            Model identifier (e.g., <code>gpt-4o-mini</code>, <code>llama3.1:8b</code>, <code>qwen2.5:7b-instruct</code>).
            For Ollama, must match a model you have pulled.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1" htmlFor={apiKeyId}>
            API Key {settings?.llmApiKeySet && <span className="text-green-600 dark:text-green-400">(currently set)</span>}
          </label>
          <input
            id={apiKeyId}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.llmApiKeySet ? 'Enter a new key to replace, or leave blank to keep' : 'Leave blank for local LLMs with no auth (e.g., Ollama)'}
            className="w-full px-4 py-2 border border-gray-300 dark:border-dusk-600 rounded-lg bg-white dark:bg-dusk-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
            Optional for local LLMs that don't require authentication. Required for OpenAI, OpenRouter, etc.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>

          {settings?.llmApiKeySet && (
            <button
              onClick={handleClearApiKey}
              disabled={isSaving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              Remove API Key Only
            </button>
          )}

          {settings?.llmConfigured && (
            <button
              onClick={handleClear}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              Clear All LLM Settings
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Notes for self-hosted LLMs (Ollama, LM Studio, llama.cpp server)
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
          <li>
            Base URL must be reachable <strong>from the backend container</strong> — use the Docker
            service name (e.g., <code>http://ollama:11434/v1</code>), not <code>localhost</code>.
          </li>
          <li>If the LLM is in a separate compose project, join the networks or use <code>host.docker.internal</code>.</li>
          <li>Leave the API key blank — no auth header will be sent.</li>
          <li>
            For PDF import, prefer a 7B+ instruction-tuned model (e.g., <code>llama3.1:8b</code>,
            <code>qwen2.5:7b-instruct</code>) — smaller models often produce invalid JSON.
          </li>
          <li>First-call latency can be high while the model loads; subsequent calls are faster.</li>
        </ul>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
