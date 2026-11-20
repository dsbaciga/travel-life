/**
 * LLM Service Tests
 *
 * Test cases:
 * - LLM-001: chat decrypts per-user encrypted llmApiKey and sets maxRedirects: 0
 * - LLM-002: chat supports legacy plaintext per-user llmApiKey
 * - LLM-003: chat supports local no-auth LLM when llmBaseUrl is set without API key
 * - LLM-004: chat returns empty string when LLM is not configured
 * - LLM-005: chat throws LlmError when axios request fails
 * - LLM-006: requests use the configurable timeout (5 minutes by default)
 * - LLM-007: a cancelled request rejects without an error-level log
 * - LLM-008: llmEndpointKey collapses spelling variants of one server to one key
 * - LLM-009: resolveForUser, and a pinned llmConfig skips the per-user lookup
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import axios from 'axios';

const mockPrismaUserFindUnique = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockPrismaUserFindUnique(...args),
    },
  },
}));

jest.mock('axios');
const mockAxios = jest.mocked(axios);

import { llmService, LlmError, llmEndpointKey } from '../llm.service';
import { encryptSecret } from '../../security/encryption';
import { config } from '../../config';

describe('LlmService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.llm.enabled = true;
    config.llm.apiKey = '';
    config.llm.baseUrl = 'https://api.openai.com/v1';
    config.llm.model = 'gpt-4o-mini';
  });

  it('LLM-001: decrypts encrypted per-user llmApiKey and sets maxRedirects: 0 on axios request', async () => {
    const encryptedKey = encryptSecret('sk-user-secret-key-123');
    mockPrismaUserFindUnique.mockResolvedValue({
      llmApiKey: encryptedKey,
      llmBaseUrl: 'https://llm.example.com/v1',
      llmModel: 'gpt-4o',
    });

    mockAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello from LLM' } }],
      },
    });

    const result = await llmService.chat('system prompt', 'user prompt', { userId: 42 });

    expect(result).toBe('Hello from LLM');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://llm.example.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-4o',
      }),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-user-secret-key-123',
        },
        timeout: 300000,
        maxRedirects: 0,
      })
    );
  });

  it('LLM-002: supports legacy plaintext per-user llmApiKey', async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      llmApiKey: 'sk-legacy-plaintext',
      llmBaseUrl: null,
      llmModel: null,
    });

    mockAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Legacy response' } }],
      },
    });

    const result = await llmService.chat('sys', 'usr', { userId: 1 });
    expect(result).toBe('Legacy response');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-legacy-plaintext',
        }),
        maxRedirects: 0,
      })
    );
  });

  it('LLM-003: supports local no-auth LLM when llmBaseUrl is set without API key', async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      llmApiKey: null,
      llmBaseUrl: 'http://localhost:11434/v1',
      llmModel: 'llama3',
    });

    mockAxios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Local response' } }],
      },
    });

    const result = await llmService.chat('sys', 'usr', { userId: 1 });
    expect(result).toBe('Local response');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({ model: 'llama3' }),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        maxRedirects: 0,
      })
    );
  });

  it('LLM-004: returns empty string when not configured', async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      llmApiKey: null,
      llmBaseUrl: null,
      llmModel: null,
    });

    expect(await llmService.isConfigured(1)).toBe(false);
    expect(await llmService.chat('sys', 'usr', { userId: 1 })).toBe('');
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('LLM-005: wraps network/API failures in LlmError', async () => {
    config.llm.apiKey = 'sk-global-key';
    mockAxios.post.mockRejectedValue(new Error('Connection reset'));

    await expect(llmService.chat('sys', 'usr')).rejects.toBeInstanceOf(LlmError);
  });

  it('LLM-006: uses config.llm.timeoutMs, 5 minutes unless LLM_TIMEOUT_MS overrides it', async () => {
    const original = config.llm.timeoutMs;
    try {
      expect(original).toBe(300000);
      config.llm.timeoutMs = 600000;
      config.llm.apiKey = 'ollama';
      mockPrismaUserFindUnique.mockResolvedValue(null);
      mockAxios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } });

      await llmService.chat('s', 'u', { userId: 1 });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ timeout: 600000 })
      );
    } finally {
      config.llm.timeoutMs = original;
    }
  });

  it('LLM-007: passes the abort signal and treats a cancel as cancelled, not failed', async () => {
    config.llm.apiKey = 'ollama';
    mockPrismaUserFindUnique.mockResolvedValue(null);
    const controller = new AbortController();
    mockAxios.post.mockImplementation(async (_url, _body, opts) => {
      expect((opts as { signal?: AbortSignal }).signal).toBe(controller.signal);
      controller.abort();
      throw new Error('canceled');
    });

    await expect(
      llmService.chat('s', 'u', { userId: 1, signal: controller.signal })
    ).rejects.toThrow('LLM request cancelled');
  });

  it('LLM-008: llmEndpointKey names the machine, so URL spelling variants collapse to one key', () => {
    for (const url of [
      'http://ollama.lan:11434/v1',
      'http://Ollama.LAN:11434/v1/',
      'https://ollama.lan/api/v1',
      'http://user:secret@ollama.lan:8080/v1?x=1#frag',
      ' http://ollama.lan.:11434/v1 ',
    ]) {
      expect(llmEndpointKey(url)).toBe('ollama.lan');
    }
    expect(llmEndpointKey('http://[::1]:11434/v1')).toBe('::1');
    expect(llmEndpointKey('https://my-own-llm.example/v1')).toBe('my-own-llm.example');
  });

  it('LLM-009: resolveForUser reports the config a user would get, and a pinned config skips the lookup', async () => {
    config.llm.apiKey = 'ollama';
    config.llm.baseUrl = 'http://ollama.lan:11434/v1';
    mockPrismaUserFindUnique.mockResolvedValueOnce(null);
    const pinned = await llmService.resolveForUser(1);
    expect(pinned).toMatchObject({ baseUrl: 'http://ollama.lan:11434/v1', apiKey: 'ollama' });

    config.llm.apiKey = '';
    mockPrismaUserFindUnique.mockResolvedValueOnce(null);
    expect(await llmService.resolveForUser(2)).toBeNull();

    // Settings changed since: the pinned config is used as-is, with no lookup.
    mockPrismaUserFindUnique.mockClear();
    mockAxios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } });
    await llmService.chat('s', 'u', { userId: 1, llmConfig: pinned! });
    expect(mockPrismaUserFindUnique).not.toHaveBeenCalled();
    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://ollama.lan:11434/v1/chat/completions',
      expect.any(Object),
      expect.any(Object)
    );
  });
});
