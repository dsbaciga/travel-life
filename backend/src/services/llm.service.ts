import axios from 'axios';
import { config } from '../config';
import prisma from '../config/database';
import logger from '../config/logger';
import { decryptSecret } from '../security/encryption';

interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  userId?: number;
}

interface ResolvedLlmConfig {
  baseUrl: string;
  /** Null for local LLMs that require no auth (e.g., Ollama). */
  apiKey: string | null;
  model: string;
  maxTokens: number;
}

/**
 * Thrown when the LLM call itself fails (network, timeout, 4xx/5xx, malformed response).
 * Distinct from "not configured" (returns '') and "empty content" (returns '') so callers
 * can mark jobs as failed rather than silently reporting no results.
 */
export class LlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

class LlmService {
  /**
   * Resolve effective LLM config for a user: per-user values override env defaults.
   * Returns null if the global kill switch is off or no API key is available.
   */
  private async resolveConfig(userId?: number): Promise<ResolvedLlmConfig | null> {
    if (!config.llm.enabled) return null;

    let userApiKey: string | null = null;
    let userBaseUrl: string | null = null;
    let userModel: string | null = null;

    if (userId !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { llmApiKey: true, llmBaseUrl: true, llmModel: true },
      });
      userApiKey = decryptSecret(user?.llmApiKey);
      userBaseUrl = user?.llmBaseUrl ?? null;
      userModel = user?.llmModel ?? null;
    }

    // Resolve the effective API key: prefer per-user, fall back to env.
    // A user who sets only a custom model still needs the global env key.
    const effectiveApiKey = userApiKey ?? (config.llm.apiKey || null);

    // If the user set a custom base URL, use per-user settings.
    // This supports no-auth local LLMs (e.g., Ollama) — base URL set, API key null.
    if (userBaseUrl) {
      return {
        baseUrl: userBaseUrl,
        apiKey: userApiKey, // null is valid for local LLMs
        model: userModel || config.llm.model,
        maxTokens: config.llm.maxTokens,
      };
    }

    // No per-user base URL: use the env base URL with the resolved API key.
    // A per-user model name is applied on top of the env config.
    if (!effectiveApiKey) return null;
    return {
      baseUrl: config.llm.baseUrl,
      apiKey: effectiveApiKey,
      model: userModel || config.llm.model,
      maxTokens: config.llm.maxTokens,
    };
  }

  async isConfigured(userId?: number): Promise<boolean> {
    return (await this.resolveConfig(userId)) !== null;
  }

  async chat(
    systemPrompt: string,
    userPrompt: string,
    options: LlmOptions = {}
  ): Promise<string> {
    const resolved = await this.resolveConfig(options.userId);
    if (!resolved) {
      logger.warn('LLM not configured — AI features disabled. Set an API key in Settings or LLM_API_KEY env var.');
      return '';
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (resolved.apiKey) {
        headers.Authorization = `Bearer ${resolved.apiKey}`;
      }

      const response = await axios.post(
        `${resolved.baseUrl}/chat/completions`,
        {
          model: resolved.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: options.maxTokens ?? resolved.maxTokens,
          temperature: options.temperature ?? 0.3,
        },
        {
          headers,
          timeout: 30000,
          maxRedirects: 0,
        }
      );

      const content: unknown = response.data?.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : '';
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        logger.error('LLM request failed', { status, message: error.message });
        throw new LlmError(`LLM request failed: ${error.message}`, status);
      }
      logger.error('LLM request failed', error);
      throw new LlmError(error instanceof Error ? error.message : 'Unknown LLM error');
    }
  }
}

export const llmService = new LlmService();
