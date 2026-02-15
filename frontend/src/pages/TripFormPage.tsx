import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import tripService from '../services/trip.service';
import userService from '../services/user.service';
import { TripStatus, PrivacyLevel } from '../types/trip';
import type { TripStatusType, PrivacyLevelType } from '../types/trip';
import type { TravelPartnerSettings, TripTypeCategory } from '../types/user';
import toast from 'react-hot-toast';
import { useConfetti } from '../hooks/useConfetti';
import MarkdownEditor from '../components/MarkdownEditor';

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

  // Block in-app navigation (React Router) when form is dirty
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty() && !formSavedRef.current && currentLocation.pathname !== nextLocation.pathname
  );

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
  }, [navigate]);

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
    if (errors.endDate) {
      setErrors(prev => ({ ...prev, endDate: undefined }));
    }
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (errors.endDate) {
      setErrors(prev => ({ ...prev, endDate: undefined }));
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Unsaved changes confirmation dialog for in-app navigation */}
      {blocker.state === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unsaved Changes</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You have unsaved changes. Are you sure you want to leave?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => blocker.reset?.()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
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

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
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

            <div>
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                rows={4}
                placeholder="Tell us about your trip..."
                label="Description"
              />
            </div>

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
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">Eastern Time (US & Canada)</option>
                <option value="America/Chicago">Central Time (US & Canada)</option>
                <option value="America/Denver">Mountain Time (US & Canada)</option>
                <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                If not specified, your default timezone from settings will be used
              </p>
            </div>

            <div>
              <label htmlFor="status" className="label">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TripStatusType)}
                className="input"
              >
                {Object.values(TripStatus).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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

            {/* Travel Partner Auto-Share Toggle - only show for new trips when partner is set */}
            {!isEdit && travelPartnerSettings?.travelPartner && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="excludeFromAutoShare"
                    checked={excludeFromAutoShare}
                    onChange={(e) => setExcludeFromAutoShare(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <div>
                    <label htmlFor="excludeFromAutoShare" className="font-medium text-gray-900 dark:text-white cursor-pointer">
                      Don't share with my travel partner
                    </label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      This trip will not be automatically shared with{' '}
                      <span className="font-medium">{travelPartnerSettings.travelPartner.username}</span>.
                      You can still manually add them as a collaborator later.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 btn btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : isEdit ? 'Update Trip' : 'Create Trip'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 btn btn-secondary"
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
