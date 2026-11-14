import { useState, useEffect, useRef, useCallback } from 'react';
import { timezoneOptionsFor } from '../utils/timezone';
import TripLanguageSelector from '../components/TripLanguageSelector';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import tripService from '../services/trip.service';
import userService from '../services/user.service';
import shareService from '../services/share.service';
import type { ShareInfo } from '../services/share.service';
import { TripStatus, PrivacyLevel } from '../types/trip';
import type { Trip, TripStatusType, PrivacyLevelType } from '../types/trip';
import type { TripCoverSource } from '../lib/tripCover';
import type { TravelPartnerSettings, TripTypeCategory } from '../types/user';
import toast from 'react-hot-toast';
import { useConfetti } from '../hooks/useConfetti';
import { useScrollStore } from '../store/scrollStore';
import { useAuthStore } from '../store/authStore';
import MarkdownEditor from '../components/MarkdownEditor';
import TripCoverImageField from '../components/TripCoverImageField';
import { useNavigationBlock } from '../hooks/useNavigationBlock';

interface FormErrors {
  title?: string;
  endDate?: string;
}

export default function TripFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const { triggerConfetti } = useConfetti();
  const { setSkipNextScrollToTop } = useScrollStore();
  const currentUser = useAuthStore((state) => state.user);
  const originalStatusRef = useRef<TripStatusType | null>(null);

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState('');
  const [status, setStatus] = useState<TripStatusType>(TripStatus.PLANNING);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevelType>(PrivacyLevel.PRIVATE);
  const [excludeFromAutoShare, setExcludeFromAutoShare] = useState(false);
  const [tripType, setTripType] = useState<string>('');
  const [tripTypeEmoji, setTripTypeEmoji] = useState<string>('');
  const [userTripTypes, setUserTripTypes] = useState<TripTypeCategory[]>([]);
  const [travelPartnerSettings, setTravelPartnerSettings] = useState<TravelPartnerSettings | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [shareInfo, setShareInfo] = useState<ShareInfo>({ shareEnabled: false, shareToken: null, sharePath: null });
  const [cover, setCover] = useState<TripCoverSource>({});
  const [shareLoading, setShareLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  /**
   * Optional fields are collapsed on a new trip and always expanded when
   * editing — an edit is a deliberate visit to change one of them.
   */
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const optionalFieldsVisible = isEdit || showOptionalFields;

  // Track initial form values for dirty state detection
  const initialValuesRef = useRef({ title: '', description: '', startDate: '', endDate: '', timezone: '', status: TripStatus.PLANNING as string, privacyLevel: PrivacyLevel.PRIVATE as string, tripType: '', excludeFromAutoShare: false });
  const formSavedRef = useRef(false);

  const isDirty = useCallback(() => {
    const initial = initialValuesRef.current;
    return (
      title !== initial.title ||
      description !== initial.description ||
      startDate !== initial.startDate ||
      endDate !== initial.endDate ||
      timezone !== initial.timezone ||
      status !== initial.status ||
      privacyLevel !== initial.privacyLevel ||
      tripType !== initial.tripType ||
      excludeFromAutoShare !== initial.excludeFromAutoShare
    );
  }, [title, description, startDate, endDate, timezone, status, privacyLevel, tripType, excludeFromAutoShare]);

  // Warn before browser navigation (refresh, close tab) when form is dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty() && !formSavedRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Block in-app navigation when form is dirty
  const blocker = useNavigationBlock(isDirty() && !formSavedRef.current);

  const loadUserTripTypes = useCallback(async () => {
    try {
      const user = await userService.getMe();
      setUserTripTypes(user.tripTypes || []);
    } catch (error) {
      console.error('Failed to load trip types:', error);
    }
  }, []);

  const loadTravelPartnerSettings = useCallback(async () => {
    try {
      const settings = await userService.getTravelPartnerSettings();
      setTravelPartnerSettings(settings);
    } catch (error) {
      console.error('Failed to load travel partner settings:', error);
    }
  }, []);

  const loadTrip = useCallback(async (tripId: number) => {
    try {
      setLoading(true);
      const trip = await tripService.getTripById(tripId);

      const extractDate = (dateVal: string | Date | null) => {
        if (!dateVal) return '';
        const dateStr = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
        return dateStr.split('T')[0];
      };

      const loadedStartDate = extractDate(trip.startDate);
      const loadedEndDate = extractDate(trip.endDate);
      const loadedTimezone = trip.timezone || '';
      const loadedTripType = trip.tripType || '';

      setTitle(trip.title);
      setDescription(trip.description || '');
      setStartDate(loadedStartDate);
      setEndDate(loadedEndDate);
      setTimezone(loadedTimezone);
      setStatus(trip.status);
      setPrivacyLevel(trip.privacyLevel);
      setExcludeFromAutoShare(trip.excludeFromAutoShare || false);
      setTripType(loadedTripType);
      setTripTypeEmoji(trip.tripTypeEmoji || '');
      originalStatusRef.current = trip.status;
      setCover({
        coverImagePath: trip.coverImagePath,
        coverImageThumbnailPath: trip.coverImageThumbnailPath,
        coverPhoto: trip.coverPhoto,
      });

      // Share link state (the backend only returns shareToken to the owner)
      setIsOwner(currentUser?.id === trip.userId);
      setShareInfo({
        shareEnabled: trip.shareEnabled ?? false,
        shareToken: trip.shareToken ?? null,
        sharePath: trip.shareToken ? `/share/${trip.shareToken}` : null,
      });

      // Store initial values for dirty tracking
      initialValuesRef.current = {
        title: trip.title,
        description: trip.description || '',
        startDate: loadedStartDate,
        endDate: loadedEndDate,
        timezone: loadedTimezone,
        status: trip.status,
        privacyLevel: trip.privacyLevel,
        tripType: loadedTripType,
        excludeFromAutoShare: trip.excludeFromAutoShare || false,
      };
    } catch {
      toast.error('Failed to load trip');
      navigate('/trips');
    } finally {
      setLoading(false);
    }
  }, [navigate, currentUser]);

  // ---- Share link management (owner only) ----

  const shareUrl = shareInfo.shareToken
    ? `${window.location.origin}/share/${shareInfo.shareToken}`
    : null;

  const runShareAction = async (
    action: () => Promise<ShareInfo>,
    successMessage: string,
    errorMessage: string
  ) => {
    try {
      setShareLoading(true);
      const info = await action();
      setShareInfo(info);
      toast.success(successMessage);
    } catch {
      toast.error(errorMessage);
    } finally {
      setShareLoading(false);
    }
  };

  const handleEnableShare = () =>
    runShareAction(
      () => shareService.enableShare(parseInt(id as string)),
      'Sharing enabled',
      'Failed to enable sharing'
    );

  const handleRotateShare = () =>
    runShareAction(
      () => shareService.rotateShareToken(parseInt(id as string)),
      'New share link generated — the old link no longer works',
      'Failed to regenerate share link'
    );

  const handleDisableShare = () =>
    runShareAction(
      () => shareService.disableShare(parseInt(id as string)),
      'Sharing disabled',
      'Failed to disable sharing'
    );

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  /**
   * Cover changes are saved immediately by their own endpoints (like the share link
   * controls), so they bypass the form's submit handler and dirty tracking.
   */
  const handleCoverChange = (updatedTrip: Trip) => {
    setCover({
      coverImagePath: updatedTrip.coverImagePath,
      coverImageThumbnailPath: updatedTrip.coverImageThumbnailPath,
      coverPhoto: updatedTrip.coverPhoto,
    });
    queryClient.invalidateQueries({ queryKey: ['trips'] });
    if (id) {
      queryClient.invalidateQueries({ queryKey: ['trip', parseInt(id)] });
    }
  };

  useEffect(() => {
    if (isEdit && id) {
      loadTrip(parseInt(id));
    }
    if (!isEdit) {
      loadTravelPartnerSettings();
    }
    loadUserTripTypes();
  }, [id, isEdit, loadTrip, loadTravelPartnerSettings, loadUserTripTypes]);

  const validate = (): FormErrors => {
    const newErrors: FormErrors = {};
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (startDate && endDate && endDate < startDate) {
      newErrors.endDate = 'End date must be on or after start date';
    }
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    try {
      setLoading(true);

      // Convert dates preserving the selected date regardless of timezone
      const formatDate = (dateStr: string) => {
        if (!dateStr) return undefined;
        // Just send the date as-is (YYYY-MM-DD)
        // Backend should handle this as a date-only value
        return dateStr;
      };

      const data = {
        title,
        description: description || undefined,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        timezone: timezone || undefined,
        status,
        privacyLevel,
        excludeFromAutoShare,
        tripType: tripType || null,
        tripTypeEmoji: tripTypeEmoji || null,
      };

      formSavedRef.current = true;

      if (isEdit && id) {
        await tripService.updateTrip(parseInt(id), data);
        toast.success('Trip updated successfully');

        // Celebrate if trip status changed to COMPLETED
        const wasCompleted = originalStatusRef.current === TripStatus.COMPLETED;
        const isNowCompleted = status === TripStatus.COMPLETED;
        if (!wasCompleted && isNowCompleted) {
          triggerConfetti('trip');
        }
      } else {
        await tripService.createTrip(data);
        toast.success('Trip created successfully');
      }

      // Invalidate trips cache so the list refreshes
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
      // Also invalidate the specific trip detail cache so header/dates update
      if (isEdit && id) {
        await queryClient.invalidateQueries({ queryKey: ['trip', parseInt(id)] });
      }
      // When editing, restore trips page position; when creating, start fresh
      if (isEdit) {
        setSkipNextScrollToTop(true);
      }
      navigate('/trips');
    } catch (err: unknown) {
      formSavedRef.current = false;
      const error = err as import('axios').AxiosError<{ message?: string }>;
      toast.error(error.response?.data?.message || 'Failed to save trip');
    } finally {
      setLoading(false);
    }
  };

  // Clear inline errors as user fixes the fields
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (errors.title && value.trim()) {
      setErrors(prev => ({ ...prev, title: undefined }));
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (value && !endDate) {
      setEndDate(value);
    }
    if (errors.endDate) {
      setErrors(prev => ({ ...prev, endDate: undefined }));
    }
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (value && !startDate) {
      setStartDate(value);
    }
    if (errors.endDate) {
      setErrors(prev => ({ ...prev, endDate: undefined }));
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-dusk-900 min-h-screen">
      {/* Unsaved changes confirmation dialog for in-app navigation */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dusk-800 rounded-lg shadow-xl p-6 max-w-sm mx-4 border border-gray-200 dark:border-dusk-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unsaved Changes</h3>
            <p className="text-gray-600 dark:text-dusk-400 mb-4">
              You have unsaved changes. Are you sure you want to leave?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => blocker.reset?.()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-200 dark:hover:bg-dusk-600 transition-colors"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => blocker.proceed?.()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            &larr; Back
          </button>
          {isEdit && id && (
            <button
              type="button"
              onClick={() => navigate(`/trips/${id}`)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Trip
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6 border border-gray-200 dark:border-dusk-700">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-dusk-100">
            {isEdit ? 'Edit Trip' : 'New Trip'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="title" className="label">
                Title *
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className={`input ${errors.title ? 'border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500' : ''}`}
                placeholder="My Amazing Trip"
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? 'title-error' : undefined}
              />
              {errors.title && (
                <p id="title-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Status as chips rather than a select: it is the one other field
                worth answering up front, and chips show all the options
                without opening a picker. */}
            <div>
              <span className="label">Status</span>
              <div className="flex flex-wrap gap-2">
                {Object.values(TripStatus).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    aria-pressed={status === s}
                    className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                      status === s
                        ? 'bg-primary-500 dark:bg-gold border-primary-500 dark:border-gold text-white dark:text-navy-900'
                        : 'bg-white dark:bg-navy-800 border-gray-300 dark:border-dusk-600 text-gray-700 dark:text-dusk-300 hover:border-primary-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Everything below is optional. On a new trip it stays collapsed:
                only the name is actually required, and nine expanded fields put
                the submit button ~860px down the page. */}
            {!isEdit && (
              <button
                type="button"
                onClick={() => setShowOptionalFields((shown) => !shown)}
                aria-expanded={showOptionalFields}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-dusk-700 dark:text-dusk-300 dark:hover:bg-dusk-900/40"
              >
                <span>
                  {showOptionalFields ? 'Hide' : 'Add'} dates, description and more
                </span>
                <span aria-hidden="true">{showOptionalFields ? '▲' : '▼'}</span>
              </button>
            )}

            {optionalFieldsVisible && (
              <>
            <div>
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                rows={4}
                placeholder="Tell us about your trip..."
                label="Description"
              />
            </div>

            {/* Cover photo needs an existing trip to attach the upload to */}
            {isEdit && id && (
              <TripCoverImageField
                tripId={parseInt(id)}
                cover={cover}
                onChange={handleCoverChange}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="label">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="endDate" className="label">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className={`input ${errors.endDate ? 'border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500' : ''}`}
                  aria-invalid={!!errors.endDate}
                  aria-describedby={errors.endDate ? 'endDate-error' : undefined}
                />
                {errors.endDate && (
                  <p id="endDate-error" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                    {errors.endDate}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="timezone" className="label">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input"
              >
                <option value="">Use my default timezone</option>
                {timezoneOptionsFor(timezone).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                If not specified, your default timezone from settings will be used
              </p>
            </div>

            <div>
              <span className="label">Languages</span>
              {isEdit && id ? (
                <>
                  <TripLanguageSelector tripId={Number(id)} />
                  <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                    Languages are saved as you add them. They load the phrase book here and in the mobile app.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-dusk-400">
                  Save the trip first, then edit it to add languages for the phrase book.
                </p>
              )}
            </div>

            {userTripTypes.length > 0 && (
              <div>
                <label htmlFor="tripType" className="label">
                  Trip Type
                </label>
                <select
                  id="tripType"
                  value={tripType}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    setTripType(selectedName);
                    const found = userTripTypes.find((t) => t.name === selectedName);
                    setTripTypeEmoji(found ? found.emoji : '');
                  }}
                  className="input"
                >
                  <option value="">No trip type</option>
                  {userTripTypes.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.emoji} {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                  Categorize your trip. Manage trip types in Settings.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="privacyLevel" className="label">
                Privacy
              </label>
              <select
                id="privacyLevel"
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value as PrivacyLevelType)}
                className="input"
              >
                {Object.values(PrivacyLevel).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
              </>
            )}

            {/* Public share link (owner only, edit mode only) */}
            {isEdit && isOwner && (
              <div className="p-4 bg-gray-50 dark:bg-dusk-900/40 border border-gray-200 dark:border-dusk-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                      </svg>
                      Public share link
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1">
                      Anyone with the link can view a read-only version of this trip — no account needed.
                      Costs, confirmation numbers, and booking details are never shown.
                    </p>
                  </div>
                </div>

                {shareInfo.shareEnabled && shareUrl ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        onFocus={(e) => e.target.select()}
                        className="input flex-1 font-mono text-sm"
                        aria-label="Share link"
                      />
                      <button
                        type="button"
                        onClick={handleCopyShareUrl}
                        disabled={shareLoading}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Copy link
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleRotateShare}
                        disabled={shareLoading}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-gray-200 dark:hover:bg-dusk-600 transition-colors disabled:opacity-50"
                      >
                        Regenerate link
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableShare}
                        disabled={shareLoading}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        Disable sharing
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableShare}
                    disabled={shareLoading}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {shareLoading ? 'Enabling…' : 'Enable sharing'}
                  </button>
                )}
              </div>
            )}

            {/* Travel Partner Auto-Share Toggle - only show for new trips when partner is set */}
            {!isEdit && travelPartnerSettings?.travelPartner && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="excludeFromAutoShare"
                    checked={excludeFromAutoShare}
                    onChange={(e) => setExcludeFromAutoShare(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-dusk-600 dark:bg-dusk-700"
                  />
                  <div>
                    <label htmlFor="excludeFromAutoShare" className="font-medium text-gray-900 dark:text-white cursor-pointer">
                      Don't share with my travel partner
                    </label>
                    <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1">
                      This trip will not be automatically shared with{' '}
                      <span className="font-medium">{travelPartnerSettings.travelPartner.username}</span>.
                      You can still manually add them as a collaborator later.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Sticky on mobile so the primary action is reachable no matter
                how far the optional fields push the page down. `bottom-16`
                clears the bottom nav. */}
            <div className="flex gap-4 pt-4 sticky bottom-16 md:static bg-white dark:bg-dusk-800 pb-4 md:pb-0 -mx-6 px-6 md:mx-0 md:px-0 border-t border-gray-200 dark:border-dusk-700 md:border-0">
              <button
                type="submit"
                className="flex-1 btn btn-primary mt-4 md:mt-0"
                disabled={loading}
              >
                {loading ? 'Saving...' : isEdit ? 'Update Trip' : 'Begin Your Journey'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 btn btn-secondary mt-4 md:mt-0"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
