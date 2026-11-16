export interface BackupData {
  version: string;
  exportDate: string;
  user: {
    username: string;
    email: string;
    timezone: string | null;
    activityCategories: Record<string, unknown>[];
    immichApiUrl: string | null;
    immichApiKey: string | null;
    weatherApiKey: string | null;
  };
  tags: Record<string, unknown>[];
  companions: Record<string, unknown>[];
  locationCategories: Record<string, unknown>[];
  checklists: Record<string, unknown>[];
  trips: Record<string, unknown>[];
}

export interface BackupInfo {
  version: string;
  supportedFormats: string[];
}

export interface RestoreOptions {
  clearExistingData: boolean;
  importPhotos: boolean;
}

export interface RestoreStats {
  tripsImported: number;
  locationsImported: number;
  photosImported: number;
  activitiesImported: number;
  transportationImported: number;
  lodgingImported: number;
  journalEntriesImported: number;
  tagsImported: number;
  companionsImported: number;
  /** Expense receipts re-attached / left off because their file was missing (absent in older servers). */
  receiptsRestored?: number;
  receiptsNotRestored?: number;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  stats: RestoreStats;
}
