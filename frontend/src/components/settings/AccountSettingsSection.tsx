import { useState, useId, Suspense, lazy } from "react";
import { timezoneOptionsFor } from "../../utils/timezone";
import toast from "react-hot-toast";
import userService from "../../services/user.service";
import { useUpdateUser } from "../../store/authStore";
import { useTheme, useToggleTheme } from "../../store/themeStore";
import DietaryTagSelector from "../DietaryTagSelector";
import LoadingSpinner from "../LoadingSpinner";
import ErrorBoundary from "../ErrorBoundary";
import { CONVERTIBLE_CURRENCIES } from "../../constants/currencies";

const TravelPartnerSettings = lazy(() => import("../TravelPartnerSettings"));

interface ApiError {
  response?: { data?: { message?: string } };
  message?: string;
}

function isApiError(err: unknown): err is ApiError {
  return (
    err !== null &&
    typeof err === "object" &&
    ("response" in err || "message" in err)
  );
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (!isApiError(err)) return undefined;
  return err.response?.data?.message ?? err.message;
}

interface AccountSettingsSectionProps {
  username: string;
  onUsernameChange: (username: string) => void;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  onSaveSettings: () => Promise<void>;
  baseCurrency: string;
  onBaseCurrencyChange: (currency: string) => void;
  dietaryPreferences: string[];
  onDietaryPreferencesChange: (prefs: string[]) => void;
  useCustomMapStyle: boolean;
  onCustomMapStyleChange: (val: boolean) => void;
}

