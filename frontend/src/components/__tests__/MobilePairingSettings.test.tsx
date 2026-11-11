/**
 * MobilePairingSettings Tests
 *
 * Test cases:
 * - PAIR-UI-001: Renders the pair button and no QR code initially
 * - PAIR-UI-002: Generating shows a QR encoding { serverUrl, pairingToken } and a countdown
 * - PAIR-UI-003: A loopback server URL is replaced by the current origin
 * - PAIR-UI-004: The code is removed from screen when it expires
 * - PAIR-UI-005: Hide Code removes the QR
 * - PAIR-UI-006: A failed request shows the server's error message
 * - PAIR-UI-007: resolvePairingServerUrl keeps a real configured URL
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../services/mobilePairing.service', () => {
  const mockService = { createPairingToken: vi.fn() };
  return { mobilePairingService: mockService, default: mockService };
});

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`) },
}));

import MobilePairingSettings from '../MobilePairingSettings';
import { resolvePairingServerUrl } from '../../utils/pairingServerUrl';
import mobilePairingService from '../../services/mobilePairing.service';
import QRCode from 'qrcode';

const TOKEN = 'ab'.repeat(32);
const NOW = new Date('2026-11-11T12:00:00.000Z');

const mockCreate = vi.mocked(mobilePairingService.createPairingToken);

async function clickAndSettle(name: RegExp | string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    // Flush the awaited service call and QR render.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('MobilePairingSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      pairingToken: TOKEN,
      expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000).toISOString(),
      serverUrl: 'https://travel.example.com/',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('PAIR-UI-001: renders the pair button and no QR code initially', () => {
    render(<MobilePairingSettings />);
    expect(screen.getByRole('button', { name: 'Pair Mobile App' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('PAIR-UI-002: generating shows a QR encoding the payload and a countdown', async () => {
    render(<MobilePairingSettings />);
    await clickAndSettle('Pair Mobile App');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(QRCode.toDataURL).mock.calls[0][0] as unknown as string;
    expect(JSON.parse(payload)).toEqual({
      serverUrl: 'https://travel.example.com',
      pairingToken: TOKEN,
    });
    expect(screen.getByRole('img', { name: /pairing qr code/i })).toBeInTheDocument();
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('https://travel.example.com')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText('3:59')).toBeInTheDocument();
  });

  it('PAIR-UI-003: a loopback server URL is replaced by the current origin', () => {
    expect(resolvePairingServerUrl('http://localhost:5000', 'https://travellife.dev')).toBe(
      'https://travellife.dev'
    );
    expect(resolvePairingServerUrl('http://127.0.0.1:5000/', 'https://travellife.dev/')).toBe(
      'https://travellife.dev'
    );
    // Local development: both are loopback, keep what the server said.
    expect(resolvePairingServerUrl('http://localhost:5000', 'http://localhost:5173')).toBe(
      'http://localhost:5000'
    );
  });

  it('PAIR-UI-004: the code is removed from screen when it expires', async () => {
    render(<MobilePairingSettings />);
    await clickAndSettle('Pair Mobile App');
    expect(screen.getByRole('img')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair Mobile App' })).toBeInTheDocument();
  });

  it('PAIR-UI-005: Hide Code removes the QR', async () => {
    render(<MobilePairingSettings />);
    await clickAndSettle('Pair Mobile App');
    expect(screen.getByRole('button', { name: 'Generate New Code' })).toBeInTheDocument();

    await clickAndSettle('Hide Code');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('PAIR-UI-006: a failed request shows the server error message', async () => {
    mockCreate.mockRejectedValue({ response: { data: { message: 'Too many requests' } } });
    render(<MobilePairingSettings />);
    await clickAndSettle('Pair Mobile App');

    expect(screen.getByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('PAIR-UI-007: resolvePairingServerUrl keeps a real configured URL', () => {
    expect(resolvePairingServerUrl('https://api.example.com', 'https://app.example.com')).toBe(
      'https://api.example.com'
    );
    expect(resolvePairingServerUrl('not a url', 'https://app.example.com')).toBe(
      'https://app.example.com'
    );
  });
});
