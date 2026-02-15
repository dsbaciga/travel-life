import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useParams,
  useNavigate,
  Link,
  useSearchParams,
} from "react-router-dom";
import tripService from "../services/trip.service";
import locationService from "../services/location.service";
import photoService from "../services/photo.service";
import activityService from "../services/activity.service";
import transportationService from "../services/transportation.service";
import lodgingService from "../services/lodging.service";
import journalService from "../services/journalEntry.service";
import tagService from "../services/tag.service";
import companionService from "../services/companion.service";
import userService from "../services/user.service";
import checklistService from "../services/checklist.service";
import TripSeriesBadge from "../components/TripSeriesBadge";
import TripSeriesNav from "../components/TripSeriesNav";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import type { Photo } from "../types/photo";
import { TripStatus, type TripStatusType } from "../types/trip";
import toast from "react-hot-toast";
import PhotoGallery from "../components/PhotoGallery";
import PhotoUpload from "../components/PhotoUpload";
import PhotosMapView from "../components/PhotosMapView";
import AlbumSuggestions from "../components/AlbumSuggestions";
import Timeline from "../components/Timeline";
import { DailyView } from "../components/daily-view";
import TripMap from "../components/TripMap";
import PhotoTimeline from "../components/PhotoTimeline";
import ActivityManager from "../components/ActivityManager";
import UnscheduledItems from "../components/UnscheduledItems";
import TransportationManager from "../components/TransportationManager";
import LodgingManager from "../components/LodgingManager";
import JournalManager from "../components/JournalManager";
import CompanionManager from "../components/CompanionManager";
import LocationManager from "../components/LocationManager";
import CollaboratorsManager from "../components/CollaboratorsManager";
import Modal from "../components/Modal";
import collaborationService from "../services/collaboration.service";
import type { UserPermission } from "../types/collaboration";
import ErrorBoundary from "../components/ErrorBoundary";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import TagsModal from "../components/TagsModal";
import AlbumsSidebar from "../components/AlbumsSidebar";
import AlbumModal from "../components/AlbumModal";
import AddPhotosToAlbumModal from "../components/AddPhotosToAlbumModal";
import FloatingTripHeader from "../components/FloatingTripHeader";
import type { PhotoAlbum } from "../types/photo";
import { usePagedPagination } from "../hooks/usePagedPagination";
import Pagination from "../components/Pagination";
import { useScrollToHighlight } from "../hooks/useScrollToHighlight";
import { useSwipeGesture } from "../hooks/useSwipeGesture";
import Breadcrumbs from "../components/Breadcrumbs";
import TabGroup from "../components/TabGroup";
import type { TabGroupItem } from "../components/TabGroup";
import TripSidebar from "../components/TripSidebar";
import NavigationLayoutToggle from "../components/NavigationLayoutToggle";
import { useNavigationStore } from "../store/navigationStore";
import { TripDashboard } from "../components/trip-dashboard";
import {
  formatTripDates,
  getTripDateStatus,
  formatTripDuration,
} from "../utils/dateFormat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "../components/Skeleton";
import JetLagCalculator from "../components/JetLagCalculator";
import MarkdownRenderer from "../components/MarkdownRenderer";

// All possible tab IDs for the grouped navigation
type TabId =
  | "dashboard"
  | "timeline"
  | "daily"
  | "trip-map"
  | "locations"
  | "photos"
  | "photo-map"
  | "photo-timeline"
  | "journal"
  | "activities"
  | "transportation"
  | "lodging"
  | "unscheduled"
  | "companions";

