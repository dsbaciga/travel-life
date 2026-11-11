import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import mobilePairingService from '../services/mobilePairing.service';
import { resolvePairingServerUrl } from '../utils/pairingServerUrl';

interface ApiError {
  response?: { data?: { message?: string } };
  message?: string;
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (err === null || typeof err !== 'object') return undefined;
  const apiError = err as ApiError;
  return apiError.response?.data?.message ?? apiError.message;
}

interface ActivePairing {
  qrDataUrl: string;
  serverUrl: string;
  expiresAtMs: number;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function MobilePairingSettings() {
  const [pairing, setPairing] = useState<ActivePairing | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const handleHide = useCallback(() => {
    stopTimer();
    setPairing(null);
  }, [stopTimer]);

  const handleGenerate = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const token = await mobilePairingService.createPairingToken();
      const serverUrl = resolvePairingServerUrl(token.serverUrl, window.location.origin);
      const qrDataUrl = await QRCode.toDataURL(
        JSON.stringify({ serverUrl, pairingToken: token.pairingToken }),
        { errorCorrectionLevel: 'M', margin: 2, width: 280 }
      );
      const expiresAtMs = new Date(token.expiresAt).getTime();
      setPairing({ qrDataUrl, serverUrl, expiresAtMs });
      setRemainingMs(expiresAtMs - Date.now());

      stopTimer();
      timerRef.current = setInterval(() => {
        const left = expiresAtMs - Date.now();
        if (left <= 0) {
          // An expired code is worthless; take it off screen rather than
          // leave a QR that will fail when scanned.
          handleHide();
        } else {
          setRemainingMs(left);
        }
      }, 1000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || 'Failed to create a pairing code');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Mobile App</h2>

      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Sign in to the Travel Life companion app by scanning a code — it sets the server address
        and your account in one step, with no password to type on your phone.
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700"
        >
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {pairing && (
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="p-3 bg-white rounded-lg border border-gray-200 dark:border-gray-600">
            <img
              src={pairing.qrDataUrl}
              alt="Pairing QR code for the Travel Life mobile app"
              width={280}
              height={280}
            />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300" aria-live="polite">
            Expires in <span className="font-mono">{formatRemaining(remainingMs)}</span> · works once
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 break-all text-center">
            Server: <span className="font-mono">{pairing.serverUrl}</span>
          </p>
          <div className="w-full p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Treat this code like a password.</strong> Anyone who scans it in the next few
              minutes is signed in as you. Do not share a screenshot of it.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isWorking}
          className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {isWorking ? 'Generating...' : pairing ? 'Generate New Code' : 'Pair Mobile App'}
        </button>
        {pairing && (
          <button
            type="button"
            onClick={handleHide}
            className="min-h-[44px] px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Hide Code
          </button>
        )}
      </div>
    </div>
  );
}
