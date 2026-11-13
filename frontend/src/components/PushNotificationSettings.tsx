import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import pushService, { urlBase64ToUint8Array } from '../services/push.service';

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    return response?.data?.message;
  }
  return undefined;
}

/**
 * Settings card for enabling/disabling Web Push notifications.
 * Handles unsupported browsers, denied permission, and servers where
 * VAPID keys are not configured.
 */
export default function PushNotificationSettings() {
  const supported = isPushSupported();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);

  const refreshSubscriptionState = useCallback(async () => {
    if (!supported) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    } catch {
      setSubscribed(false);
    }
  }, [supported]);

  useEffect(() => {
    const load = async () => {
      try {
        if (supported) {
          const keyInfo = await pushService.getPublicKey();
          setServerConfigured(keyInfo.configured);
          setPublicKey(keyInfo.publicKey);
          await refreshSubscriptionState();
        }
      } catch (err) {
        console.error('Failed to load push notification settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supported, refreshSubscriptionState]);

  const handleEnable = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Notification permission was not granted');
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        toast.error(
          'Service worker is not registered. Push notifications only work in the installed/production app.'
        );
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await pushService.subscribe(subscription.toJSON());
      setSubscribed(true);
      toast.success('Push notifications enabled');
    } catch (err) {
      console.error('Failed to enable push notifications:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to enable push notifications');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await pushService.unsubscribe(endpoint);
      }
      setSubscribed(false);
      toast.success('Push notifications disabled');
    } catch (err) {
      console.error('Failed to disable push notifications:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to disable push notifications');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    setBusy(true);
    try {
      await pushService.sendTest();
      toast.success('Test notification sent');
    } catch (err) {
      console.error('Failed to send test notification:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to send test notification');
    } finally {
      setBusy(false);
    }
  };

  let content: React.ReactNode;
  if (!supported) {
    content = (
      <p className="text-sm text-gray-500 dark:text-dusk-400">
        Push notifications are not supported in this browser.
      </p>
    );
  } else if (loading) {
    content = (
      <p className="text-sm text-gray-500 dark:text-dusk-400">Loading...</p>
    );
  } else if (!serverConfigured) {
    content = (
      <p className="text-sm text-gray-500 dark:text-dusk-400">
        Push notifications are not configured on this server. Set the{' '}
        <code className="font-mono">VAPID_PUBLIC_KEY</code>,{' '}
        <code className="font-mono">VAPID_PRIVATE_KEY</code>, and{' '}
        <code className="font-mono">VAPID_SUBJECT</code> environment variables on
        the backend to enable them.
      </p>
    );
  } else if (permission === 'denied') {
    content = (
      <p className="text-sm text-red-600 dark:text-red-400">
        Notifications are blocked for this site. Allow notifications in your
        browser settings, then reload this page.
      </p>
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              subscribed ? 'bg-green-500' : 'bg-gray-400 dark:bg-dusk-500'
            }`}
            aria-hidden="true"
          />
          <span className="text-gray-700 dark:text-dusk-300">
            {subscribed
              ? 'Push notifications are enabled on this device.'
              : 'Push notifications are disabled on this device.'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={busy}
                className="btn btn-primary"
              >
                Send Test Notification
              </button>
              <button
                type="button"
                onClick={handleDisable}
                disabled={busy}
                className="btn btn-secondary"
              >
                Disable
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className="btn btn-primary"
            >
              Enable Push Notifications
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Push Notifications
      </h2>
      <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
        Get notified on this device about upcoming trips and tracked flight
        status changes, even when the app is closed.
      </p>
      {content}
    </div>
  );
}
