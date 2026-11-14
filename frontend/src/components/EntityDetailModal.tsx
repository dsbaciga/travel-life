import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { EntityType } from '../types/entityLink';
import { ENTITY_TYPE_CONFIG, ENTITY_TYPE_TO_TAB } from '../lib/entityConfig';
import { useImmichThumbnail } from '../hooks/useImmichThumbnail';
import locationService from '../services/location.service';
import activityService from '../services/activity.service';
import lodgingService from '../services/lodging.service';
import transportationService from '../services/transportation.service';
import journalEntryService from '../services/journalEntry.service';
import photoService from '../services/photo.service';
import savedLinkService from '../services/savedLink.service';
import customItemService from '../services/customItem.service';
import type { CustomItem } from '../types/customItem';
import type { SavedLink } from '../types/savedLink';
import { savedLinkDisplayTitle } from '../types/savedLink';
import type { Location } from '../types/location';
import { formatOpeningHours } from '../utils/openingHours';
import type { Activity } from '../types/activity';
import type { Lodging } from '../types/lodging';
import type { Transportation } from '../types/transportation';
import type { JournalEntry } from '../types/journalEntry';
import type { Photo, AlbumWithPhotos } from '../types/photo';
import MarkdownRenderer from './MarkdownRenderer';
import { formatDate } from '../utils/dateFormat';
import { formatCurrency } from '../utils/formatCurrency';

interface EntityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: number;
  entityType: EntityType;
  entityId: number;
}

// Format datetime for display
function formatDateTime(dateString: string | null | undefined, timezone?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    if (timezone) {
      options.timeZone = timezone;
      options.timeZoneName = 'short';
    }
    return date.toLocaleString(undefined, options);
  } catch {
    return dateString;
  }
}

// Type icons for transportation
const TRANSPORT_ICONS: Record<string, string> = {
  flight: '✈️',
  train: '🚆',
  bus: '🚌',
  car: '🚗',
  ferry: '⛴️',
  bicycle: '🚲',
  walk: '🚶',
  other: '🚐',
};

// Type icons for lodging
const LODGING_ICONS: Record<string, string> = {
  hotel: '🏨',
  hostel: '🛏️',
  airbnb: '🏠',
  vacation_rental: '🏡',
  camping: '⛺',
  resort: '🏖️',
  motel: '🏩',
  bed_and_breakfast: '🍳',
  apartment: '🏢',
  friends_family: '👨‍👩‍👧‍👦',
  other: '🏠',
};

// Detail row component
function DetailRow({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={`py-2 ${className}`}>
      <dt className="text-sm font-medium text-gray-500 dark:text-dusk-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

// Entity-specific detail components
function SavedLinkDetails({ entity }: { entity: SavedLink }) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Title" value={savedLinkDisplayTitle(entity)} />
      <DetailRow
        label="URL"
        value={
          <a
            href={entity.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-blue-600 hover:underline dark:text-blue-400 break-all"
          >
            {entity.url}
          </a>
        }
      />
      <DetailRow label="Site" value={entity.siteName} />
      <DetailRow label="Description" value={entity.description} />
      <DetailRow
        label="Notes"
        value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null}
      />
    </dl>
  );
}

function LocationDetails({ entity }: { entity: Location }) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Name" value={entity.name} />
      <DetailRow label="Address" value={entity.address} />
      {entity.category && (
        <DetailRow
          label="Category"
          value={
            <span className="inline-flex items-center gap-1">
              {entity.category.icon && <span>{entity.category.icon}</span>}
              {entity.category.name}
            </span>
          }
        />
      )}
      {entity.parent && <DetailRow label="Parent Location" value={entity.parent.name} />}
      <DetailRow label="Visit Date" value={formatDateTime(entity.visitDatetime)} />
      {entity.visitDurationMinutes && (
        <DetailRow label="Duration" value={`${entity.visitDurationMinutes} minutes`} />
      )}
      {entity.openingHours && (
        <DetailRow
          label="Opening Hours"
          value={
            <div>
              {formatOpeningHours(entity.openingHours).map((line, index) => (
                <div key={`${line.days}-${line.times}-${index}`}>
                  {line.days && <span className="font-medium">{line.days}: </span>}
                  {line.times}
                </div>
              ))}
              {/* Hours are wall-clock times where the place is, which is often not where the
                  reader is — say so rather than leaving them to assume their own clock. */}
              {entity.timezone && (
                <div className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                  Local time in {entity.timezone.replace(/_/g, ' ')}
                </div>
              )}
            </div>
          }
        />
      )}
      {entity.latitude && entity.longitude && (
        <DetailRow
          label="Coordinates"
          value={`${entity.latitude.toFixed(6)}, ${entity.longitude.toFixed(6)}`}
        />
      )}
      <DetailRow label="Notes" value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null} />
    </dl>
  );
}

