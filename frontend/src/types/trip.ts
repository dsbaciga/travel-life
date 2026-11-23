export const TripStatus = {
  DREAM: 'Dream',
  PLANNING: 'Planning',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const;

export const PrivacyLevel = {
  PRIVATE: 'Private',
  SHARED: 'Shared',
  PUBLIC: 'Public',
} as const;

export type TripStatusType = typeof TripStatus[keyof typeof TripStatus];
export type PrivacyLevelType = typeof PrivacyLevel[keyof typeof PrivacyLevel];

export type Trip = {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  status: TripStatusType;
  tripType: string | null;
  tripTypeEmoji: string | null;
  privacyLevel: PrivacyLevelType;
  /** Secret share-link token — only returned to the trip owner. */
  shareToken?: string | null;
  shareEnabled?: boolean;
  addToPlacesVisited: boolean;
  excludeFromAutoShare: boolean;
  archived: boolean;
  coverPhotoId: number | null;
  /**
   * Standalone uploaded cover image, not part of the trip's photo library.
   * Mutually exclusive with coverPhotoId — setting one clears the other.
   */
  coverImagePath: string | null;
  coverImageThumbnailPath: string | null;
  /** Dominant colour of the current cover (`#rrggbb`), derived by the server. Feed to `useTripTint`. */
  coverColor?: string | null;
  bannerPhotoId: number | null;
  seriesId: number | null;
  seriesOrder: number | null;
  series: { id: number; name: string } | null;
  budget?: number | null;
  budgetCurrency?: string | null;
  /**
   * ISO 3166-1 alpha-2 for the destination, or null to infer it from the trip's
   * location addresses. The single country override shared by the emergency card
   * and the local-norms card.
   */
  countryCode?: string | null;
  createdAt: string;
  updatedAt: string;
  coverPhoto?: {
    id: number;
    localPath: string | null;
    thumbnailPath: string | null;
    source: 'local' | 'immich';
    immichAssetId: string | null;
  } | null;
  tagAssignments?: {
    id: number;
    tag: {
      id: number;
      name: string;
      color: string;
      textColor: string;
    };
  }[];
  _count?: {
    locations: number;
    photos: number;
    transportation: number;
    activities: number;
    lodging: number;
    journalEntries: number;
  };
};

export type CreateTripInput = {
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  status?: TripStatusType;
  privacyLevel?: PrivacyLevelType;
  addToPlacesVisited?: boolean;
  excludeFromAutoShare?: boolean;
  // NOTE: `archived` is intentionally absent — the backend create schema strips
  // it. It is settable on update via UpdateTripInput below.
  tripType?: string | null;
  tripTypeEmoji?: string | null;
  seriesId?: number | null;
};

export type UpdateTripInput = Partial<CreateTripInput> & {
  budget?: number | null;
  budgetCurrency?: string | null;
  countryCode?: string | null;
  archived?: boolean;
};

export type TripListResponse = {
  trips: Trip[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ValidationIssueCategory = 'SCHEDULE' | 'ACCOMMODATIONS' | 'TRANSPORTATION' | 'COMPLETENESS' | 'DOCUMENTS';
export type ValidationStatus = 'okay' | 'potential_issues';

export interface ValidationIssueQuickAction {
  type: 'add_lodging' | 'add_transportation' | 'view_conflict' | 'edit_activity';
  label: string;
  data?: Record<string, unknown>;
}

export interface ValidationIssue {
  id: string;
  category: ValidationIssueCategory;
  type: string;
  message: string;
  affectedItems?: (string | number)[];
  suggestion?: string;
  isDismissed: boolean;
  quickAction?: ValidationIssueQuickAction;
}

export interface ValidationResult {
  tripId: number;
  status: ValidationStatus;
  issuesByCategory: Record<ValidationIssueCategory, ValidationIssue[]>;
  totalIssues: number;
  activeIssues: number;
  dismissedIssues: number;
}

export interface ValidationQuickStatus {
  status: ValidationStatus;
  activeIssues: number;
}

export interface DuplicateTripOptions {
  locations?: boolean;
  photos?: boolean;
  activities?: boolean;
  transportation?: boolean;
  lodging?: boolean;
  journalEntries?: boolean;
  photoAlbums?: boolean;
  tags?: boolean;
  companions?: boolean;
  checklists?: boolean;
}

export interface DuplicateTripInput {
  title: string;
  copyEntities?: DuplicateTripOptions;
}
