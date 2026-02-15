import { useEffect, useState, useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import userService from "../services/user.service";
import tagService from "../services/tag.service";
import apiService from "../services/api.service";
import backupService from "../services/backup.service";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import type { ActivityCategory, TripTypeCategory } from "../types/user";
import type { TripTag } from "../types/tag";
import type { RestoreOptions } from "../types/backup";
import toast from "react-hot-toast";
import DietaryTagSelector from "../components/DietaryTagSelector";
import ImmichSettings from "../components/ImmichSettings";
import WeatherSettings from "../components/WeatherSettings";
import AviationstackSettings from "../components/AviationstackSettings";
import OpenRouteServiceSettings from "../components/OpenRouteServiceSettings";
import SmtpSettings from "../components/SmtpSettings";
import EmojiPicker from "../components/EmojiPicker";
import TravelDocumentManager from "../components/TravelDocumentManager";
import InviteUsersSection from "../components/InviteUsersSection";
import TravelPartnerSettings from "../components/TravelPartnerSettings";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { getRandomTagColor } from "../utils/tagColors";

type TabType =
  | "account"
  | "tags-categories"
  | "documents"
  | "integrations"
  | "invites"
  | "backup";

export default function SettingsPage() {
  const { updateUser } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial tab from URL or default to 'account'
  const initialTab = (searchParams.get("tab") as TabType) || "account";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("😀");
  const [tripTypes, setTripTypes] = useState<TripTypeCategory[]>([]);
  const [newTripType, setNewTripType] = useState("");
  const [newTripTypeEmoji, setNewTripTypeEmoji] = useState("🌍");
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editingCategoryNewName, setEditingCategoryNewName] = useState("");
  const [editingTripTypeName, setEditingTripTypeName] = useState<string | null>(null);
  const [editingTripTypeNewName, setEditingTripTypeNewName] = useState("");
  const [editingTagName, setEditingTagName] = useState<number | null>(null);
  const [editingTagNewName, setEditingTagNewName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tags, setTags] = useState<TripTag[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [useCustomMapStyle, setUseCustomMapStyle] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(getRandomTagColor);
  const [newTagTextColor, setNewTagTextColor] = useState("#FFFFFF");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagColor, setEditingTagColor] = useState("#3B82F6");
  const [editingTagTextColor, setEditingTagTextColor] = useState("#FFFFFF");
  const [backendVersion, setBackendVersion] = useState<string>("");
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(
    null,
  );
  const [restoreOptions, setRestoreOptions] = useState<RestoreOptions>({
    clearExistingData: true,
    importPhotos: true,
  });
  const timezoneSelectId = useId();
  const currentUsernameId = useId();
  const newUsernameId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();
  const newTagColorId = useId();
  const newTagTextColorId = useId();

  useEffect(() => {
    loadSettings();
    loadTags();
    loadBackendVersion();
  }, []);

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const loadSettings = async () => {
    try {
      const user = await userService.getMe();
      setCategories(user.activityCategories || []);
      setTripTypes(user.tripTypes || []);
      setTimezone(user.timezone || "UTC");
      setDietaryPreferences(user.dietaryPreferences || []);
      setUseCustomMapStyle(user.useCustomMapStyle ?? true);
      setUsername(user.username);
      setNewUsername(user.username);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const allTags = await tagService.getAllTags();
      setTags(allTags);
    } catch {
      toast.error("Failed to load tags");
    }
  };

  const loadBackendVersion = async () => {
    try {
      const versionInfo = await apiService.getVersion();
      setBackendVersion(versionInfo.version);
    } catch (err) {
      console.error("Failed to load backend version:", err);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await tagService.createTag({
        name: newTagName.trim(),
        color: newTagColor,
        textColor: newTagTextColor,
      });
      setNewTagName("");
      setNewTagColor(getRandomTagColor());
      setNewTagTextColor("#FFFFFF");
      await loadTags();
      toast.success("Tag created");
    } catch {
      toast.error("Failed to create tag");
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    const confirmed = await confirm({
      title: "Delete Tag",
      message: "Delete this tag? It will be removed from all trips.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await tagService.deleteTag(tagId);
      await loadTags();
      toast.success("Tag deleted");
    } catch {
      toast.error("Failed to delete tag");
    }
  };

  const handleStartRenameTag = (tag: TripTag) => {
    setEditingTagName(tag.id);
    setEditingTagNewName(tag.name);
  };

  const handleCancelRenameTag = () => {
    setEditingTagName(null);
    setEditingTagNewName("");
  };

  const handleSaveRenameTag = async (tagId: number) => {
    const newName = editingTagNewName.trim();
    if (!newName) {
      handleCancelRenameTag();
      return;
    }
    const currentTag = tags.find((t) => t.id === tagId);
    if (currentTag && newName === currentTag.name) {
      handleCancelRenameTag();
      return;
    }
    if (tags.some((t) => t.name.toLowerCase() === newName.toLowerCase() && t.id !== tagId)) {
      toast.error("A tag with that name already exists");
      return;
    }

    try {
      await tagService.updateTag(tagId, { name: newName });
      await loadTags();
      setEditingTagName(null);
      setEditingTagNewName("");
      toast.success("Tag renamed");
    } catch {
      toast.error("Failed to rename tag");
    }
  };

  const handleMoveTagUp = async (index: number) => {
    if (index === 0) return;
    const newTags = [...tags];
    [newTags[index - 1], newTags[index]] = [newTags[index], newTags[index - 1]];
    setTags(newTags);
    try {
      await tagService.reorderTags(newTags.map((t) => t.id));
    } catch {
      toast.error("Failed to reorder tags");
      await loadTags();
    }
  };

  const handleMoveTagDown = async (index: number) => {
    if (index === tags.length - 1) return;
    const newTags = [...tags];
    [newTags[index], newTags[index + 1]] = [newTags[index + 1], newTags[index]];
    setTags(newTags);
    try {
      await tagService.reorderTags(newTags.map((t) => t.id));
    } catch {
      toast.error("Failed to reorder tags");
      await loadTags();
    }
  };

  const handleStartEditTag = (tag: TripTag) => {
    setEditingTagId(tag.id);
    setEditingTagColor(tag.color || "#3B82F6");
    setEditingTagTextColor(tag.textColor || "#FFFFFF");
  };

  const handleCancelEditTag = () => {
    setEditingTagId(null);
    setEditingTagColor("#3B82F6");
    setEditingTagTextColor("#FFFFFF");
  };

  const handleSaveTagColors = async (tagId: number) => {
    try {
      await tagService.updateTag(tagId, {
        color: editingTagColor,
        textColor: editingTagTextColor,
      });
      await loadTags();
      setEditingTagId(null);
      toast.success("Tag colors updated");
    } catch {
      toast.error("Failed to update tag colors");
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (
      categories.some(
        (c) => c.name.toLowerCase() === newCategory.trim().toLowerCase(),
      )
    ) {
      toast.error("Category already exists");
      return;
    }
    setCategories([
      ...categories,
      { name: newCategory.trim(), emoji: newCategoryEmoji },
    ]);
    setNewCategory("");
    setNewCategoryEmoji("😀");
  };

  const handleDeleteCategory = async (categoryName: string) => {
    const confirmed = await confirm({
      title: "Delete Category",
      message: `Delete "${categoryName}"? It will be removed from all activities that use it.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      const result = await userService.deleteCategory(categoryName);
      setCategories(result.categories);
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const handleStartRenameCategory = (categoryName: string) => {
    setEditingCategoryName(categoryName);
    setEditingCategoryNewName(categoryName);
  };

  const handleCancelRenameCategory = () => {
    setEditingCategoryName(null);
    setEditingCategoryNewName("");
  };

  const handleSaveRenameCategory = async (oldName: string) => {
    const newName = editingCategoryNewName.trim();
    if (!newName || newName === oldName) {
      handleCancelRenameCategory();
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === newName.toLowerCase() && c.name !== oldName)) {
      toast.error("A category with that name already exists");
      return;
    }

    try {
      const result = await userService.renameCategory(oldName, newName);
      setCategories(result.categories);
      setEditingCategoryName(null);
      setEditingCategoryNewName("");
      toast.success("Category renamed");
    } catch {
      toast.error("Failed to rename category");
    }
  };

  const handleMoveCategoryUp = (index: number) => {
    if (index === 0) return;
    const newCategories = [...categories];
    [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
    setCategories(newCategories);
  };

  const handleMoveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return;
    const newCategories = [...categories];
    [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
    setCategories(newCategories);
  };

  const handleUpdateCategoryEmoji = (
    categoryName: string,
    newEmoji: string,
  ) => {
    setCategories(
      categories.map((c) =>
        c.name === categoryName ? { ...c, emoji: newEmoji } : c,
      ),
    );
  };

  const handleAddTripType = () => {
    if (!newTripType.trim()) return;
    if (
      tripTypes.some(
        (t) => t.name.toLowerCase() === newTripType.trim().toLowerCase(),
      )
    ) {
      toast.error("Trip type already exists");
      return;
    }
    setTripTypes([
      ...tripTypes,
      { name: newTripType.trim(), emoji: newTripTypeEmoji },
    ]);
    setNewTripType("");
    setNewTripTypeEmoji("🌍");
  };

  const handleRemoveTripType = async (typeName: string) => {
    const confirmed = await confirm({
      title: "Delete Trip Type",
      message: `Delete "${typeName}"? It will be removed from all trips that use it.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      const result = await userService.deleteTripType(typeName);
      setTripTypes(result.tripTypes);
      toast.success("Trip type deleted");
    } catch {
      toast.error("Failed to delete trip type");
    }
  };

  const handleUpdateTripTypeEmoji = (
    typeName: string,
    newEmoji: string,
  ) => {
    setTripTypes(
      tripTypes.map((t) =>
        t.name === typeName ? { ...t, emoji: newEmoji } : t,
      ),
    );
  };

  const handleStartRenameTripType = (typeName: string) => {
    setEditingTripTypeName(typeName);
    setEditingTripTypeNewName(typeName);
  };

  const handleCancelRenameTripType = () => {
    setEditingTripTypeName(null);
    setEditingTripTypeNewName("");
  };

  const handleSaveRenameTripType = async (oldName: string) => {
    const newName = editingTripTypeNewName.trim();
    if (!newName || newName === oldName) {
      handleCancelRenameTripType();
      return;
    }
    if (tripTypes.some((t) => t.name.toLowerCase() === newName.toLowerCase() && t.name !== oldName)) {
      toast.error("A trip type with that name already exists");
      return;
    }

    try {
      const result = await userService.renameTripType(oldName, newName);
      setTripTypes(result.tripTypes);
      setEditingTripTypeName(null);
      setEditingTripTypeNewName("");
      toast.success("Trip type renamed");
    } catch {
      toast.error("Failed to rename trip type");
    }
  };

  const handleMoveTripTypeUp = (index: number) => {
    if (index === 0) return;
    const newTypes = [...tripTypes];
    [newTypes[index - 1], newTypes[index]] = [newTypes[index], newTypes[index - 1]];
    setTripTypes(newTypes);
  };

  const handleMoveTripTypeDown = (index: number) => {
    if (index === tripTypes.length - 1) return;
    const newTypes = [...tripTypes];
    [newTypes[index], newTypes[index + 1]] = [newTypes[index + 1], newTypes[index]];
    setTripTypes(newTypes);
  };

  const handleSaveTripTypes = async () => {
    try {
      await userService.updateSettings({
        tripTypes: tripTypes,
      });
      toast.success("Trip types saved");
    } catch {
      toast.error("Failed to save trip types");
    }
  };

  const handleSave = async () => {
    try {
      await userService.updateSettings({
        activityCategories: categories,
        timezone: timezone,
        dietaryPreferences: dietaryPreferences,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const handleSaveDietaryPreferences = async () => {
    try {
      await userService.updateSettings({
        dietaryPreferences: dietaryPreferences,
      });
      toast.success("Dietary preferences saved");
    } catch {
      toast.error("Failed to save dietary preferences");
    }
  };

  const handleToggleCustomMapStyle = async () => {
    const newValue = !useCustomMapStyle;
    setUseCustomMapStyle(newValue);
    try {
      await userService.updateSettings({
        useCustomMapStyle: newValue,
      });
      // Update the user in auth store so the map tiles hook picks up the change
      updateUser({ useCustomMapStyle: newValue });
      toast.success(
        newValue ? "Custom map style enabled" : "Custom map style disabled",
      );
    } catch {
      // Revert on error
      setUseCustomMapStyle(!newValue);
      toast.error("Failed to update map style preference");
    }
  };

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || newUsername === username) return;

    try {
      const result = await userService.updateUsername(newUsername.trim());
      setUsername(result.username);
      setNewUsername(result.username);
      // Update the username in the auth store so navbar reflects change
      updateUser({ username: result.username });
      toast.success(result.message);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to update username");
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
        newPassword,
      );
      toast.success(result.message);
      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to update password");
    }
  };

  const handleCreateBackup = async () => {
    setBackupInProgress(true);
    try {
      const backupData = await backupService.createBackup();
      backupService.downloadBackupFile(backupData);
      toast.success("Backup created and downloaded successfully");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Failed to create backup");
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
        restoreOptions,
      );

      if (result.success) {
        toast.success(
          `Restore completed! Imported ${result.stats.tripsImported} trips, ` +
            `${result.stats.locationsImported} locations, ${result.stats.photosImported} photos, ` +
            `${result.stats.activitiesImported} activities, and more.`,
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
      const error = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        error.response?.data?.message ||
          error.message ||
          "Failed to restore from backup",
      );
    } finally {
      setRestoreInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <Link
          to="/dashboard"
          className="text-blue-600 dark:text-blue-400 hover:underline mb-6 inline-block"
        >
          ← Back to Dashboard
        </Link>

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
            <div>
              Frontend: <span className="font-mono">{__APP_VERSION__}</span>
            </div>
            <div>
              Backend:{" "}
              <span className="font-mono">
                {backendVersion || "Loading..."}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown - visible on small screens */}
        <div className="mb-8 md:hidden">
          <label htmlFor="mobile-tab-select" className="sr-only">
            Select a tab
          </label>
          <select
            id="mobile-tab-select"
            value={activeTab}
            onChange={(e) => handleTabChange(e.target.value as TabType)}
            className="input w-full"
          >
            <option value="account">Account</option>
            <option value="tags-categories">Tags & Categories</option>
            <option value="documents">Travel Documents</option>
            <option value="integrations">Integrations</option>
            <option value="invites">Invite Users</option>
            <option value="backup">Backup & Restore</option>
          </select>
        </div>

        {/* Desktop Tabs - hidden on small screens */}
        <div className="mb-8 border-b border-gray-200 dark:border-gray-700 hidden md:block">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              type="button"
              onClick={() => handleTabChange("account")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "account"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("tags-categories")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "tags-categories"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Tags & Categories
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("documents")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "documents"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Travel Documents
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("integrations")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "integrations"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Integrations
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("invites")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "invites"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Invite Users
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("backup")}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${
                  activeTab === "backup"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                }
              `}
            >
              Backup & Restore
            </button>
          </nav>
        </div>

        {/* Account Tab */}
        {activeTab === "account" && (
          <div className="space-y-6">
            {/* Name */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Name
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
                    className="input w-full max-w-md bg-gray-100 dark:bg-gray-700"
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Change Password
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Timezone
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Set your home timezone to ensure dates are displayed correctly.
              </p>
              <label htmlFor={timezoneSelectId} className="sr-only">
                Timezone
              </label>
              <select
                id={timezoneSelectId}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input w-full max-w-md"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">
                  Eastern Time (US & Canada)
                </option>
                <option value="America/Chicago">
                  Central Time (US & Canada)
                </option>
                <option value="America/Denver">
                  Mountain Time (US & Canada)
                </option>
                <option value="America/Los_Angeles">
                  Pacific Time (US & Canada)
                </option>
                <option value="America/Anchorage">Alaska</option>
                <option value="Pacific/Honolulu">Hawaii</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Europe/Berlin">Berlin</option>
                <option value="Asia/Tokyo">Tokyo</option>
                <option value="Asia/Shanghai">Shanghai</option>
                <option value="Asia/Dubai">Dubai</option>
                <option value="Australia/Sydney">Sydney</option>
                <option value="Pacific/Auckland">Auckland</option>
              </select>
              <div className="mt-4">
                <button
                  onClick={handleSave}
                  type="button"
                  className="btn btn-primary"
                >
                  Save Timezone
                </button>
              </div>
            </div>

            {/* Dietary Preferences */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Dietary Preferences
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select your dietary needs. Activities matching these preferences
                will be highlighted when browsing dining options.
              </p>
              <DietaryTagSelector
                selectedTags={dietaryPreferences}
                onChange={setDietaryPreferences}
                showLabels={true}
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
            <TravelPartnerSettings />

            {/* Appearance */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Appearance
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Customize the visual appearance of the application.
              </p>
              <div className="space-y-4">
                {/* Theme Toggle */}
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      Dark Mode
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Switch between light and dark color schemes
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className={`
                      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                      transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      ${theme === "dark" ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"}
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
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Use themed map tiles that match the app's look
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCustomMapStyle}
                    className={`
                      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                      transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      ${useCustomMapStyle ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"}
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
        )}

        {/* Tags & Categories Tab */}
        {activeTab === "tags-categories" && (
          <div className="space-y-6">
            {/* Activity Categories */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Activity Categories
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Customize the activity categories available when creating
                activities in your trips. Each category requires a name and an
                emoji.
              </p>

              {/* Add New Category */}
              <div className="flex gap-2 mb-4">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3">
                  <EmojiPicker
                    value={newCategoryEmoji}
                    onChange={setNewCategoryEmoji}
                  />
                </div>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  placeholder="New category name"
                  className="input flex-1"
                />
                <button
                  onClick={handleAddCategory}
                  type="button"
                  className="btn btn-primary"
                >
                  Add Category
                </button>
              </div>

              {/* Categories List */}
              <div className="space-y-2">
                {categories.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No categories yet. Add your first category above.
                  </p>
                ) : (
                  categories.map((category, index) => (
                    <div
                      key={category.name}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleMoveCategoryUp(index)}
                            type="button"
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                            title="Move up"
                            aria-label={`Move ${category.name} up`}
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveCategoryDown(index)}
                            type="button"
                            disabled={index === categories.length - 1}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                            title="Move down"
                            aria-label={`Move ${category.name} down`}
                          >
                            ▼
                          </button>
                        </div>
                        <EmojiPicker
                          value={category.emoji}
                          onChange={(emoji) =>
                            handleUpdateCategoryEmoji(category.name, emoji)
                          }
                        />
                        {editingCategoryName === category.name ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingCategoryNewName}
                              onChange={(e) =>
                                setEditingCategoryNewName(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleSaveRenameCategory(category.name);
                                if (e.key === "Escape")
                                  handleCancelRenameCategory();
                              }}
                              className="input flex-1"
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                handleSaveRenameCategory(category.name)
                              }
                              type="button"
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelRenameCategory}
                              type="button"
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className="text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                            onClick={() =>
                              handleStartRenameCategory(category.name)
                            }
                            title="Click to rename"
                          >
                            {category.name}
                          </span>
                        )}
                      </div>
                      {editingCategoryName !== category.name && (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleStartRenameCategory(category.name)
                            }
                            type="button"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(category.name)}
                            type="button"
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Save Button */}
              <div className="mt-6">
                <button
                  onClick={handleSave}
                  type="button"
                  className="btn btn-primary"
                >
                  Save Settings
                </button>
              </div>
            </div>

            {/* Trip Types */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Trip Types
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Customize the trip types available when creating trips. Each
                type requires a name and an emoji.
              </p>

              {/* Add New Trip Type */}
              <div className="flex gap-2 mb-4">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3">
                  <EmojiPicker
                    value={newTripTypeEmoji}
                    onChange={setNewTripTypeEmoji}
                  />
                </div>
                <input
                  type="text"
                  value={newTripType}
                  onChange={(e) => setNewTripType(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTripType()}
                  placeholder="New trip type name"
                  className="input flex-1"
                />
                <button
                  onClick={handleAddTripType}
                  type="button"
                  className="btn btn-primary"
                >
                  Add Type
                </button>
              </div>

              {/* Trip Types List */}
              <div className="space-y-2">
                {tripTypes.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No trip types yet. Add your first trip type above.
                  </p>
                ) : (
                  tripTypes.map((tripType, index) => (
                    <div
                      key={tripType.name}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleMoveTripTypeUp(index)}
                            type="button"
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => handleMoveTripTypeDown(index)}
                            type="button"
                            disabled={index === tripTypes.length - 1}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <EmojiPicker
                          value={tripType.emoji}
                          onChange={(emoji) =>
                            handleUpdateTripTypeEmoji(tripType.name, emoji)
                          }
                        />
                        {editingTripTypeName === tripType.name ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingTripTypeNewName}
                              onChange={(e) =>
                                setEditingTripTypeNewName(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleSaveRenameTripType(tripType.name);
                                if (e.key === "Escape")
                                  handleCancelRenameTripType();
                              }}
                              className="input flex-1"
                              autoFocus
                            />
                            <button
                              onClick={() =>
                                handleSaveRenameTripType(tripType.name)
                              }
                              type="button"
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelRenameTripType}
                              type="button"
                              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className="text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                            onClick={() =>
                              handleStartRenameTripType(tripType.name)
                            }
                            title="Click to rename"
                          >
                            {tripType.name}
                          </span>
                        )}
                      </div>
                      {editingTripTypeName !== tripType.name && (
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleStartRenameTripType(tripType.name)
                            }
                            type="button"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() =>
                              handleRemoveTripType(tripType.name)
                            }
                            type="button"
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Save Button */}
              <div className="mt-6">
                <button
                  onClick={handleSaveTripTypes}
                  type="button"
                  className="btn btn-primary"
                >
                  Save Trip Types
                </button>
              </div>
            </div>

            {/* Global Tag Management */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Trip Tags
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Create and manage tags that can be assigned to trips. Tags help
                organize and categorize your trips.
              </p>

              {/* Create New Tag */}
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  placeholder="New tag name"
                  className="input w-full"
                />
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      htmlFor={newTagColorId}
                    >
                      Background Color
                    </label>
                    <input
                      type="color"
                      id={newTagColorId}
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      htmlFor={newTagTextColorId}
                    >
                      Text Color
                    </label>
                    <input
                      type="color"
                      id={newTagTextColorId}
                      value={newTagTextColor}
                      onChange={(e) => setNewTagTextColor(e.target.value)}
                      className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateTag}
                  type="button"
                  className="btn btn-primary w-full"
                >
                  Create Tag
                </button>
              </div>

              {/* Tags List */}
              <div className="space-y-2">
                {tags.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No tags yet. Create your first tag above.
                  </p>
                ) : (
                  tags.map((tag, index) => (
                    <div
                      key={tag.id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
                    >
                      {editingTagId === tag.id ? (
                        // Edit colors mode
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span
                              className="px-3 py-1 rounded-full text-sm font-medium"
                              style={{
                                backgroundColor: editingTagColor,
                                color: editingTagTextColor,
                              }}
                            >
                              {tag.name}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              (Preview)
                            </span>
                          </div>
                          <div className="flex gap-4">
                            <div className="flex-1">
                              <label
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                htmlFor={`edit-tag-bg-${tag.id}`}
                              >
                                Background Color
                              </label>
                              <input
                                type="color"
                                id={`edit-tag-bg-${tag.id}`}
                                value={editingTagColor}
                                onChange={(e) =>
                                  setEditingTagColor(e.target.value)
                                }
                                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                              />
                            </div>
                            <div className="flex-1">
                              <label
                                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                htmlFor={`edit-tag-text-${tag.id}`}
                              >
                                Text Color
                              </label>
                              <input
                                type="color"
                                id={`edit-tag-text-${tag.id}`}
                                value={editingTagTextColor}
                                onChange={(e) =>
                                  setEditingTagTextColor(e.target.value)
                                }
                                className="h-10 w-full rounded border border-gray-300 dark:border-gray-600"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTagColors(tag.id)}
                              type="button"
                              className="btn btn-primary text-sm"
                            >
                              Save Colors
                            </button>
                            <button
                              onClick={handleCancelEditTag}
                              type="button"
                              className="btn btn-secondary text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : editingTagName === tag.id ? (
                        // Rename mode
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMoveTagUp(index)}
                              type="button"
                              disabled={index === 0}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => handleMoveTagDown(index)}
                              type="button"
                              disabled={index === tags.length - 1}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                              title="Move down"
                            >
                              ▼
                            </button>
                          </div>
                          <span
                            className="px-3 py-1 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: tag.color || "#3B82F6",
                              color: tag.textColor || "#FFFFFF",
                            }}
                          >
                            {editingTagNewName || tag.name}
                          </span>
                          <input
                            type="text"
                            value={editingTagNewName}
                            onChange={(e) =>
                              setEditingTagNewName(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleSaveRenameTag(tag.id);
                              if (e.key === "Escape")
                                handleCancelRenameTag();
                            }}
                            className="input flex-1"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveRenameTag(tag.id)}
                            type="button"
                            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelRenameTag}
                            type="button"
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        // View mode
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <button
                                onClick={() => handleMoveTagUp(index)}
                                type="button"
                                disabled={index === 0}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => handleMoveTagDown(index)}
                                type="button"
                                disabled={index === tags.length - 1}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs leading-none"
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>
                            <span
                              className="px-3 py-1 rounded-full text-sm font-medium cursor-pointer"
                              style={{
                                backgroundColor: tag.color || "#3B82F6",
                                color: tag.textColor || "#FFFFFF",
                              }}
                              onClick={() => handleStartRenameTag(tag)}
                              title="Click to rename"
                            >
                              {tag.name}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleStartRenameTag(tag)}
                              type="button"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => handleStartEditTag(tag)}
                              type="button"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                            >
                              Edit Colors
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id)}
                              type="button"
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Travel Documents Tab */}
        {activeTab === "documents" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <TravelDocumentManager />
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === "integrations" && (
          <div className="space-y-6">
            {/* Email (SMTP) Settings */}
            <SmtpSettings />

            {/* Immich Integration */}
            <ImmichSettings />

            {/* Weather Settings */}
            <WeatherSettings />

            {/* Aviationstack Settings */}
            <AviationstackSettings />

            {/* OpenRouteService Settings */}
            <OpenRouteServiceSettings />
          </div>
        )}

        {/* Invite Users Tab */}
        {activeTab === "invites" && <InviteUsersSection />}

        {/* Backup & Restore Tab */}
        {activeTab === "backup" && (
          <div className="space-y-6">
            {/* Create Backup */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Create Backup
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Download a complete backup of all your travel data including
                trips, photos, locations, activities, journal entries, and more.
                The backup is saved as a JSON file that you can store safely.
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Restore from Backup
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Upload a backup file to restore your data. You can choose to
                replace all existing data or merge the backup with your current
                data.
              </p>

              {/* Warning */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  ⚠️ Important Warning
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  If you choose "Clear existing data", ALL your current data
                  will be permanently deleted and replaced with the backup. This
                  action cannot be undone. Make sure you have a recent backup
                  before proceeding.
                </p>
              </div>

              {/* File Selection */}
              <div className="mb-4">
                <label
                  htmlFor="backup-file-input"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Select Backup File
                </label>
                <input
                  id="backup-file-input"
                  type="file"
                  accept=".json"
                  onChange={handleBackupFileSelect}
                  className="block w-full text-sm text-gray-900 dark:text-gray-100
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    dark:file:bg-blue-900 dark:file:text-blue-100
                    dark:hover:file:bg-blue-800"
                />
                {selectedBackupFile && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
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
                      dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-400"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
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
                      dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-400"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Backup Best Practices
              </h2>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
                <li>
                  Create regular backups, especially before making major changes
                </li>
                <li>
                  Store backup files in a safe location (cloud storage, external
                  drive)
                </li>
                <li>
                  Keep multiple backup versions in case you need to restore to
                  an earlier state
                </li>
                <li>
                  Test your backups by restoring to a test account if possible
                </li>
                <li>
                  Photo files are not included in backups - back them up
                  separately
                </li>
                <li>Immich photo references are preserved in backups</li>
              </ul>
            </div>
          </div>
        )}

        <ConfirmDialogComponent />
      </main>
    </div>
  );
}