function CustomItemDetails({ entity }: { entity: CustomItem }) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Name" value={entity.name} />
      <DetailRow label="Type" value={entity.type?.name} />
      {entity.allDay ? (
        <DetailRow label="Time" value="All Day" />
      ) : (
        <>
          <DetailRow label="Start Time" value={formatDateTime(entity.startTime, entity.timezone)} />
          <DetailRow label="End Time" value={formatDateTime(entity.endTime, entity.timezone)} />
        </>
      )}
      <DetailRow label="Location" value={entity.location?.name} />
      {entity.cost != null && (
        <DetailRow label="Cost" value={formatCurrency(entity.cost, entity.currency)} />
      )}
      <DetailRow label="Confirmation Number" value={entity.confirmationNumber} />
      {entity.url && (
        <DetailRow
          label="URL"
          value={
            <a
              href={entity.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-blue-600 hover:underline dark:text-blue-400 break-all"
            >
              {entity.url}
            </a>
          }
        />
      )}
      <DetailRow
        label="Notes"
        value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null}
      />
    </dl>
  );
}

function ActivityDetails({ entity }: { entity: Activity }) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Name" value={entity.name} />
      <DetailRow label="Description" value={entity.description ? <MarkdownRenderer content={entity.description} compact /> : null} />
      <DetailRow label="Category" value={entity.category} />
      {entity.allDay ? (
        <DetailRow label="Time" value="All Day" />
      ) : (
        <>
          <DetailRow label="Start Time" value={formatDateTime(entity.startTime, entity.timezone)} />
          <DetailRow label="End Time" value={formatDateTime(entity.endTime, entity.timezone)} />
        </>
      )}
      {entity.cost != null && (
        <DetailRow label="Cost" value={formatCurrency(entity.cost, entity.currency)} />
      )}
      <DetailRow label="Booking Reference" value={entity.bookingReference} />
      {entity.bookingUrl && (
        <DetailRow
          label="Booking URL"
          value={
            <a
              href={entity.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {entity.bookingUrl}
            </a>
          }
        />
      )}
      <DetailRow label="Notes" value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null} />
    </dl>
  );
}

function LodgingDetails({ entity }: { entity: Lodging }) {
  const typeIcon = LODGING_ICONS[entity.type] || LODGING_ICONS.other;
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Name" value={entity.name} />
      <DetailRow
        label="Type"
        value={
          <span className="inline-flex items-center gap-1">
            <span>{typeIcon}</span>
            <span className="capitalize">{entity.type.replace(/_/g, ' ')}</span>
          </span>
        }
      />
      <DetailRow label="Address" value={entity.address} />
      <DetailRow label="Check-in" value={formatDate(entity.checkInDate, 'full', '')} />
      <DetailRow label="Check-out" value={formatDate(entity.checkOutDate, 'full', '')} />
      <DetailRow label="Confirmation #" value={entity.confirmationNumber} />
      {entity.cost != null && (
        <DetailRow label="Cost" value={formatCurrency(entity.cost, entity.currency)} />
      )}
      {entity.bookingUrl && (
        <DetailRow
          label="Booking URL"
          value={
            <a
              href={entity.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {entity.bookingUrl}
            </a>
          }
        />
      )}
      <DetailRow label="Notes" value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null} />
    </dl>
  );
}

function TransportationDetails({ entity }: { entity: Transportation }) {
  const typeIcon = TRANSPORT_ICONS[entity.type] || TRANSPORT_ICONS.other;

  const getLocationDisplay = (
    location: { name: string } | null | undefined,
    locationName: string | null | undefined
  ): string => {
    if (location?.name) return location.name;
    if (locationName) return locationName;
    return 'Unknown';
  };

  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow
        label="Type"
        value={
          <span className="inline-flex items-center gap-1">
            <span>{typeIcon}</span>
            <span className="capitalize">{entity.type}</span>
          </span>
        }
      />
      <DetailRow label="Carrier" value={entity.carrier} />
      <DetailRow label="Vehicle/Flight #" value={entity.vehicleNumber} />
      <DetailRow
        label="From"
        value={getLocationDisplay(entity.fromLocation, entity.fromLocationName)}
      />
      <DetailRow
        label="To"
        value={getLocationDisplay(entity.toLocation, entity.toLocationName)}
      />
      <DetailRow
        label="Departure"
        value={formatDateTime(entity.departureTime, entity.startTimezone)}
      />
      <DetailRow
        label="Arrival"
        value={formatDateTime(entity.arrivalTime, entity.endTimezone)}
      />
      {entity.durationMinutes && (
        <DetailRow
          label="Duration"
          value={`${Math.floor(entity.durationMinutes / 60)}h ${entity.durationMinutes % 60}m`}
        />
      )}
      {entity.calculatedDistance && (
        <DetailRow
          label="Distance"
          value={`${entity.calculatedDistance.toFixed(1)} km (${(entity.calculatedDistance * 0.621371).toFixed(1)} mi)`}
        />
      )}
      <DetailRow label="Confirmation #" value={entity.confirmationNumber} />
      {entity.cost != null && (
        <DetailRow label="Cost" value={formatCurrency(entity.cost, entity.currency)} />
      )}
      {entity.flightTracking && (
        <>
          <DetailRow label="Gate" value={entity.flightTracking.gate} />
          <DetailRow label="Terminal" value={entity.flightTracking.terminal} />
          <DetailRow label="Baggage Claim" value={entity.flightTracking.baggageClaim} />
        </>
      )}
      <DetailRow label="Notes" value={entity.notes ? <MarkdownRenderer content={entity.notes} compact /> : null} />
    </dl>
  );
}

