/**
 * LLM Service Tests
 *
 * Test cases:
 * - LLM-001: chat decrypts per-user encrypted llmApiKey and sets maxRedirects: 0
 * - LLM-002: chat supports legacy plaintext per-user llmApiKey
 * - LLM-003: chat supports local no-auth LLM when llmBaseUrl is set without API key
 * - LLM-004: chat returns empty string when LLM is not configured
 * - LLM-005: chat throws LlmError when axios request fails
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

import { llmService, LlmError } from '../llm.service';
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
        timeout: 30000,
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
});
