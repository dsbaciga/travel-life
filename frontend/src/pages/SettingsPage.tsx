import { useEffect, useState, useRef, Suspense, lazy } from "react";
import { Link, useSearchParams } from "react-router";
import toast from "react-hot-toast";
import userService from "../services/user.service";
import tagService from "../services/tag.service";
import apiService from "../services/api.service";
import type { ActivityCategory, TripTypeCategory } from "../types/user";
import type { TripTag } from "../types/tag";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorBoundary from "../components/ErrorBoundary";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { getBrowserTimezone } from "../utils/timezone";
import AccountSettingsSection from "../components/settings/AccountSettingsSection";
import TagsAndCategoriesSection from "../components/settings/TagsAndCategoriesSection";
import BackupRestoreSection from "../components/settings/BackupRestoreSection";
import IntegrationsSection from "../components/settings/IntegrationsSection";

// Lazy-loaded heavy tab components (only loaded when their tab is active)
const TravelDocumentManager = lazy(
  () => import("../components/TravelDocumentManager")
);
const InviteUsersSection = lazy(
  () => import("../components/InviteUsersSection")
);

const TAB_VALUES = [
  "account",
  "tags-categories",
  "documents",
  "integrations",
  "invites",
  "backup",
] as const;
type TabType = (typeof TAB_VALUES)[number];

function isTabType(s: string | null): s is TabType {
  return s !== null && TAB_VALUES.some((v) => v === s);
}

export default function SettingsPage() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial tab from URL or default to 'account'
  const tabParam = searchParams.get("tab");
  const initialTab: TabType = isTabType(tabParam) ? tabParam : "account";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tripTypes, setTripTypes] = useState<TripTypeCategory[]>([]);
  // Categories and trip types are edited locally and only persisted by the
  // section's Save button. Rename/delete hit the server immediately (they also
  // rewrite the activities/trips using the old name), so we track which names
  // the server actually knows about — calling those endpoints for a name that
  // was only added locally would be a no-op that discards the local addition.
  const persistedCategoryNames = useRef<Set<string>>(new Set());
  const persistedTripTypeNames = useRef<Set<string>>(new Set());
  // Seeded from the browser so a user who has never picked one sees their own
  // zone preselected rather than UTC.
  const [timezone, setTimezone] = useState(getBrowserTimezone);
  // "" means no home currency chosen — budget totals then fall back to each
  // trip's own budget currency.
  const [baseCurrency, setBaseCurrency] = useState("");
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [tags, setTags] = useState<TripTag[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [useCustomMapStyle, setUseCustomMapStyle] = useState(true);
  const [backendVersion, setBackendVersion] = useState<string>("");

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
      persistedCategoryNames.current = new Set(
        (user.activityCategories || []).map((c) => c.name)
      );
      persistedTripTypeNames.current = new Set(
        (user.tripTypes || []).map((t) => t.name)
      );
      setTimezone(user.timezone || getBrowserTimezone());
      setBaseCurrency(user.baseCurrency || "");
      setDietaryPreferences(user.dietaryPreferences || []);
      setUseCustomMapStyle(user.useCustomMapStyle ?? true);
      setUsername(user.username);
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

  const handleSave = async () => {
    try {
      await userService.updateSettings({
        activityCategories: categories,
        timezone,
        dietaryPreferences,
      });
      persistedCategoryNames.current = new Set(categories.map((c) => c.name));
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">Loading</div>
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
              <span className="font-mono">{backendVersion || "Loading"}</span>
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
            onChange={(e) => {
              if (isTabType(e.target.value)) handleTabChange(e.target.value);
            }}
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
          <AccountSettingsSection
            username={username}
            onUsernameChange={setUsername}
            timezone={timezone}
            onTimezoneChange={setTimezone}
            onSaveSettings={handleSave}
            baseCurrency={baseCurrency}
            onBaseCurrencyChange={setBaseCurrency}
            dietaryPreferences={dietaryPreferences}
            onDietaryPreferencesChange={setDietaryPreferences}
            useCustomMapStyle={useCustomMapStyle}
            onCustomMapStyleChange={setUseCustomMapStyle}
          />
        )}

        {/* Tags & Categories Tab */}
        {activeTab === "tags-categories" && (
          <TagsAndCategoriesSection
            categories={categories}
            onCategoriesChange={setCategories}
            persistedCategoryNames={persistedCategoryNames}
            onSaveCategories={handleSave}
            tripTypes={tripTypes}
            onTripTypesChange={setTripTypes}
            persistedTripTypeNames={persistedTripTypeNames}
            tags={tags}
            onTagsChange={setTags}
            onReloadTags={loadTags}
            confirm={confirm}
          />
        )}

        {/* Travel Documents Tab */}
        {activeTab === "documents" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <ErrorBoundary>
              <Suspense
                fallback={
                  <LoadingSpinner.FullPage message="Loading documents..." />
                }
              >
                <TravelDocumentManager />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === "integrations" && <IntegrationsSection />}

        {/* Invite Users Tab */}
        {activeTab === "invites" && (
          <ErrorBoundary>
            <Suspense
              fallback={
                <LoadingSpinner.FullPage message="Loading invitations..." />
              }
            >
              <InviteUsersSection />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* Backup & Restore Tab */}
        {activeTab === "backup" && <BackupRestoreSection confirm={confirm} />}

        <ConfirmDialogComponent />
      </main>
    </div>
  );
}
