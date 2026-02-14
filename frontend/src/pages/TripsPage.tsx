import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import tripService from '../services/trip.service';
import tagService from '../services/tag.service';
import userService from '../services/user.service';
import type { Trip, TripListResponse, TripStatusType } from '../types/trip';
import type { TripTag } from '../types/tag';
import type { TripTypeCategory } from '../types/user';
import { TripStatus } from '../types/trip';
import toast from 'react-hot-toast';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useScrollStore } from '../store/scrollStore';

// Import reusable components
import EmptyState, { EmptyIllustrations } from '../components/EmptyState';
import { SkeletonGrid } from '../components/Skeleton';
import { SearchIcon, FilterIcon, CloseIcon } from '../components/icons';
import TripCard from '../components/TripCard';
import TripsKanbanView from '../components/TripsKanbanView';
import TripListView from '../components/TripListView';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import type { MultiSelectOption } from '../components/MultiSelectDropdown';

type SortOption = 'startDate-desc' | 'startDate-asc' | 'title-asc' | 'title-desc' | 'status';
type ViewMode = 'grid' | 'kanban' | 'list';

export default function TripsPage() {
  const queryClient = useQueryClient();
  const [allTags, setAllTags] = useState<TripTag[]>([]);
  const [allTripTypes, setAllTripTypes] = useState<TripTypeCategory[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [tripTypeFilter, setTripTypeFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [startDateFrom, setStartDateFrom] = useState('');
  const [startDateTo, setStartDateTo] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('startDate-desc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [coverPhotoUrls, setCoverPhotoUrls] = useState<{ [key: number]: string }>({});
  // Initialize currentPage from stored value - need to call hook at top level
  const initialPage = useScrollStore((state) => state.pageNumbers['trips-page'] || 1);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortColumn, setSortColumn] = useState<string>('startDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  // Use ref to track blob URLs for proper cleanup (avoids stale closure issues)
  const blobUrlsRef = useRef<string[]>([]);

  // Debounce search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Grid/kanban uses 24 (divisible by 2-col and 3-col layouts to avoid partial rows)
  const pageSize = viewMode === 'list' ? 40 : 24;

  const params = {
    page: currentPage,
    limit: pageSize,
    status: statusFilter.join(','),
    tripType: tripTypeFilter.join(','),
    search: debouncedSearchQuery.trim(),
    startDateFrom,
    startDateTo,
    tags: selectedTags.join(','),
    sort: sortOption,
  };

  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value != null)
  );

  const { data: tripsData, isLoading: loading } = useQuery({
    queryKey: ['trips', queryParams],
    queryFn: () => tripService.getTrips(queryParams),
    placeholderData: (previousData) => previousData,
  });

  const { trips = [], totalPages = 1, total: totalTrips = 0 } = tripsData || {};

  // Scroll and pagination position management
  const { savePosition, getPosition, savePageNumber, setSkipNextScrollToTop } = useScrollStore();
  const SCROLL_KEY = 'trips-page';

  // Track if we've restored scroll position (to avoid restoring on every data load)
  const hasRestoredScroll = useRef(false);

  // Restore scroll position after data loads
  useEffect(() => {
    const savedPosition = getPosition(SCROLL_KEY);
    if (savedPosition > 0 && !loading && !hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      // Use requestAnimationFrame to ensure DOM is ready after render
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    }
    // getPosition is stable from Zustand store, safe to include
  }, [getPosition, loading]);

  // Continuously save scroll position so back button navigation works
  useEffect(() => {
    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        savePosition(SCROLL_KEY, window.scrollY);
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [savePosition]);

  // Save page number whenever it changes so back button restores correct page
  useEffect(() => {
    savePageNumber(SCROLL_KEY, currentPage);
  }, [currentPage, savePageNumber]);

  // Save scroll position and page number before navigating away
  const handleNavigateAway = useCallback(() => {
    savePosition(SCROLL_KEY, window.scrollY);
    savePageNumber(SCROLL_KEY, currentPage);
    setSkipNextScrollToTop(true);
  }, [savePosition, savePageNumber, currentPage, setSkipNextScrollToTop]);

  // Handle page change with scroll to top
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const deleteTripMutation = useMutation({
    mutationFn: tripService.deleteTrip,
    onMutate: async (deletedTripId: number) => {
      await queryClient.cancelQueries({ queryKey: ['trips'] });
      const previousTripsData = queryClient.getQueryData<TripListResponse>(['trips', queryParams]);

      queryClient.setQueryData(['trips', queryParams], (oldData: TripListResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          trips: oldData.trips.filter((trip: Trip) => trip.id !== deletedTripId),
          total: oldData.total - 1,
        };
      });

      return { previousTripsData };
    },
    onError: (err, variables, context) => {
      if (context?.previousTripsData) {
        queryClient.setQueryData(['trips', queryParams], context.previousTripsData);
      }
      toast.error('Failed to delete trip. Please try again.');
    },
    onSuccess: (data, deletedTripId) => {
      toast.success('Trip deleted.', {
        id: `delete-trip-${deletedTripId}`,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });

  // Mutation for updating trip status (used by Kanban view)
  const updateTripStatusMutation = useMutation({
    mutationFn: async ({ tripId, status }: { tripId: number; status: TripStatusType }) => {
      return tripService.updateTrip(tripId, { status });
    },
    onMutate: async ({ tripId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['trips'] });
      const previousTripsData = queryClient.getQueryData<TripListResponse>(['trips', queryParams]);

      queryClient.setQueryData(['trips', queryParams], (oldData: TripListResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          trips: oldData.trips.map((trip: Trip) =>
            trip.id === tripId ? { ...trip, status } : trip
          ),
        };
      });

      return { previousTripsData };
    },
    onError: (err, variables, context) => {
      if (context?.previousTripsData) {
        queryClient.setQueryData(['trips', queryParams], context.previousTripsData);
      }
      toast.error('Failed to update trip status.');
    },
    onSuccess: () => {
      toast.success('Trip status updated.');
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      // Also invalidate the individual trip query so TripDetailPage gets updated
      queryClient.invalidateQueries({ queryKey: ['trip', variables.tripId] });
    },
  });

  // Handler for Kanban status change
  const handleStatusChange = async (tripId: number, newStatus: TripStatusType) => {
    await updateTripStatusMutation.mutateAsync({ tripId, status: newStatus });
  };

  // Load tags and trip types once on mount
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await tagService.getAllTags();
        setAllTags(tags);
      } catch {
        console.error('Failed to load tags');
      }
    };
    const loadTripTypes = async () => {
      try {
        const user = await userService.getMe();
        setAllTripTypes(user.tripTypes || []);
      } catch {
        console.error('Failed to load trip types');
      }
    };
    loadTags();
    loadTripTypes();
  }, []);

  // Load cover photos with authentication for Immich photos
  useEffect(() => {
    const loadCoverPhotos = async () => {
      const token = getAccessToken();
      if (!token) return;

      const urls: { [key: number]: string } = {};
      const newBlobUrls: string[] = [];

      for (const trip of trips) {
        if (!trip.coverPhoto) continue;

        const photo = trip.coverPhoto;

        // Local photo - use direct URL
        if (photo.source === 'local' && photo.thumbnailPath) {
          urls[trip.id] = getFullAssetUrl(photo.thumbnailPath) || "";
        }
        // Immich photo - fetch with auth
        else if (photo.source === 'immich' && photo.thumbnailPath) {
          try {
            const fullUrl = getFullAssetUrl(photo.thumbnailPath);
            if (!fullUrl) continue;

            const response = await fetch(fullUrl, {
              headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
              const blob = await response.blob();
              const blobUrl = URL.createObjectURL(blob);
              urls[trip.id] = blobUrl;
              newBlobUrls.push(blobUrl);
            }
          } catch (error) {
            console.error(`Failed to load cover photo for trip ${trip.id}:`, error);
          }
        }
      }

      // Store blob URLs in ref for cleanup
      blobUrlsRef.current = newBlobUrls;
      setCoverPhotoUrls(urls);
    };

    if (trips.length > 0) {
      loadCoverPhotos();
    }

    // Cleanup blob URLs using ref (avoids stale closure)
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, [trips]);

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: 'Delete Trip',
      message: 'Are you sure you want to delete this trip? This will remove all associated locations, photos, transportation, lodging, activities, and journal entries.',
      confirmLabel: 'Delete Trip',
      variant: 'danger',
    });

    if (!confirmed) return;

    deleteTripMutation.mutate(id);
  };

  // All filtering and sorting is now handled by the backend
  // No client-side filtering needed - just use the trips directly
  const filteredTrips = trips;

  const toggleTagFilter = (tagId: number) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
    setCurrentPage(1); // Reset to page 1 when tags change
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStartDateFrom('');
    setStartDateTo('');
    setSelectedTags([]);
    setStatusFilter([]);
    setTripTypeFilter([]);
    setSortOption('startDate-desc');
    setCurrentPage(1);
  };

  // Reset to page 1 when filters change
  const handleStatusFilterChange = (values: string[]) => {
    setStatusFilter(values);
    setCurrentPage(1);
  };

  const handleTripTypeFilterChange = (values: string[]) => {
    setTripTypeFilter(values);
    setCurrentPage(1);
  };

  // Helper to handle filter changes that should reset to page 1
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleStartDateFromChange = (value: string) => {
    setStartDateFrom(value);
    setCurrentPage(1);
  };

  const handleStartDateToChange = (value: string) => {
    setStartDateTo(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: SortOption) => {
    setSortOption(value);
    setCurrentPage(1);
  };

  const handleColumnSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Reset to page 1 when view mode changes
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode]);

  // Build dropdown options for filters
  const statusOptions: MultiSelectOption[] = useMemo(
    () => Object.values(TripStatus).map((status) => ({ value: status, label: status })),
    []
  );

  const tripTypeOptions: MultiSelectOption[] = useMemo(
    () => allTripTypes.map((t) => ({ value: t.name, label: t.name, emoji: t.emoji })),
    [allTripTypes]
  );

  const hasActiveFilters = searchQuery || startDateFrom || startDateTo || selectedTags.length > 0 || statusFilter.length > 0 || tripTypeFilter.length > 0;

  // Render pagination controls (used at both top and bottom)
  const renderPaginationControls = (position: 'top' | 'bottom') => {
    if (loading || totalPages <= 1) return null;

    return (
      <div className={`flex justify-center items-center gap-2 ${position === 'top' ? 'mb-6' : 'mt-8'}`}>
        <button
          type="button"
          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-600 disabled:hover:bg-parchment dark:disabled:hover:bg-navy-700"
        >
          Previous
        </button>

        <div className="flex gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
            // Show first page, last page, current page, and pages around current
            const showPage = page === 1 ||
                            page === totalPages ||
                            (page >= currentPage - 1 && page <= currentPage + 1);

            // Show ellipsis
            const showEllipsisBefore = page === currentPage - 2 && currentPage > 3;
            const showEllipsisAfter = page === currentPage + 2 && currentPage < totalPages - 2;

            if (!showPage && !showEllipsisBefore && !showEllipsisAfter) {
              return null;
            }

            if (showEllipsisBefore || showEllipsisAfter) {
              return (
                <span key={`${position}-ellipsis-${page}`} className="px-2 py-2 text-slate dark:text-warm-gray">
                  ...
                </span>
              );
            }

            return (
              <button
                type="button"
                key={`${position}-page-${page}`}
                onClick={() => handlePageChange(page)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  currentPage === page
                    ? 'bg-primary-600 dark:bg-sky text-white dark:text-navy-900'
                    : 'bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-600'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-600 disabled:hover:bg-parchment dark:disabled:hover:bg-navy-700"
        >
          Next
        </button>
      </div>
    );
  };

  return (
    <div className="bg-cream dark:bg-navy-900 min-h-screen">
      <ConfirmDialogComponent />
      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h2 className="text-3xl font-bold text-charcoal dark:text-warm-gray font-display">My Trips</h2>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title="Grid View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title="List View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title="Kanban View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </button>
            </div>
            <Link to="/trips/new" className="btn btn-primary">
              + New Trip
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="relative z-30 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm p-4 rounded-xl border-2 border-primary-500/10 dark:border-sky/10 mb-6 space-y-4">
          {/* Search and Sort Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate/50 dark:text-warm-gray/50" />
              <input
                type="text"
                placeholder="Search trips..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-parchment dark:bg-navy-700 text-charcoal dark:text-warm-gray placeholder-slate/50 dark:placeholder-warm-gray/50 border-2 border-transparent focus:border-primary-500 dark:focus:border-sky focus:outline-none transition-colors"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortOption}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              aria-label="Sort trips by"
              className="px-4 py-2.5 rounded-lg bg-parchment dark:bg-navy-700 text-charcoal dark:text-warm-gray border-2 border-transparent focus:border-primary-500 dark:focus:border-sky focus:outline-none transition-colors cursor-pointer"
            >
              <option value="startDate-desc">Newest First</option>
              <option value="startDate-asc">Oldest First</option>
              <option value="title-asc">Title A-Z</option>
              <option value="title-desc">Title Z-A</option>
              <option value="status">By Status</option>
            </select>

            {/* Advanced Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all ${
                showAdvancedFilters || hasActiveFilters
                  ? 'bg-primary-600 dark:bg-sky text-white dark:text-navy-900'
                  : 'bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-600'
              }`}
            >
              <FilterIcon className="w-5 h-5" />
              Filters
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-accent-400 dark:bg-gold" />
              )}
            </button>
          </div>

          {/* Status & Trip Type Filter Dropdowns */}
          <div className="flex gap-3 flex-wrap">
            <MultiSelectDropdown
              options={statusOptions}
              selected={statusFilter}
              onChange={handleStatusFilterChange}
              placeholder="All Statuses"
            />
            {tripTypeOptions.length > 0 && (
              <MultiSelectDropdown
                options={tripTypeOptions}
                selected={tripTypeFilter}
                onChange={handleTripTypeFilterChange}
                placeholder="All Types"
              />
            )}
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="pt-4 border-t-2 border-primary-500/10 dark:border-sky/10 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Date Range */}
                <div>
                  <label htmlFor="startDateFrom" className="block text-sm font-medium text-slate dark:text-warm-gray mb-1.5">
                    Start Date From
                  </label>
                  <input
                    type="date"
                    id="startDateFrom"
                    value={startDateFrom}
                    onChange={(e) => handleStartDateFromChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-parchment dark:bg-navy-700 text-charcoal dark:text-warm-gray border-2 border-transparent focus:border-primary-500 dark:focus:border-sky focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="startDateTo" className="block text-sm font-medium text-slate dark:text-warm-gray mb-1.5">
                    Start Date To
                  </label>
                  <input
                    type="date"
                    id="startDateTo"
                    value={startDateTo}
                    onChange={(e) => handleStartDateToChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-parchment dark:bg-navy-700 text-charcoal dark:text-warm-gray border-2 border-transparent focus:border-primary-500 dark:focus:border-sky focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Tag Filters */}
              {allTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate dark:text-warm-gray mb-2">
                    Filter by Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <button
                        type="button"
                        key={tag.id}
                        onClick={() => toggleTagFilter(tag.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all tag-colored ${
                          selectedTags.includes(tag.id)
                            ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-sky'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        // Dynamic tag colors require CSS variables - cannot be moved to static CSS
                        style={{
                          '--tag-bg-color': tag.color,
                          '--tag-text-color': tag.textColor,
                        }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-primary-600 dark:text-sky hover:text-primary-700 dark:hover:text-sky/80 font-medium flex items-center gap-1"
                >
                  <CloseIcon className="w-4 h-4" />
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results Count */}
        {!loading && (
          <div className="mb-4 text-sm text-slate dark:text-warm-gray/70">
            Showing {filteredTrips.length} of {totalTrips} trips
            {hasActiveFilters && ' (filtered)'}
            {totalPages > 1 && ` - Page ${currentPage} of ${totalPages}`}
          </div>
        )}

        {/* Top Pagination Controls */}
        {renderPaginationControls('top')}

        {/* Trips Display */}
        {loading ? (
          <SkeletonGrid count={6} columns={3} hasImage />
        ) : filteredTrips.length === 0 ? (
          trips.length === 0 ? (
            <EmptyState
              icon={<EmptyIllustrations.NoTrips />}
              message="Your Adventure Begins Here"
              subMessage="Every great journey starts with a single step. Create your first trip to start planning, dreaming, and documenting your travels. From dream destinations to detailed itineraries - it all begins now."
              actionLabel="Plan Your First Adventure"
              actionHref="/trips/new"
            />
          ) : (
            <EmptyState
              icon="🔍"
              message="No Trips Match Your Filters"
              subMessage="Try adjusting your search terms, status filter, or selected tags to find what you're looking for."
              actionLabel="Clear All Filters"
              onAction={clearFilters}
            />
          )
        ) : viewMode === 'kanban' ? (
          /* Kanban View */
          <TripsKanbanView
            trips={filteredTrips}
            coverPhotoUrls={coverPhotoUrls}
            onStatusChange={handleStatusChange}
            onNavigateAway={handleNavigateAway}
          />
        ) : viewMode === 'list' ? (
          /* List View */
          <TripListView
            trips={filteredTrips}
            coverPhotoUrls={coverPhotoUrls}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onNavigateAway={handleNavigateAway}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleColumnSort}
          />
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                coverPhotoUrl={coverPhotoUrls[trip.id]}
                onDelete={handleDelete}
                showActions={true}
                onNavigateAway={handleNavigateAway}
              />
            ))}
          </div>
        )}

        {/* Bottom Pagination Controls */}
        {renderPaginationControls('bottom')}
      </main>
    </div>
  );
}