function JournalDetails({ entity }: { entity: JournalEntry }) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Title" value={entity.title} />
      <DetailRow label="Date" value={formatDate(entity.date, 'full', '')} />
      <DetailRow
        label="Type"
        value={<span className="capitalize">{entity.entryType.replace(/_/g, ' ')}</span>}
      />
      <DetailRow label="Mood" value={entity.mood} />
      <DetailRow label="Weather" value={entity.weatherNotes} />
      <DetailRow
        label="Content"
        value={entity.content ? <MarkdownRenderer content={entity.content} /> : null}
      />
    </dl>
  );
}

function PhotoDetails({ entity }: { entity: Photo }) {
  const [imageError, setImageError] = useState(false);
  // Use authenticated thumbnail URL for Immich photos
  const imageUrl = useImmichThumbnail(
    entity.thumbnailPath || entity.localPath,
    entity.source
  );

  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      {imageUrl && !imageError && (
        <div className="py-4">
          <img
            src={imageUrl}
            alt={entity.caption || 'Photo'}
            className="max-w-full max-h-64 object-contain rounded-lg mx-auto"
            onError={() => setImageError(true)}
          />
        </div>
      )}
      {!imageUrl && !imageError && (
        <div className="py-4 flex justify-center">
          <div className="w-32 h-32 bg-gray-200 dark:bg-dusk-700 rounded-lg animate-pulse" />
        </div>
      )}
      {imageError && (
        <div className="py-4 text-center text-gray-500 dark:text-dusk-400">
          <span className="text-4xl">📷</span>
          <p className="mt-2 text-sm">Image could not be loaded</p>
        </div>
      )}
      <DetailRow label="Caption" value={entity.caption} />
      <DetailRow label="Taken At" value={formatDateTime(entity.takenAt)} />
      {entity.latitude && entity.longitude && (
        <DetailRow
          label="Location"
          value={`${entity.latitude.toFixed(6)}, ${entity.longitude.toFixed(6)}`}
        />
      )}
      <DetailRow label="Source" value={entity.source === 'immich' ? 'Immich' : 'Uploaded'} />
    </dl>
  );
}

function AlbumPhotoPreview({ photo }: { photo: Photo }) {
  const [imageError, setImageError] = useState(false);
  // Use authenticated thumbnail URL for Immich photos
  const imageUrl = useImmichThumbnail(
    photo.thumbnailPath || photo.localPath,
    photo.source
  );

  if (imageError) {
    return (
      <div className="w-16 h-16 flex items-center justify-center bg-gray-100 dark:bg-dusk-700 rounded text-gray-400">
        📷
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="w-16 h-16 bg-gray-200 dark:bg-dusk-700 rounded animate-pulse" />
    );
  }

  return (
    <img
      src={imageUrl}
      alt={photo.caption || 'Photo'}
      className="w-16 h-16 object-cover rounded"
      onError={() => setImageError(true)}
    />
  );
}

