import { useState } from "react";
import toast from "react-hot-toast";
import backupService from "../../services/backup.service";
import type { RestoreOptions } from "../../types/backup";
import type { ConfirmDialogProps } from "../ConfirmDialog";

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

type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "isOpen" | "onClose" | "onConfirm" | "isLoading"
>;

interface BackupRestoreSectionProps {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export default function BackupRestoreSection({
  confirm,
}: BackupRestoreSectionProps) {
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(
    null
  );
  const [restoreOptions, setRestoreOptions] = useState<RestoreOptions>({
    clearExistingData: true,
    importPhotos: true,
  });

  const handleCreateBackup = async () => {
    setBackupInProgress(true);
    try {
      const backupData = await backupService.createBackup();
      backupService.downloadBackupFile(backupData);
      toast.success("Backup created and downloaded successfully");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || "Failed to create backup");
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        toast.error("Please select a valid JSON backup file");
        return;
      }
      setSelectedBackupFile(file);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackupFile) {
      toast.error("Please select a backup file first");
      return;
    }

    const confirmed = await confirm({
      title: "Restore from Backup",
      message: restoreOptions.clearExistingData
        ? "This will DELETE all your existing data and replace it with the backup. This action cannot be undone. Are you sure?"
        : "This will merge the backup data with your existing data. Continue?",
      confirmLabel: "Restore",
      variant: "danger",
    });

    if (!confirmed) return;

    setRestoreInProgress(true);
    try {
      const backupData = await backupService.readBackupFile(selectedBackupFile);
      const result = await backupService.restoreFromBackup(
        backupData,
        restoreOptions
      );

      if (result.success) {
        toast.success(
          `Restore completed! Imported ${result.stats.tripsImported} trips, ` +
            `${result.stats.locationsImported} locations, ${result.stats.photosImported} photos, ` +
            `${result.stats.activitiesImported} activities, and more.`
        );
        setSelectedBackupFile(null);

        // Reload the page to refresh all data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(result.message || "Restore failed");
      }
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err) || "Failed to restore from backup");
    } finally {
      setRestoreInProgress(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Backup */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Create Backup
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Download a complete backup of all your travel data including trips,
          photos, locations, activities, journal entries, and more. The backup
          is saved as a JSON file that you can store safely.
        </p>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            What's included in the backup:
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
            <li>All trips with full details</li>
            <li>Locations, activities, transportation, and lodging</li>
            <li>Photo metadata (not actual photo files)</li>
            <li>Journal entries and albums</li>
            <li>Tags, companions, and custom categories</li>
            <li>User settings and preferences</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={handleCreateBackup}
          disabled={backupInProgress}
          className="btn btn-primary"
        >
          {backupInProgress ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating Backup...
            </>
          ) : (
            "Download Backup"
          )}
        </button>
      </div>

      {/* Restore from Backup */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Restore from Backup
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Upload a backup file to restore your data. You can choose to replace
          all existing data or merge the backup with your current data.
        </p>

        {/* Warning */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
            ⚠️ Important Warning
          </h3>
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            If you choose "Clear existing data", ALL your current data will be
            permanently deleted and replaced with the backup. This action cannot
            be undone. Make sure you have a recent backup before proceeding.
          </p>
        </div>

        {/* File Selection */}
        <div className="mb-4">
          <label
            htmlFor="backup-file-input"
            className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2"
          >
            Select Backup File
          </label>
          <input
            id="backup-file-input"
            type="file"
            accept=".json"
            onChange={handleBackupFileSelect}
            className="block w-full text-sm text-gray-900 dark:text-dusk-100
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              dark:file:bg-blue-900 dark:file:text-blue-100
              dark:hover:file:bg-blue-800"
          />
          {selectedBackupFile && (
            <p className="mt-2 text-sm text-gray-600 dark:text-dusk-400">
              Selected: {selectedBackupFile.name}
            </p>
          )}
        </div>

        {/* Restore Options */}
        <div className="space-y-3 mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={restoreOptions.clearExistingData}
              onChange={(e) =>
                setRestoreOptions({
                  ...restoreOptions,
                  clearExistingData: e.target.checked,
                })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500
                dark:border-dusk-600 dark:bg-dusk-700 dark:focus:ring-blue-400"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-dusk-300">
              Clear existing data (recommended)
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={restoreOptions.importPhotos}
              onChange={(e) =>
                setRestoreOptions({
                  ...restoreOptions,
                  importPhotos: e.target.checked,
                })
              }
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500
                dark:border-dusk-600 dark:bg-dusk-700 dark:focus:ring-blue-400"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-dusk-300">
              Import photo metadata
            </span>
          </label>
        </div>

        {/* Restore Button */}
        <button
          type="button"
          onClick={handleRestoreBackup}
          disabled={!selectedBackupFile || restoreInProgress}
          className="btn btn-danger"
        >
          {restoreInProgress ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Restoring...
            </>
          ) : (
            "Restore from Backup"
          )}
        </button>
      </div>

      {/* Backup Tips */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Backup Best Practices
        </h2>
        <ul className="text-sm text-gray-600 dark:text-dusk-400 space-y-2 list-disc list-inside">
          <li>
            Create regular backups, especially before making major changes
          </li>
          <li>
            Store backup files in a safe location (cloud storage, external
            drive)
          </li>
          <li>
            Keep multiple backup versions in case you need to restore to an
            earlier state
          </li>
          <li>
            Test your backups by restoring to a test account if possible
          </li>
          <li>
            Photo files are not included in backups - back them up separately
          </li>
          <li>Immich photo references are preserved in backups</li>
        </ul>
      </div>
    </div>
  );
}
