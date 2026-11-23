import { useState, useEffect, useMemo, useCallback } from 'react';
import type { EntityType } from '../types/entityLink';
import type { Location } from '../types/location';
import type { Activity } from '../types/activity';
import type { Lodging } from '../types/lodging';
import type { Transportation } from '../types/transportation';
import type { Photo } from '../types/photo';
import type { JournalEntry } from '../types/journalEntry';
import type { PhotoAlbum } from '../types/photo';
import type { SavedLink } from '../types/savedLink';
import {
  savedLinkDisplayTitle,
  savedLinkHostname,
} from '../types/savedLink';
import savedLinkService from '../services/savedLink.service';
import customItemService from '../services/customItem.service';
import type { CustomItem } from '../types/customItem';
import locationService from '../services/location.service';
import activityService from '../services/activity.service';
import lodgingService from '../services/lodging.service';
import transportationService from '../services/transportation.service';
import photoService from '../services/photo.service';
import journalEntryService from '../services/journalEntry.service';
import toast from 'react-hot-toast';

export type EntityItem = {
  id: number;
  name: string;
  subtitle?: string;
  thumbnailPath?: string;
};

// Default page size for photo pagination
const PHOTO_PAGE_SIZE = 24;

/**
 * Hook for fetching entities of a specific type for a trip
 * Centralizes the entity fetching logic used by picker modals
 * Photos support pagination with load more functionality
 */
export function useEntityFetcher(tripId: number, entityType: EntityType | null) {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Reset state when entity type changes
  useEffect(() => {
    setEntities([]);
    setHasMore(false);
    setTotal(0);
  }, [entityType]);

  useEffect(() => {
    if (!entityType) {
      setEntities([]);
      return;
    }

    let isMounted = true;

    const fetchEntities = async () => {
      setLoading(true);
      setError(null);
      try {
        let items: EntityItem[] = [];

        switch (entityType) {
          case 'PHOTO': {
            // Fetch first page of photos with pagination
            const result = await photoService.getPhotosByTrip(tripId, {
              skip: 0,
              take: PHOTO_PAGE_SIZE,
            });
            const photos = result.photos;
            items = photos.map((photo: Photo) => ({
              id: photo.id,
              name: photo.caption || `Photo ${photo.id}`,
              subtitle: photo.takenAt || undefined,
              thumbnailPath: photo.thumbnailPath || photo.localPath || undefined,
            }));
            if (isMounted) {
              setHasMore(result.hasMore);
              setTotal(result.total);
            }
            break;
          }

          case 'LOCATION': {
            const locations = await locationService.getLocationsByTrip(tripId);
            items = locations.map((loc: Location) => ({
              id: loc.id,
              name: loc.name,
              subtitle: loc.address || undefined,
            }));
            break;
          }

          case 'ACTIVITY': {
            const activities = await activityService.getActivitiesByTrip(tripId);
            items = activities.map((act: Activity) => ({
              id: act.id,
              name: act.name,
              subtitle: act.category || undefined,
            }));
            break;
          }

          case 'LODGING': {
            const lodgings = await lodgingService.getLodgingByTrip(tripId);
            items = lodgings.map((lod: Lodging) => ({
              id: lod.id,
              name: lod.name,
              subtitle: lod.type,
            }));
            break;
          }

          case 'TRANSPORTATION': {
            const transports = await transportationService.getTransportationByTrip(tripId);
            items = transports.map((trans: Transportation) => ({
              id: trans.id,
              name: `${trans.type}${trans.carrier ? ` - ${trans.carrier}` : ''}`,
              subtitle: trans.fromLocationName || trans.fromLocation?.name || undefined,
            }));
            break;
          }

          case 'JOURNAL_ENTRY': {
            const entries = await journalEntryService.getJournalEntriesByTrip(tripId);
            items = entries.map((entry: JournalEntry) => ({
              id: entry.id,
              name: entry.title || `${entry.entryType} Entry`,
              subtitle: entry.date || undefined,
            }));
            break;
          }

          case 'PHOTO_ALBUM': {
            const albumsResult = await photoService.getAlbumsByTrip(tripId);
            items = albumsResult.albums.map((album: PhotoAlbum) => ({
              id: album.id,
              name: album.name,
              subtitle: album.description || undefined,
            }));
            break;
          }

          case 'SAVED_LINK': {
            const links = await savedLinkService.getSavedLinksByTrip(tripId);
            items = links.map((link: SavedLink) => ({
              id: link.id,
              name: savedLinkDisplayTitle(link),
              subtitle: savedLinkHostname(link),
            }));
            break;
          }

          case 'CUSTOM_ITEM': {
            const customItems = await customItemService.getCustomItemsByTrip(tripId);
            items = customItems.map((item: CustomItem) => ({
              id: item.id,
              name: item.name,
              subtitle: item.type?.name || undefined,
            }));
            break;
          }
        }

        if (isMounted) {
          setEntities(items);
        }
      } catch (err) {
        console.error('Failed to fetch entities:', err);
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Couldn't load items. Try again."));
          toast.error("Couldn't load items. Try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchEntities();

    return () => {
      isMounted = false;
    };
  }, [entityType, tripId]);

  // Load more function for paginated entities (photos)
  const loadMore = useCallback(async () => {
    if (!entityType || entityType !== 'PHOTO' || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const result = await photoService.getPhotosByTrip(tripId, {
        skip: entities.length,
        take: PHOTO_PAGE_SIZE,
      });
      const newItems = result.photos.map((photo: Photo) => ({
        id: photo.id,
        name: photo.caption || `Photo ${photo.id}`,
        subtitle: photo.takenAt || undefined,
        thumbnailPath: photo.thumbnailPath || photo.localPath || undefined,
      }));
      setEntities((prev) => [...prev, ...newItems]);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load more photos:', err);
      toast.error("Couldn't load more photos. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [entityType, tripId, entities.length, loadingMore, hasMore]);

  return { entities, loading, loadingMore, error, hasMore, total, loadMore };
}

/**
 * Hook for filtering entities by search query
 */
export function useEntityFilter(entities: EntityItem[], searchQuery: string) {
  return useMemo(() => {
    if (!searchQuery.trim()) return entities;
    const query = searchQuery.toLowerCase();
    return entities.filter(
      (entity) =>
        entity.name.toLowerCase().includes(query) ||
        entity.subtitle?.toLowerCase().includes(query)
    );
  }, [entities, searchQuery]);
}

export default useEntityFetcher;