function AlbumDetails({ entity }: { entity: AlbumWithPhotos }) {
  const photoCount = entity.total ?? entity.photos?.length ?? 0;
  return (
    <dl className="divide-y divide-gray-200 dark:divide-dusk-700">
      <DetailRow label="Name" value={entity.name} />
      <DetailRow label="Description" value={entity.description ? <MarkdownRenderer content={entity.description} compact /> : null} />
      <DetailRow label="Photos" value={`${photoCount} photos`} />
      {entity.photos && entity.photos.length > 0 && (
        <div className="py-4">
          <dt className="text-sm font-medium text-gray-500 dark:text-dusk-400 mb-2">Preview</dt>
          <dd className="flex flex-wrap gap-2">
            {entity.photos.slice(0, 6).map((photoAssignment) => (
              <AlbumPhotoPreview key={photoAssignment.photo.id} photo={photoAssignment.photo} />
            ))}
            {photoCount > 6 && (
              <div className="w-16 h-16 flex items-center justify-center bg-gray-100 dark:bg-dusk-700 rounded text-sm text-gray-500 dark:text-dusk-400">
                +{photoCount - 6}
              </div>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

// Fetch entity data based on type
async function fetchEntityData(
  entityType: EntityType,
  entityId: number
): Promise<Location | Activity | Lodging | Transportation | JournalEntry | Photo | AlbumWithPhotos | SavedLink | CustomItem> {
  switch (entityType) {
    case 'LOCATION':
      return locationService.getLocationById(entityId);
    case 'ACTIVITY':
      return activityService.getActivityById(entityId);
    case 'LODGING':
      return lodgingService.getLodgingById(entityId);
    case 'TRANSPORTATION':
      return transportationService.getTransportationById(entityId);
    case 'JOURNAL_ENTRY':
      return journalEntryService.getJournalEntryById(entityId);
    case 'PHOTO':
      return photoService.getPhotoById(entityId);
    case 'PHOTO_ALBUM':
      return photoService.getAlbumById(entityId);
    case 'SAVED_LINK':
      return savedLinkService.getSavedLinkById(entityId);
    case 'CUSTOM_ITEM':
      return customItemService.getCustomItemById(entityId);
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

export default function EntityDetailModal({
  isOpen,
  onClose,
  tripId,
  entityType,
  entityId,
}: EntityDetailModalProps) {
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const config = ENTITY_TYPE_CONFIG[entityType];

  // Fetch entity data
  const {
    data: entity,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['entity', entityType, entityId],
    queryFn: () => fetchEntityData(entityType, entityId),
    enabled: isOpen,
  });

  // Handle keyboard events including focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap - Tab key handling
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, go to last
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab: if on last element, go to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element to restore later
      triggerElementRef.current = document.activeElement as HTMLElement;

      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      // Focus the modal when it opens
      setTimeout(() => {
        const closeButton = modalRef.current?.querySelector<HTMLElement>('button[aria-label="Close"]');
        closeButton?.focus();
      }, 0);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        // Return focus to the trigger element
        triggerElementRef.current?.focus();
      };
    }
  }, [isOpen, handleKeyDown]);

  // Handle edit button - navigate to the entity's tab with edit param
  const handleEdit = () => {
    setIsNavigating(true);
    onClose();
    // Albums have their own detail page, so they bypass the tab map
    if (entityType === 'PHOTO_ALBUM') {
      navigate(`/trips/${tripId}/albums/${entityId}?edit=true`);
    } else {
      const tab = ENTITY_TYPE_TO_TAB[entityType];
      if (tab) {
        navigate(`/trips/${tripId}?tab=${tab}&edit=${entityId}`);
      }
    }
  };

  // Render entity details based on type
  const renderDetails = () => {
    if (!entity) return null;

    switch (entityType) {
      case 'LOCATION':
        return <LocationDetails entity={entity as Location} />;
      case 'ACTIVITY':
        return <ActivityDetails entity={entity as Activity} />;
      case 'LODGING':
        return <LodgingDetails entity={entity as Lodging} />;
      case 'TRANSPORTATION':
        return <TransportationDetails entity={entity as Transportation} />;
      case 'JOURNAL_ENTRY':
        return <JournalDetails entity={entity as JournalEntry} />;
      case 'PHOTO':
        return <PhotoDetails entity={entity as Photo} />;
      case 'PHOTO_ALBUM':
        return <AlbumDetails entity={entity as AlbumWithPhotos} />;
      case 'SAVED_LINK':
        return <SavedLinkDetails entity={entity as SavedLink} />;
      case 'CUSTOM_ITEM':
        return <CustomItemDetails entity={entity as CustomItem} />;
      default:
        return <p>Unknown entity type</p>;
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-detail-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white dark:bg-dusk-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-dusk-700 flex-shrink-0">
          <h2
            id="entity-detail-modal-title"
            className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <span>{config.emoji}</span>
            <span>{config.label} Details</span>
          </h2>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-dusk-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 dark:text-red-400">
              Failed to load details
            </div>
          ) : (
            renderDetails()
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 sm:p-6 border-t border-gray-200 dark:border-dusk-700 flex-shrink-0 bg-gray-50 dark:bg-dusk-800/50">
          <button
            type="button"
            onClick={handleEdit}
            disabled={isNavigating}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dusk-300 bg-white dark:bg-dusk-700 border border-gray-300 dark:border-dusk-600 rounded-lg hover:bg-gray-50 dark:hover:bg-dusk-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isNavigating ? 'Loading' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