export default function TripDetailPage() {
  const { id } = useParams();
  const tripId = parseInt(id!);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [userTimezone, setUserTimezone] = useState<string>("");
  
  // Album management state
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<PhotoAlbum | null>(null);
  const [showAlbumsMobileDrawer, setShowAlbumsMobileDrawer] = useState(false);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [filteredPhotos, setFilteredPhotos] = useState<Photo[]>([]);
  
  // Initialize activeTab from URL parameter or default to 'dashboard'
  const initialTab = (searchParams.get("tab") as TabId) || "dashboard";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Sync activeTab with URL when tab parameter changes externally (e.g., from EntityDetailModal navigation)
  useEffect(() => {
    const urlTab = searchParams.get("tab") as TabId | null;
    if (urlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams, activeTab]);

  // Enable scroll-to-highlight for entity link navigation
  // When navigating from LinkPanel with hash like #activity-123, scrolls to and highlights the item
  useScrollToHighlight({ scrollDelay: 300 });

  // Navigation layout preference (tabs vs sidebar)
  const { layout: navigationLayout } = useNavigationStore();

  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const coverBlobUrlRef = useRef<string | null>(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateTripTitle, setDuplicateTripTitle] = useState("");
  const [duplicateOptions, setDuplicateOptions] = useState({
    locations: true,
    photos: false,
    activities: true,
    transportation: false,
    lodging: false,
    journalEntries: false,
    photoAlbums: false,
    tags: true,
    companions: true,
    checklists: false,
  });
  const [showShareModal, setShowShareModal] = useState(false);
  const [userPermission, setUserPermission] = useState<UserPermission | null>(null);

  const { data: trip, isLoading: isTripLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => tripService.getTripById(tripId),
    enabled: !!tripId,
  });

  const { data: locations = [], isLoading: isLocationsLoading } = useQuery({
    queryKey: ['locations', tripId],
    queryFn: () => locationService.getLocationsByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: activitiesData, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ['activities', tripId],
    queryFn: () => activityService.getActivitiesByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: transportationData, isLoading: isTransportationLoading } = useQuery({
    queryKey: ['transportation', tripId],
    queryFn: () => transportationService.getTransportationByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: lodgingData, isLoading: isLodgingLoading } = useQuery({
    queryKey: ['lodging', tripId],
    queryFn: () => lodgingService.getLodgingByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: journalData, isLoading: isJournalLoading } = useQuery({
    queryKey: ['journal', tripId],
    queryFn: () => journalService.getJournalEntriesByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', tripId],
    queryFn: () => tagService.getTagsByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists', tripId],
    queryFn: () => checklistService.getChecklistsByTripId(tripId),
    enabled: !!tripId,
  });

  const { data: companionsData, isLoading: areCompanionsLoading } = useQuery({
    queryKey: ['companions', tripId],
    queryFn: () => companionService.getCompanionsByTrip(tripId),
    enabled: !!tripId,
  });

  const { data: albumsData, isLoading: areAlbumsLoading } = useQuery({
    queryKey: ['albums', tripId],
    queryFn: () => photoService.getAlbumsByTrip(tripId),
    enabled: !!tripId,
  });

  const { albums = [], unsortedCount: unsortedPhotosCount = 0, totalCount: totalPhotosCount = 0 } = albumsData || {};
  
  const activitiesCount = useMemo(() => activitiesData?.length || 0, [activitiesData]);
  const unscheduledActivitiesCount = useMemo(() => activitiesData?.filter(a => !a.startTime && !a.allDay).length || 0, [activitiesData]);
  const transportationCount = useMemo(() => transportationData?.length || 0, [transportationData]);
  const unscheduledTransportationCount = useMemo(() => transportationData?.filter(t => !t.departureTime).length || 0, [transportationData]);
  const lodgingCount = useMemo(() => lodgingData?.length || 0, [lodgingData]);
  const unscheduledLodgingCount = useMemo(() => lodgingData?.filter(l => !l.checkInDate).length || 0, [lodgingData]);
  const unscheduledCount = useMemo(() => unscheduledActivitiesCount + unscheduledTransportationCount + unscheduledLodgingCount, [unscheduledActivitiesCount, unscheduledTransportationCount, unscheduledLodgingCount]);
  const journalCount = useMemo(() => journalData?.length || 0, [journalData]);
  const tagsCount = useMemo(() => tags?.length || 0, [tags]);
  const companionsCount = useMemo(() => companionsData?.length || 0, [companionsData]);
  
  // Photo sorting state
  const sortByRef = useRef<string>("date");
  const sortOrderRef = useRef<string>("desc");

  // Ref for floating header observation
  const tripHeaderRef = useRef<HTMLDivElement>(null);

  // Pagination hooks - using paged pagination for memory efficiency
  const photosPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!trip) return { items: [], total: 0, hasMore: false };
      const result = await photoService.getPhotosByTrip(trip.id, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      return {
        items: result.photos,
        total: result.total || 0,
        hasMore: result.hasMore,
      };
    },
    { pageSize: 40 }
  );

  const unsortedPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!trip) return { items: [], total: 0, hasMore: false };
      const result = await photoService.getUnsortedPhotosByTrip(trip.id, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      return {
        items: result.photos,
        total: result.total || 0,
        hasMore: result.hasMore,
      };
    },
    { pageSize: 40 }
  );

  const albumPhotosPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!selectedAlbumId || selectedAlbumId <= 0)
        return { items: [], total: 0, hasMore: false };
      const result = await photoService.getAlbumById(selectedAlbumId, {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });
      const albumPhotos = result.photos.map((p) => p.photo);
      return {
        items: albumPhotos,
        total: result.total || 0,
        hasMore: result.hasMore || false,
      };
    },
    { pageSize: 40 }
  );

  // State for existing Immich asset IDs to exclude from Immich browser
  const [existingImmichAssetIds, setExistingImmichAssetIds] = useState<
    Set<string>
  >(new Set());

  // Fetch all existing Immich asset IDs for this trip
  const loadImmichAssetIds = async (tripId: number) => {
    try {
      const assetIds = await photoService.getImmichAssetIdsByTrip(tripId);
      setExistingImmichAssetIds(new Set(assetIds));
    } catch (error) {
      console.error("Failed to load Immich asset IDs:", error);
    }
  };

  // Handle photo sort change
  const handlePhotoSortChange = (sortBy: string, sortOrder: string) => {
    sortByRef.current = sortBy;
    sortOrderRef.current = sortOrder;

    // Reload photos based on current view
    if (selectedAlbumId === null) {
      photosPagination.clear();
      photosPagination.loadInitial();
    } else if (selectedAlbumId === -1) {
      unsortedPagination.clear();
      unsortedPagination.loadInitial();
    } else if (selectedAlbumId > 0) {
      albumPhotosPagination.clear();
      albumPhotosPagination.loadInitial();
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (id) {
      photoService.getImmichAssetIdsByTrip(tripId)
        .then(assetIds => { if (!cancelled) setExistingImmichAssetIds(new Set(assetIds)); })
        .catch(error => { if (!cancelled) console.error("Failed to load Immich asset IDs:", error); });
    }
    userService.getMe()
      .then(user => { if (!cancelled) setUserTimezone(user.timezone || ""); })
      .catch(() => { if (!cancelled) console.error("Failed to load user timezone"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load user's permission level for this trip
  useEffect(() => {
    let cancelled = false;
    if (tripId) {
      collaborationService.getPermissionLevel(tripId)
        .then(permission => { if (!cancelled) setUserPermission(permission); })
        .catch(() => { if (!cancelled) setUserPermission(null); });
    }
    return () => { cancelled = true; };
  }, [tripId]);

  // Function to change tabs and update URL
  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  }, [setSearchParams]);

  // Flat list of all tab IDs for swipe navigation (in display order)
  const allTabIds: TabId[] = useMemo(() => [
    "dashboard",
    "timeline",
    "daily",
    "trip-map",
    "activities",
    "transportation",
    "lodging",
    "unscheduled",
    "photos",
    "photo-map",
    "photo-timeline",
    "journal",
    "locations",
    "companions",
  ], []);

  // Navigate to previous/next tab for swipe gestures
  const navigateToPreviousTab = useCallback(() => {
    const currentIndex = allTabIds.indexOf(activeTab);
    if (currentIndex > 0) {
      changeTab(allTabIds[currentIndex - 1]);
    }
  }, [activeTab, allTabIds, changeTab]);

  const navigateToNextTab = useCallback(() => {
    const currentIndex = allTabIds.indexOf(activeTab);
    if (currentIndex < allTabIds.length - 1) {
      changeTab(allTabIds[currentIndex + 1]);
    }
  }, [activeTab, allTabIds, changeTab]);

  // Mobile swipe gestures for tab navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: navigateToNextTab,
    onSwipeRight: navigateToPreviousTab,
  }, {
    minSwipeDistance: 75, // Require slightly longer swipe to avoid accidental triggers
    maxSwipeTime: 400,
  });

  // Define the grouped tab configuration
  const tabGroups: TabGroupItem[] = useMemo(
    () => [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
            />
          </svg>
        ),
      },
      {
        id: "overview",
        label: "Overview",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
        ),
        subTabs: [
          {
            id: "timeline",
            label: "Timeline",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            ),
          },
          {
            id: "daily",
            label: "Day By Day",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            ),
          },
          {
            id: "trip-map",
            label: "Trip Map",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            ),
          },
        ],
      },
      {
        id: "plan",
        label: "Plan",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        ),
        subTabs: [
          {
            id: "activities",
            label: "Activities",
            count: activitiesCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            ),
          },
          {
            id: "transportation",
            label: "Transport",
            count: transportationCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            ),
          },
          {
            id: "lodging",
            label: "Lodging",
            count: lodgingCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            ),
          },
          {
            id: "unscheduled",
            label: "Unscheduled",
            count: unscheduledCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ),
          },
        ],
      },
      {
        id: "memories",
        label: "Memories",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ),
        subTabs: [
          {
            id: "photos",
            label: "Photos",
            count: totalPhotosCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            ),
          },
          {
            id: "photo-map",
            label: "Photo Map",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            ),
          },
          {
            id: "photo-timeline",
            label: "Photo Timeline",
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ),
          },
          {
            id: "journal",
            label: "Journal",
            count: journalCount,
            icon: (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            ),
          },
        ],
      },
      {
        id: "locations",
        label: "Places",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        ),
        count: locations.length,
      },
      {
        id: "companions",
        label: "People",
        icon: (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        ),
        count: companionsCount,
      },
    ],
    [
      activitiesCount,
      transportationCount,
      lodgingCount,
      unscheduledCount,
      totalPhotosCount,
      journalCount,
      locations.length,
      companionsCount,
    ]
  );

  // Load photos when trip is set
  useEffect(() => {
    if (trip) {
      photosPagination.loadInitial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  // Load photos when selected album changes
  useEffect(() => {
    if (!trip) return;

    // Clear filtered photos IMMEDIATELY to prevent thumbnail loading race condition
    setFilteredPhotos([]);

    // Clear non-active pagination states when switching views
    if (selectedAlbumId === null) {
      // All Photos - clear other paginations and reload
      unsortedPagination.clear();
      albumPhotosPagination.clear();
      photosPagination.loadInitial();
    } else if (selectedAlbumId === -1) {
      // Unsorted photos - clear others and load
      photosPagination.clear();
      albumPhotosPagination.clear();
      unsortedPagination.loadInitial();
    } else if (selectedAlbumId > 0) {
      // Specific album photos - clear others and load
      photosPagination.clear();
      unsortedPagination.clear();
      albumPhotosPagination.loadInitial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlbumId, trip?.id]);

  // Update filtered photos based on selected album
  useEffect(() => {
    if (selectedAlbumId === null) {
      setFilteredPhotos(photosPagination.items);
    } else if (selectedAlbumId === -1) {
      setFilteredPhotos(unsortedPagination.items);
    } else {
      setFilteredPhotos(albumPhotosPagination.items);
    }
  }, [
    selectedAlbumId,
    photosPagination.items,
    unsortedPagination.items,
    albumPhotosPagination.items,
  ]);

  // Load cover photo with authentication if needed
  useEffect(() => {
    const loadCoverPhoto = async () => {
      if (!trip?.coverPhoto) {
        // Revoke previous blob URL if any
        if (coverBlobUrlRef.current) {
          URL.revokeObjectURL(coverBlobUrlRef.current);
          coverBlobUrlRef.current = null;
        }
        setCoverPhotoUrl(null);
        return;
      }

      const photo = trip.coverPhoto;

      // If it's a local photo, use direct URL
      if (photo.source === "local" && photo.localPath) {
        // Revoke previous blob URL if switching from Immich to local
        if (coverBlobUrlRef.current) {
          URL.revokeObjectURL(coverBlobUrlRef.current);
          coverBlobUrlRef.current = null;
        }
        setCoverPhotoUrl(getFullAssetUrl(photo.localPath));
        return;
      }

      // If it's an Immich photo, fetch with authentication
      if (photo.source === "immich" && photo.thumbnailPath) {
        try {
          const token = getAccessToken();
          if (!token) return;

          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) return;

          const response = await fetch(fullUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            console.error("Failed to fetch cover photo:", response.status);
            return;
          }

          const blob = await response.blob();
          // Revoke previous blob URL before creating a new one
          if (coverBlobUrlRef.current) {
            URL.revokeObjectURL(coverBlobUrlRef.current);
          }
          const newBlobUrl = URL.createObjectURL(blob);
          coverBlobUrlRef.current = newBlobUrl;
          setCoverPhotoUrl(newBlobUrl);
        } catch (error) {
          console.error("Error loading cover photo:", error);
        }
      }
    };

    loadCoverPhoto();

    // Cleanup blob URL when component unmounts or trip changes
    return () => {
      if (coverBlobUrlRef.current) {
        URL.revokeObjectURL(coverBlobUrlRef.current);
        coverBlobUrlRef.current = null;
      }
    };
  }, [trip?.coverPhoto]);


  const handleSelectAlbum = async (albumId: number | null) => {
    setSelectedAlbumId(albumId);
    // Loading will be triggered by useEffect below
  };

  const handleCreateAlbum = () => {
    setEditingAlbum(null);
    setShowAlbumModal(true);
  };

  const handleEditAlbum = (album: PhotoAlbum) => {
    setEditingAlbum(album);
    setShowAlbumModal(true);
  };

  const handleSaveAlbum = async (data: {
    name: string;
    description: string;
  }) => {
    try {
      if (editingAlbum) {
        // Update existing album
        await photoService.updateAlbum(editingAlbum.id, data);
        toast.success("Album updated");
      } else {
        // Create new album
        await photoService.createAlbum({
          tripId: trip!.id,
          ...data,
        });
        toast.success("Album created");
      }

      // Reload albums
      queryClient.invalidateQueries({ queryKey: ['albums', tripId] });

      setShowAlbumModal(false);
      setEditingAlbum(null);
    } catch (err) {
      toast.error(
        editingAlbum ? "Failed to update album" : "Failed to create album"
      );
      throw err; // Re-throw so modal knows save failed
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    const confirmed = await confirm({
      title: "Delete Album",
      message: "Delete this album? Photos will not be deleted, only the album.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await photoService.deleteAlbum(albumId);
      toast.success("Album deleted");

      // If we were viewing this album, switch to "All Photos"
      if (selectedAlbumId === albumId) {
        setSelectedAlbumId(null);
      }

      // Reload albums
      queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
    } catch {
      toast.error("Failed to delete album");
    }
  };

  const handleOpenDuplicateDialog = () => {
    if (trip) {
      setDuplicateTripTitle(`${trip.title} (Copy)`);
      setShowDuplicateDialog(true);
    }
  };

  const handleDuplicateTrip = async () => {
    if (!trip || !duplicateTripTitle.trim()) {
      toast.error("Please enter a title for the duplicated trip");
      return;
    }

    try {
      const duplicatedTrip = await tripService.duplicateTrip(trip.id, {
        title: duplicateTripTitle,
        copyEntities: duplicateOptions,
      });
      toast.success("Trip duplicated successfully!");
      setShowDuplicateDialog(false);
      navigate(`/trips/${duplicatedTrip.id}`);
    } catch (error) {
      console.error("Failed to duplicate trip:", error);
      toast.error("Failed to duplicate trip");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await tripService.updateTrip(tripId, { status: newStatus as TripStatusType });
      toast.success(`Trip status updated to ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (error) {
      console.error("Failed to update trip status:", error);
      toast.error("Failed to update trip status");
    }
  };

  const handleToggleChecklistItem = async (
    _checklistId: number,
    itemId: number,
    completed: boolean
  ) => {
    try {
      await checklistService.updateChecklistItem(itemId, { isChecked: completed });
      queryClient.invalidateQueries({ queryKey: ["checklists", tripId] });
    } catch (error) {
      console.error("Failed to update checklist item:", error);
      toast.error("Failed to update checklist item");
    }
  };

  const handleNavigateToEntity = (entityType: string, entityId: string) => {
    const tabMap: Record<string, TabId> = {
      activity: "activities",
      transportation: "transportation",
      lodging: "lodging",
      location: "locations",
      photo: "photos",
      journal: "journal",
    };
    const targetTab = tabMap[entityType];
    if (targetTab) {
      changeTab(targetTab);
      // Wait for tab change then scroll to entity
      setTimeout(() => {
        const element = document.querySelector(
          `[data-entity-id="${entityType}-${entityId}"]`
        );
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("scroll-highlight");
          setTimeout(() => element.classList.remove("scroll-highlight"), 2000);
        }
      }, 100);
    }
  };

  const handlePrintItinerary = () => {
    // Navigate to timeline tab with print action to trigger print dialog
    changeTab("timeline");
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set("tab", "timeline");
      newParams.set("action", "print");
      return newParams;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case TripStatus.DREAM:
        return "bg-purple-100 text-purple-800";
      case TripStatus.PLANNING:
        return "bg-yellow-100 text-yellow-800";
      case TripStatus.PLANNED:
        return "bg-blue-100 text-blue-800";
      case TripStatus.IN_PROGRESS:
        return "bg-green-100 text-green-800";
      case TripStatus.COMPLETED:
        return "bg-gray-100 text-gray-800";
      case TripStatus.CANCELLED:
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isTripLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading trip...
          </p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return <div className="text-gray-900 dark:text-white">Trip not found</div>;
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Floating Trip Header - appears when main header scrolls out */}
      <FloatingTripHeader trip={trip} observeRef={tripHeaderRef} />

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-8">
        <Breadcrumbs
          items={[{ label: "Trips", href: "/trips" }, { label: trip.title }]}
        />
        {/* Trip Header */}
        <div ref={tripHeaderRef} className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
          {/* Cover Photo Background */}
          {coverPhotoUrl ? (
            // Dynamic background image requires CSS variable - cannot be moved to static CSS
            <div
              className="relative min-h-64 bg-cover bg-center cover-photo-bg"
              style={
                {
                  "--cover-photo-url": `url(${coverPhotoUrl})`,
                }
              }
            >
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/70"></div>
              <div className="relative h-full p-4 sm:p-6 flex flex-col justify-between text-white">
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div className="min-w-0 flex-1 pr-4">
                    <h1 className="trip-title-hero text-white drop-shadow-lg break-words">
                      {trip.title}
                    </h1>
                    <span
                      className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded ${getStatusColor(
                        trip.status
                      )}`}
                    >
                      {trip.status}
                    </span>
                    {trip.tripType && (
                      <span className="inline-block mt-2 ml-2 px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                        {trip.tripTypeEmoji && <span className="mr-1">{trip.tripTypeEmoji}</span>}
                        {trip.tripType}
                      </span>
                    )}
                    {trip.series && (
                      <span className="inline-block mt-2 ml-2">
                        <TripSeriesBadge
                          seriesId={trip.series.id}
                          seriesName={trip.series.name}
                          seriesOrder={trip.seriesOrder}
                        />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowTagsModal(true)}
                      className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      <span className="hidden sm:inline">
                        Manage Tags ({tagsCount})
                      </span>
                      <span className="sm:hidden">Tags ({tagsCount})</span>
                    </button>
                    <button
                      onClick={() => setShowShareModal(true)}
                      className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
                      aria-label="Share trip"
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    <Link
                      to={`/trips/${trip.id}/edit`}
                      className="btn btn-secondary text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
                    >
                      Edit Trip
                    </Link>
                  </div>
                </div>

                {/* Duplicate button - positioned in bottom right */}
                <button
                  onClick={handleOpenDuplicateDialog}
                  className="absolute bottom-4 right-4 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 rounded-lg transition-all hover:shadow-lg"
                  title="Duplicate Trip"
                  aria-label="Duplicate Trip"
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>

                <div>
                  {trip.description && (
                    <div className="text-white/90 mb-4 drop-shadow-md">
                      <MarkdownRenderer content={trip.description} className="prose-invert" />
                    </div>
                  )}

                  {/* Trip Dates - Natural Language Format */}
                  <div className="text-sm mb-4">
                    <div className="text-white font-medium drop-shadow-md">
                      {formatTripDates(trip.startDate, trip.endDate)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/80">
                      {formatTripDuration(trip.startDate, trip.endDate) && (
                        <span>{formatTripDuration(trip.startDate, trip.endDate)}</span>
                      )}
                      {getTripDateStatus(trip.startDate, trip.endDate) && (
                        <>
                          {formatTripDuration(trip.startDate, trip.endDate) && <span>·</span>}
                          <span className={`${
                            getTripDateStatus(trip.startDate, trip.endDate)?.includes('progress') ||
                            getTripDateStatus(trip.startDate, trip.endDate)?.includes('today')
                              ? 'text-green-300 font-medium'
                              : ''
                          }`}>
                            {getTripDateStatus(trip.startDate, trip.endDate)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 max-w-full">
                      {tags.map((tag) => (
                        // Dynamic tag colors require CSS variables - cannot be moved to static CSS
                        <span
                          key={tag.id}
                          className="px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium shadow-md tag-colored break-words"
                          style={
                            {
                              "--tag-bg-color": tag.color || "#3B82F6",
                              "--tag-text-color": tag.textColor || "#FFFFFF",
                            }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Checklists */}
                  {checklists.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {checklists.map((checklist) => (
                        <Link
                          key={checklist.id}
                          to={`/checklists/${checklist.id}`}
                          className="px-3 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/40 rounded-lg text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
                        >
                          📋 {checklist.name}
                          {checklist.stats && (
                            <span className="ml-2 opacity-80">
                              {checklist.stats.checked}/{checklist.stats.total}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Jet Lag Calculator */}
                  {trip.timezone && userTimezone && trip.timezone !== userTimezone && (
                    <JetLagCalculator
                      homeTimezone={userTimezone}
                      tripTimezone={trip.timezone}
                      variant="overlay"
                      className="mt-3"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 relative">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                <div className="min-w-0 flex-1 pr-4">
                  <h1 className="trip-title-hero text-gray-900 dark:text-white break-words">
                    {trip.title}
                  </h1>
                  <span
                    className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded ${getStatusColor(
                      trip.status
                    )}`}
                  >
                    {trip.status}
                  </span>
                  {trip.tripType && (
                    <span className="inline-block mt-2 ml-2 px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                      {trip.tripTypeEmoji && <span className="mr-1">{trip.tripTypeEmoji}</span>}
                      {trip.tripType}
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowTagsModal(true)}
                    className="btn btn-secondary flex items-center justify-center gap-2 text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                    <span className="hidden sm:inline">
                      Manage Tags ({tagsCount})
                    </span>
                    <span className="sm:hidden">Tags ({tagsCount})</span>
                  </button>
                  <Link
                    to={`/trips/${trip.id}/edit`}
                    className="btn btn-secondary text-sm sm:text-base px-3 sm:px-4 py-2 whitespace-nowrap"
                  >
                    Edit Trip
                  </Link>
                </div>
              </div>

              {/* Duplicate button - positioned in bottom right */}
              <button
                onClick={handleOpenDuplicateDialog}
                className="absolute bottom-4 right-4 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg transition-all hover:shadow-lg"
                title="Duplicate Trip"
                aria-label="Duplicate Trip"
              >
                <svg
                  className="w-5 h-5 text-gray-700 dark:text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>

              {trip.description && (
                <div className="text-gray-700 dark:text-gray-300 mb-4">
                  <MarkdownRenderer content={trip.description} />
                </div>
              )}

              {/* Trip Dates - Natural Language Format */}
              <div className="text-sm">
                <div className="text-gray-900 dark:text-white font-medium">
                  {formatTripDates(trip.startDate, trip.endDate)}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {formatTripDuration(trip.startDate, trip.endDate) && (
                    <span>{formatTripDuration(trip.startDate, trip.endDate)}</span>
                  )}
                  {getTripDateStatus(trip.startDate, trip.endDate) && (
                    <>
                      {formatTripDuration(trip.startDate, trip.endDate) && <span>·</span>}
                      <span className={`${
                        getTripDateStatus(trip.startDate, trip.endDate)?.includes('progress') ||
                        getTripDateStatus(trip.startDate, trip.endDate)?.includes('today')
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : ''
                      }`}>
                        {getTripDateStatus(trip.startDate, trip.endDate)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2 max-w-full">
                    {tags.map((tag) => (
                      // Dynamic tag colors require CSS variables - cannot be moved to static CSS
                      <span
                        key={tag.id}
                        className="px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium tag-colored break-words"
                        style={
                          {
                            "--tag-bg-color": tag.color || "#3B82F6",
                            "--tag-text-color": tag.textColor || "#FFFFFF",
                          }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklists */}
              {checklists.length > 0 && (
                <div className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    {checklists.map((checklist) => (
                      <Link
                        key={checklist.id}
                        to={`/checklists/${checklist.id}`}
                        className="px-3 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-300 transition-colors"
                      >
                        📋 {checklist.name}
                        {checklist.stats && (
                          <span className="ml-2 opacity-70">
                            {checklist.stats.checked}/{checklist.stats.total}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Jet Lag Calculator */}
              {trip.timezone && userTimezone && trip.timezone !== userTimezone && (
                <JetLagCalculator
                  homeTimezone={userTimezone}
                  tripTimezone={trip.timezone}
                  className="mt-4"
                />
              )}
            </div>
          )}
        </div>

        {/* Trip Series Navigation */}
        {trip.series && (
          <TripSeriesNav
            tripId={trip.id}
            seriesId={trip.series.id}
            seriesName={trip.series.name}
          />
        )}

        {/* Navigation Layout Toggle - Desktop only */}
        <div className="hidden md:flex justify-end mb-2">
          <NavigationLayoutToggle />
        </div>

        {/* Sidebar Layout Container - Desktop only when sidebar mode enabled */}
        <div className={navigationLayout === 'sidebar' ? 'hidden md:flex md:gap-6' : ''}>
          {/* Sidebar Navigation - Desktop only when sidebar layout selected */}
          {navigationLayout === 'sidebar' && (
            <TripSidebar
              tabs={tabGroups}
              activeTab={activeTab}
              onTabChange={(tabId) => changeTab(tabId as TabId)}
              className="sticky top-32 h-[calc(100vh-8rem)] rounded-lg shadow flex-shrink-0"
            />
          )}

          {/* Main Content Column */}
          <div className={navigationLayout === 'sidebar' ? 'flex-1 min-w-0' : ''}>

        {/* Tab Navigation - Mobile always, Desktop only when tabs layout selected */}
        <TabGroup
          tabs={tabGroups}
          activeTab={activeTab}
          onTabChange={(tabId) => changeTab(tabId as TabId)}
          className={`mb-6 sticky top-28 sm:top-32 bg-gray-50 dark:bg-gray-900 z-10 ${
            navigationLayout === 'sidebar' ? 'md:hidden' : ''
          }`}
        />

        {/* Tab Content with smooth transitions - Swipe enabled on mobile */}
        <div
          className="transition-all duration-300 ease-in-out"
          {...swipeHandlers}
        >
          {/* Dashboard Tab */}
          {activeTab === "dashboard" && (
            <div className="animate-fadeIn">
              <TripDashboard
                trip={trip}
                activities={activitiesData || []}
                transportation={transportationData || []}
                lodging={lodgingData || []}
                locations={locations}
                journalEntries={journalData || []}
                photos={photosPagination.items}
                photosCount={totalPhotosCount}
                checklists={checklists}
                companions={companionsData || []}
                onNavigateToTab={(tab, options) => {
                  // Handle special actions that don't navigate to a tab
                  if (tab === "duplicate") {
                    handleOpenDuplicateDialog();
                    return;
                  }
                  changeTab(tab as TabId);
                  if (options?.action === "add") {
                    // Handle specific actions if needed
                  }
                }}
                onStatusChange={handleStatusChange}
                onPrintItinerary={handlePrintItinerary}
                onToggleChecklistItem={handleToggleChecklistItem}
                onNavigateToEntity={handleNavigateToEntity}
              />
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === "timeline" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Timeline
                </h2>
                <Timeline
                  tripId={parseInt(id!)}
                  tripTitle={trip.title}
                  tripTimezone={trip.timezone || undefined}
                  userTimezone={userTimezone || undefined}
                  tripStartDate={trip.startDate || undefined}
                  tripEndDate={trip.endDate || undefined}
                  tripStatus={trip.status || undefined}
                  tripType={trip.tripType || undefined}
                  tripTypeEmoji={trip.tripTypeEmoji || undefined}
                  onNavigateToTab={(tab) => changeTab(tab as TabId)}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['trip', tripId] })}
                />
              </div>
            </div>
          )}

          {/* Day By Day Tab */}
          {activeTab === "daily" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <DailyView
                  tripId={parseInt(id!)}
                  tripTitle={trip.title}
                  tripTimezone={trip.timezone || undefined}
                  userTimezone={userTimezone || undefined}
                  tripStartDate={trip.startDate || undefined}
                  tripEndDate={trip.endDate || undefined}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: ['trip', tripId] })}
                />
              </div>
            </div>
          )}

          {/* Trip Map Tab */}
          {activeTab === "trip-map" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Trip Map
                </h2>
                {isTransportationLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <TripMap
                    transportations={transportationData || []}
                    height="600px"
                  />
                )}
              </div>
            </div>
          )}

        {/* Locations Tab */}
        {activeTab === "locations" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            <ErrorBoundary>
              {isLocationsLoading ? <Skeleton /> : (
              <LocationManager
                tripId={trip.id}
                tripTimezone={trip.timezone}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ['locations', tripId] })}
              />
              )}
            </ErrorBoundary>
          </div>
        )}

        {/* Photos Tab */}
        {activeTab === "photos" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Upload Interface - Full Width */}
            <PhotoUpload
              tripId={trip.id}
              onPhotoUploaded={async () => {
                await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
                // Refresh album counts (totalPhotosCount, unsortedPhotosCount)
                await queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                // Refresh Immich asset IDs to update the exclude list
                await loadImmichAssetIds(trip.id);
                // Refresh the current view
                if (selectedAlbumId === null) {
                  photosPagination.loadInitial();
                } else if (selectedAlbumId === -1) {
                  unsortedPagination.loadInitial();
                } else {
                  albumPhotosPagination.loadInitial();
                }
              }}
              tripStartDate={trip.startDate || undefined}
              tripEndDate={trip.endDate || undefined}
              existingImmichAssetIds={existingImmichAssetIds}
            />

            {/* Smart Album Suggestions */}
            {selectedAlbumId === -1 && unsortedPhotosCount >= 3 && (
              <AlbumSuggestions
                tripId={trip.id}
                onAlbumCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                  unsortedPagination.loadInitial();
                }}
              />
            )}

            {/* Mobile Albums Drawer Toggle Button */}
            {/* Position accounts for MobileBottomNav (h-16 = 4rem) plus padding */}
            <button
              onClick={() => setShowAlbumsMobileDrawer(true)}
              className="md:hidden fixed bottom-20 left-6 z-30 p-4 bg-blue-600 dark:bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              aria-label="Open albums"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </button>

            {/* Sidebar Layout */}
            <div className="flex gap-0 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              {/* Left: Albums Sidebar */}
              {areAlbumsLoading ? <Skeleton className="w-64" /> : (
              <AlbumsSidebar
                albums={albums}
                selectedAlbumId={selectedAlbumId}
                totalPhotos={totalPhotosCount}
                unsortedPhotosCount={unsortedPhotosCount}
                onSelectAlbum={handleSelectAlbum}
                onCreateAlbum={handleCreateAlbum}
                onEditAlbum={handleEditAlbum}
                onDeleteAlbum={handleDeleteAlbum}
                isMobileDrawerOpen={showAlbumsMobileDrawer}
                onCloseMobileDrawer={() => setShowAlbumsMobileDrawer(false)}
              />
              )}

              {/* Right: Photo Gallery */}
              <div className="flex-1 min-w-0 p-4 sm:p-6">
                {/* Header row - stacks on mobile */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-start mb-4 sm:mb-6 gap-3">
                  <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-0 sm:flex-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white break-words">
                      {selectedAlbumId === null
                        ? `All Photos (${totalPhotosCount})`
                        : selectedAlbumId === -1
                        ? `Unsorted (${unsortedPhotosCount})`
                        : `${
                            albums.find((a) => a.id === selectedAlbumId)
                              ?.name || "Album"
                          } (${
                            albums.find((a) => a.id === selectedAlbumId)?._count
                              ?.photoAssignments || 0
                          })`}
                    </h2>
                    {selectedAlbumId !== null &&
                      selectedAlbumId !== -1 &&
                      albums.find((a) => a.id === selectedAlbumId)
                        ?.description && (
                        <p
                          className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
                          title={
                            albums.find((a) => a.id === selectedAlbumId)
                              ?.description || ""
                          }
                        >
                          {
                            albums.find((a) => a.id === selectedAlbumId)
                              ?.description
                          }
                        </p>
                      )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {/* Add Photos button - only show when viewing a specific album */}
                    {selectedAlbumId !== null && selectedAlbumId > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddPhotosModal(true)}
                        className="px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 whitespace-nowrap flex items-center gap-2"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Add Photos
                      </button>
                    )}
                    {trip.coverPhoto && (
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: "Remove Cover Photo",
                            message: "Are you sure you want to remove the cover photo from this trip?",
                            confirmLabel: "Remove",
                            variant: "warning",
                          });
                          if (!confirmed) return;

                          try {
                            await tripService.updateCoverPhoto(trip.id, null);
                            toast.success("Cover photo removed");
                            queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
                            queryClient.invalidateQueries({ queryKey: ['trips'] });
                          } catch {
                            toast.error("Failed to remove cover photo");
                          }
                        }}
                        className="px-3 py-2 text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 whitespace-nowrap flex-shrink-0"
                      >
                        Remove Cover Photo
                      </button>
                    )}
                  </div>
                </div>

                <PhotoGallery
                    photos={filteredPhotos}
                    albums={albums}
                    onPhotoDeleted={() => {
                      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
                      queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                      // Refresh the current view
                      if (selectedAlbumId === null) {
                        photosPagination.loadInitial();
                      } else if (selectedAlbumId === -1) {
                        unsortedPagination.loadInitial();
                      } else {
                        albumPhotosPagination.loadInitial();
                      }
                    }}
                    onPhotoUpdated={() => {
                      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
                      // Refresh the current view
                      if (selectedAlbumId === null) {
                        photosPagination.loadInitial();
                      } else if (selectedAlbumId === -1) {
                        unsortedPagination.loadInitial();
                      } else {
                        albumPhotosPagination.loadInitial();
                      }
                    }}
                    onPhotosAddedToAlbum={() => {
                      queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                      // Refresh the current view
                      if (selectedAlbumId === null) {
                        photosPagination.loadInitial();
                      } else if (selectedAlbumId === -1) {
                        unsortedPagination.loadInitial();
                      } else {
                        albumPhotosPagination.loadInitial();
                      }
                      toast.success("Photos added to album");
                    }}
                    onSetCoverPhoto={async (photoId: number) => {
                      try {
                        await tripService.updateCoverPhoto(trip.id, photoId);
                        toast.success("Cover photo updated");
                        queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
                        queryClient.invalidateQueries({ queryKey: ['trips'] });
                      } catch {
                        toast.error("Failed to set cover photo");
                      }
                    }}
                    coverPhotoId={trip.coverPhotoId}
                    totalPhotosInView={
                      selectedAlbumId === null
                        ? photosPagination.total
                        : selectedAlbumId === -1
                        ? unsortedPagination.total
                        : albumPhotosPagination.total
                    }
                    onLoadAllPhotos={async () => {
                      // With paged pagination, loading all photos is not supported
                      // as it would defeat the purpose of memory-efficient pagination.
                      // The PhotoGallery component should handle this gracefully.
                      // For bulk operations, users should use "Select All on Page" instead.
                      toast.error("Loading all photos at once is not available with paged view. Use page navigation instead.");
                    }}
                    currentAlbumId={selectedAlbumId}
                    onPhotosRemovedFromAlbum={() => {
                      queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                      // Refresh the current view
                      if (selectedAlbumId === null) {
                        photosPagination.loadInitial();
                      } else if (selectedAlbumId === -1) {
                        unsortedPagination.loadInitial();
                      } else {
                        albumPhotosPagination.loadInitial();
                      }
                      toast.success("Photos removed from album");
                    }}
                    onSortChange={handlePhotoSortChange}
                    initialSortBy={sortByRef.current}
                    initialSortOrder={sortOrderRef.current}
                    tripId={trip.id}
                  />

                {/* Pagination Controls */}
                {selectedAlbumId === null && photosPagination.totalPages > 1 && (
                  <Pagination
                    currentPage={photosPagination.currentPage}
                    totalPages={photosPagination.totalPages}
                    pageNumbers={photosPagination.pageNumbers}
                    onPageChange={photosPagination.goToPage}
                    onPrevious={photosPagination.previousPage}
                    onNext={photosPagination.nextPage}
                    hasPreviousPage={photosPagination.hasPreviousPage}
                    hasNextPage={photosPagination.hasNextPage}
                    loading={photosPagination.loading}
                    rangeStart={photosPagination.rangeStart}
                    rangeEnd={photosPagination.rangeEnd}
                    total={photosPagination.total}
                    className="mt-6"
                  />
                )}
                {selectedAlbumId === -1 && unsortedPagination.totalPages > 1 && (
                  <Pagination
                    currentPage={unsortedPagination.currentPage}
                    totalPages={unsortedPagination.totalPages}
                    pageNumbers={unsortedPagination.pageNumbers}
                    onPageChange={unsortedPagination.goToPage}
                    onPrevious={unsortedPagination.previousPage}
                    onNext={unsortedPagination.nextPage}
                    hasPreviousPage={unsortedPagination.hasPreviousPage}
                    hasNextPage={unsortedPagination.hasNextPage}
                    loading={unsortedPagination.loading}
                    rangeStart={unsortedPagination.rangeStart}
                    rangeEnd={unsortedPagination.rangeEnd}
                    total={unsortedPagination.total}
                    className="mt-6"
                  />
                )}
                {selectedAlbumId !== null && selectedAlbumId > 0 && albumPhotosPagination.totalPages > 1 && (
                  <Pagination
                    currentPage={albumPhotosPagination.currentPage}
                    totalPages={albumPhotosPagination.totalPages}
                    pageNumbers={albumPhotosPagination.pageNumbers}
                    onPageChange={albumPhotosPagination.goToPage}
                    onPrevious={albumPhotosPagination.previousPage}
                    onNext={albumPhotosPagination.nextPage}
                    hasPreviousPage={albumPhotosPagination.hasPreviousPage}
                    hasNextPage={albumPhotosPagination.hasNextPage}
                    loading={albumPhotosPagination.loading}
                    rangeStart={albumPhotosPagination.rangeStart}
                    rangeEnd={albumPhotosPagination.rangeEnd}
                    total={albumPhotosPagination.total}
                    className="mt-6"
                  />
                )}
                {selectedAlbumId === -1 && filteredPhotos.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p>All photos are sorted into albums!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Album Modal */}
            {showAlbumModal && (
              <AlbumModal
                album={editingAlbum || undefined}
                tripId={trip.id}
                onSave={handleSaveAlbum}
                onClose={() => {
                  setShowAlbumModal(false);
                  setEditingAlbum(null);
                }}
                onUpdate={() => {
                  // Refresh albums after linking
                  queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                }}
              />
            )}

            {/* Add Photos to Album Modal */}
            {showAddPhotosModal && selectedAlbumId && selectedAlbumId > 0 && (
              <AddPhotosToAlbumModal
                tripId={trip.id}
                albumId={selectedAlbumId}
                albumName={
                  albums.find((a) => a.id === selectedAlbumId)?.name || "Album"
                }
                existingPhotoIds={new Set(filteredPhotos.map((p) => p.id))}
                onClose={() => setShowAddPhotosModal(false)}
                onPhotosAdded={() => {
                  queryClient.invalidateQueries({ queryKey: ['albums', tripId] });
                  // Refresh the current view
                  if (selectedAlbumId === null) {
                    photosPagination.loadInitial();
                  } else if (selectedAlbumId === -1) {
                    unsortedPagination.loadInitial();
                  } else {
                    albumPhotosPagination.loadInitial();
                  }
                  toast.success("Photos added to album");
                }}
              />
            )}
          </div>
        )}

        {/* Photo Map Tab */}
        {activeTab === "photo-map" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Photo Map
            </h2>
            <PhotosMapView
              tripId={trip.id}
              fetchAllPhotos
              onPhotoClick={() => {
                // TODO: Implement lightbox or photo navigation
              }}
            />
          </div>
        )}

        {/* Photo Timeline Tab */}
        {activeTab === "photo-timeline" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Photo Timeline
            </h2>
            <PhotoTimeline
              tripId={trip.id}
              tripTimezone={trip.timezone || undefined}
              tripStartDate={trip.startDate || undefined}
            />
          </div>
        )}

        {/* Activities Tab */}
        {activeTab === "activities" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {isActivitiesLoading ? <Skeleton /> : (
            <ActivityManager
              tripId={trip.id}
              locations={locations}
              tripTimezone={trip.timezone}
              tripStartDate={trip.startDate}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['activities', tripId] })}
            />
            )}
          </div>
        )}

        {/* Unscheduled Tab */}
        {activeTab === "unscheduled" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {isActivitiesLoading || isTransportationLoading || isLodgingLoading ? <Skeleton /> : (
            <UnscheduledItems
              tripId={trip.id}
              locations={locations}
              tripTimezone={trip.timezone}
              tripStartDate={trip.startDate}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['trip', tripId] })}
            />
            )}
          </div>
        )}

        {/* Transportation Tab */}
        {activeTab === "transportation" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {isTransportationLoading ? <Skeleton /> : (
            <TransportationManager
              tripId={trip.id}
              locations={locations}
              tripTimezone={trip.timezone}
              tripStartDate={trip.startDate}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['transportation', tripId] })}
            />
            )}
          </div>
        )}

        {/* Lodging Tab */}
        {activeTab === "lodging" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {isLodgingLoading ? <Skeleton /> : (
            <LodgingManager
              tripId={trip.id}
              locations={locations}
              tripTimezone={trip.timezone}
              tripStartDate={trip.startDate}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['lodging', tripId] })}
            />
            )}
          </div>
        )}

        {/* Journal Tab */}
        {activeTab === "journal" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {isJournalLoading ? <Skeleton /> : (
            <JournalManager
              tripId={trip.id}
              tripStartDate={trip.startDate}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['journal', tripId] })}
            />
            )}
          </div>
        )}

        {/* Companions Tab */}
        {activeTab === "companions" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 animate-fadeIn">
            {areCompanionsLoading ? <Skeleton /> : (
            <CompanionManager tripId={trip.id} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['companions', tripId] })} />
            )}
          </div>
        )}
        </div>
          {/* Close Main Content Column */}
          </div>
        {/* Close Sidebar Layout Container */}
        </div>
      </main>

      {/* Tags Modal */}
      {showTagsModal && (
        <TagsModal
          tripId={trip.id}
          onClose={() => setShowTagsModal(false)}
          onTagsUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['tags', tripId] });
          }}
        />
      )}

      {/* Share / Collaborators Modal */}
      <Modal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="Share Trip"
        icon="👥"
        maxWidth="lg"
      >
        <CollaboratorsManager
          tripId={trip.id}
          tripTitle={trip.title}
          isOwner={userPermission?.isOwner ?? true}
          userPermission={userPermission?.permissionLevel ?? null}
        />
      </Modal>

      {/* Duplicate Trip Dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                Duplicate Trip
              </h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Trip Title
                </label>
                <input
                  type="text"
                  value={duplicateTripTitle}
                  onChange={(e) => setDuplicateTripTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter title for duplicated trip"
                />
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                  Select What to Copy
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.locations}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, locations: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Locations</strong> - All locations and points of interest
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.photos}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, photos: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Photos</strong> - All trip photos (local uploads and Immich references)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.activities}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, activities: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Activities</strong> - Planned and completed activities (dates will be cleared)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.transportation}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, transportation: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Transportation</strong> - Flights, trains, buses (dates will be cleared)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.lodging}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, lodging: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Lodging</strong> - Hotels, Airbnb, camping (dates will be cleared)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.journalEntries}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, journalEntries: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Journal Entries</strong> - All journal entries with their associations
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.photoAlbums}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, photoAlbums: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Photo Albums</strong> - Album organization (requires photos to be copied)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.tags}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, tags: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Tags</strong> - Trip tags and categories
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.companions}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, companions: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Companions</strong> - Travel companions (defaults to "Myself" if unchecked)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={duplicateOptions.checklists}
                      onChange={(e) => setDuplicateOptions({ ...duplicateOptions, checklists: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Checklists</strong> - Packing lists and todo items (checked state will be reset)
                    </span>
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> The duplicated trip will have status "Dream" with all dates cleared.
                  You can update dates and details after creation.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDuplicateDialog(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDuplicateTrip}
                  disabled={!duplicateTripTitle.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Duplicate Trip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialogComponent />
    </div>
  );
}
