import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import axios from 'axios';

const mockPrismaUserFindUnique = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    userIntegrations: {
      findUnique: (...args: unknown[]) => mockPrismaUserFindUnique(...args),
    },
    // The user row itself is only consulted when there is no integrations row (an unknown user).
    user: { findUnique: () => Promise.resolve(null) },
  },
}));

jest.mock('axios');
const mockAxios = jest.mocked(axios);

import { llmService, LlmError } from '../llm.service';
import { config } from '../../config';

describe('LlmService.chatWithImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.llm.enabled = true;
    config.llm.apiKey = 'sk-global-key';
    config.llm.baseUrl = 'https://api.openai.com/v1';
    config.llm.model = 'gpt-4o-mini';
    mockPrismaUserFindUnique.mockResolvedValue({ llmApiKey: null, llmBaseUrl: null, llmModel: null });
  });

  it('sends the image as an image_url data URL content part', async () => {
    mockAxios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } });

    const out = await llmService.chatWithImage('sys', 'read it', { mimeType: 'image/jpeg', base64: 'AAAA' }, { userId: 1 });

    expect(out).toBe('ok');
    const body = mockAxios.post.mock.calls[0][1] as { messages: Array<{ role: string; content: unknown }> };
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'read it' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ]);
    expect(mockAxios.post.mock.calls[0][2]).toEqual(expect.objectContaining({ maxRedirects: 0 }));
  });

  it('returns empty string when not configured', async () => {
    config.llm.apiKey = '';
    expect(await llmService.chatWithImage('s', 'u', { mimeType: 'image/jpeg', base64: 'AAAA' }, { userId: 1 })).toBe('');
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('wraps failures in LlmError', async () => {
    mockAxios.post.mockRejectedValue(new Error('timeout'));
    await expect(
      llmService.chatWithImage('s', 'u', { mimeType: 'image/jpeg', base64: 'AAAA' }, { userId: 1 })
    ).rejects.toBeInstanceOf(LlmError);
  });
});