export default function AccountSettingsSection({
  username,
  onUsernameChange,
  timezone,
  onTimezoneChange,
  onSaveSettings,
  baseCurrency,
  onBaseCurrencyChange,
  dietaryPreferences,
  onDietaryPreferencesChange,
  useCustomMapStyle,
  onCustomMapStyleChange,
}: AccountSettingsSectionProps) {
  const updateUser = useUpdateUser();
  const theme = useTheme();
  const toggleTheme = useToggleTheme();

  const [newUsername, setNewUsername] = useState(username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingBaseCurrency, setSavingBaseCurrency] = useState(false);

  const timezoneSelectId = useId();
  const baseCurrencySelectId = useId();
  const currentUsernameId = useId();
  const newUsernameId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || newUsername === username) return;

    try {
      const result = await userService.updateUsername(newUsername.trim());
      onUsernameChange(result.username);
      setNewUsername(result.username);
      updateUser({ username: result.username });
      toast.success(result.message);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || "Failed to update username");
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    try {
      const result = await userService.updatePassword(
        currentPassword,
        newPassword
      );
      toast.success(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || "Failed to update password");
    }
  };

  const handleSaveDietaryPreferences = async () => {
    try {
      await userService.updateSettings({
        dietaryPreferences,
      });
      toast.success("Dietary preferences saved");
    } catch {
      toast.error("Failed to save dietary preferences");
    }
  };

  const handleSaveBaseCurrency = async () => {
    setSavingBaseCurrency(true);
    try {
      // Null (not "") clears the setting on the backend.
      await userService.updateSettings({ baseCurrency: baseCurrency || null });
      updateUser({ baseCurrency: baseCurrency || null });
      toast.success(
        baseCurrency
          ? `Home currency set to ${baseCurrency}`
          : "Home currency cleared"
      );
    } catch {
      toast.error("Failed to save home currency");
    } finally {
      setSavingBaseCurrency(false);
    }
  };

  const handleToggleCustomMapStyle = async () => {
    const newValue = !useCustomMapStyle;
    onCustomMapStyleChange(newValue);
    try {
      await userService.updateSettings({
        useCustomMapStyle: newValue,
      });
      updateUser({ useCustomMapStyle: newValue });
      toast.success(
        newValue ? "Custom map style enabled" : "Custom map style disabled"
      );
    } catch {
      onCustomMapStyleChange(!newValue);
      toast.error("Failed to update map style preference");
    }
  };

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Name
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Change your name (must be 3-50 characters).
        </p>
        <form onSubmit={handleUpdateUsername} className="space-y-4">
          <div>
            <label className="label" htmlFor={currentUsernameId}>
              Current Name
            </label>
            <input
              type="text"
              id={currentUsernameId}
              value={username}
              disabled
              className="input w-full max-w-md bg-gray-100 dark:bg-dusk-700"
            />
          </div>
          <div>
            <label className="label" htmlFor={newUsernameId}>
              New Name
            </label>
            <input
              type="text"
              id={newUsernameId}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="input w-full max-w-md"
              minLength={3}
              maxLength={50}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newUsername.trim() || newUsername === username}
          >
            Update Name
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Change Password
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Update your password (minimum 8 characters).
        </p>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="label" htmlFor={currentPasswordId}>
              Current Password
            </label>
            <input
              type="password"
              id={currentPasswordId}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input w-full max-w-md"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={newPasswordId}>
              New Password
            </label>
            <input
              type="password"
              id={newPasswordId}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input w-full max-w-md"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor={confirmPasswordId}>
              Confirm New Password
            </label>
            <input
              type="password"
              id={confirmPasswordId}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input w-full max-w-md"
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Update Password
          </button>
        </form>
      </div>

      {/* Timezone Setting */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Timezone
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Set your home timezone to ensure dates are displayed correctly.
        </p>
        <label htmlFor={timezoneSelectId} className="sr-only">
          Timezone
        </label>
        <select
          id={timezoneSelectId}
          value={timezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="input w-full max-w-md"
        >
          {timezoneOptionsFor(timezone).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="mt-4">
          <button
            onClick={onSaveSettings}
            type="button"
            className="btn btn-primary"
          >
            Save Timezone
          </button>
        </div>
      </div>

      {/* Home Currency Setting */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Home Currency
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Trip budgets and expenses recorded in other currencies are converted
          to this currency, using the exchange rate from the day each amount was
          spent. Leave it unset to report each trip in its own budget currency.
        </p>
        <label htmlFor={baseCurrencySelectId} className="sr-only">
          Home currency
        </label>
        <select
          id={baseCurrencySelectId}
          value={baseCurrency}
          onChange={(e) => onBaseCurrencyChange(e.target.value)}
          className="input w-full max-w-md"
        >
          <option value="">No home currency (use each trip&apos;s)</option>
          {CONVERTIBLE_CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.label}
            </option>
          ))}
        </select>
        <div className="mt-4">
          <button
            onClick={handleSaveBaseCurrency}
            type="button"
            className="btn btn-primary"
            disabled={savingBaseCurrency}
          >
            {savingBaseCurrency ? "Saving..." : "Save Home Currency"}
          </button>
        </div>
      </div>

      {/* Dietary Preferences */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Dietary Preferences
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Select your dietary needs. Activities matching these preferences will
          be highlighted when browsing dining options.
        </p>
        <DietaryTagSelector
          selectedTags={dietaryPreferences}
          onChange={onDietaryPreferencesChange}
          showLabels={true}
          showSelectAll={false}
        />
        <div className="mt-4">
          <button
            onClick={handleSaveDietaryPreferences}
            type="button"
            className="btn btn-primary"
          >
            Save Dietary Preferences
          </button>
        </div>
      </div>

      {/* Travel Partner */}
      <ErrorBoundary>
        <Suspense
          fallback={
            <LoadingSpinner.FullPage message="Loading travel partners..." />
          }
        >
          <TravelPartnerSettings />
        </Suspense>
      </ErrorBoundary>

      {/* Appearance */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Appearance
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Customize the visual appearance of the application.
        </p>
        <div className="space-y-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-dusk-700">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Dark Mode
              </h3>
              <p className="text-sm text-gray-500 dark:text-dusk-400">
                Switch between light and dark color schemes
              </p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${theme === "dark" ? "bg-blue-600" : "bg-gray-200 dark:bg-dusk-600"}
              `}
              role="switch"
              aria-checked={theme === "dark" ? "true" : "false"}
              aria-label="Toggle dark mode"
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                  transition duration-200 ease-in-out
                  ${theme === "dark" ? "translate-x-5" : "translate-x-0"}
                `}
              />
            </button>
          </div>

          {/* Custom Map Style Toggle */}
          <div className="flex items-center justify-between py-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                Custom Map Style
              </h3>
              <p className="text-sm text-gray-500 dark:text-dusk-400">
                Use softer themed map tiles in light mode. Dark mode always uses the standard map.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleCustomMapStyle}
              className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${useCustomMapStyle ? "bg-blue-600" : "bg-gray-200 dark:bg-dusk-600"}
              `}
              role="switch"
              aria-checked={useCustomMapStyle ? "true" : "false"}
              aria-label="Toggle custom map style"
            >
              <span
                className={`
                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                  transition duration-200 ease-in-out
                  ${useCustomMapStyle ? "translate-x-5" : "translate-x-0"}
                `}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
