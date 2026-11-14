import { useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import userService from '../services/user.service';
import { useUser, useUpdateUser, useIsAuthenticated } from '../store/authStore';
import { getBrowserTimezone, getTimezoneOptions } from '../utils/timezone';

/**
 * Asks a newly created user for their home timezone.
 *
 * New accounts are created with a null timezone (no column default), so null
 * means "never chosen". Existing accounts already hold a value and are not
 * prompted. The prompt cannot be dismissed without choosing, because the zone
 * is the last fallback for displaying times (see useTimezoneResolver).
 */
export default function HomeTimezonePrompt() {
  const isAuthenticated = useIsAuthenticated();
  const user = useUser();
  const updateUser = useUpdateUser();
  const selectId = useId();
  const browserTz = useMemo(() => getBrowserTimezone(), []);
  const [timezone, setTimezone] = useState(browserTz);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const common = getTimezoneOptions();
    return common.some((o) => o.value === browserTz)
      ? common
      : [{ value: browserTz, label: `${browserTz} (detected)` }, ...common];
  }, [browserTz]);

  if (!isAuthenticated || !user || user.timezone) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await userService.updateSettings({ timezone });
      updateUser({ timezone });
    } catch {
      toast.error('Failed to save timezone');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {}}
      title="Welcome! Set your home timezone"
      icon="🌍"
      maxWidth="md"
      showCloseButton={false}
      closeOnBackdropClick={false}
      closeOnEscape={false}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save timezone'}
        </button>
      }
    >
      <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
        Times without a timezone of their own are shown in your home timezone.
        You can change this later in Settings.
      </p>
      <label htmlFor={selectId} className="sr-only">
        Home timezone
      </label>
      <select
        id={selectId}
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="input w-full"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Modal>
  );
}
