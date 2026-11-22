import axios from '../lib/axios';
import type {
  EntityType,
  EntityLink,
  EnrichedEntityLink,
  CreateEntityLinkInput,
  BulkCreateEntityLinksInput,
  BulkLinkPhotosInput,
  DeleteEntityLinkInput,
  UpdateEntityLinkInput,
  BulkLinkResult,
  EntityLinksResponse,
  TripLinkSummary,
} from '../types/entityLink';
import type { Photo } from '../types/photo';
import type {
  ApplyPhotoActivityLinksInput,
  PhotoActivitySuggestionsResponse,
} from '../types/photoAutoLink';

const entityLinkService = {
  /**
   * Create a single link between two entities
   */
  async createLink(tripId: number, data: CreateEntityLinkInput): Promise<EntityLink> {
    const response = await axios.post(`/trips/${tripId}/links`, data);
    return response.data;
  },

  /**
   * Bulk create links from one source to multiple targets
   */
  async bulkCreateLinks(
    tripId: number,
    data: BulkCreateEntityLinksInput
  ): Promise<BulkLinkResult> {
    const response = await axios.post(`/trips/${tripId}/links/bulk`, data);
    return response.data;
  },

  /**
   * Bulk link multiple photos to a single target
   */
  async bulkLinkPhotos(tripId: number, data: BulkLinkPhotosInput): Promise<BulkLinkResult> {
    const response = await axios.post(`/trips/${tripId}/links/photos`, data);
    return response.data;
  },

  /**
   * Suggest an activity for each unlinked photo, by when it was taken.
   * Nothing is linked until the reviewed result goes to `applyPhotoActivityLinks`.
   */
  async getPhotoActivitySuggestions(tripId: number): Promise<PhotoActivitySuggestionsResponse> {
    const response = await axios.get<PhotoActivitySuggestionsResponse>(
      `/trips/${tripId}/links/photos/activity-suggestions`
    );
    return response.data;
  },

  /**
   * Link the photos the user kept to their suggested activities
   */
  async applyPhotoActivityLinks(
    tripId: number,
    data: ApplyPhotoActivityLinksInput
  ): Promise<BulkLinkResult> {
    const response = await axios.post<BulkLinkResult>(
      `/trips/${tripId}/links/photos/activity-suggestions`,
      data
    );
    return response.data;
  },

  /**
   * Get links from a specific entity
   */
  async getLinksFrom(
    tripId: number,
    sourceType: EntityType,
    sourceId: number,
    targetType?: EntityType
  ): Promise<EnrichedEntityLink[]> {
    const params = targetType ? { targetType } : {};
    const response = await axios.get(
      `/trips/${tripId}/links/from/${sourceType}/${sourceId}`,
      { params }
    );
    return response.data;
  },

  /**
   * Get links to a specific entity
   */
  async getLinksTo(
    tripId: number,
    targetType: EntityType,
    targetId: number,
    sourceType?: EntityType
  ): Promise<EnrichedEntityLink[]> {
    const params = sourceType ? { sourceType } : {};
    const response = await axios.get(
      `/trips/${tripId}/links/to/${targetType}/${targetId}`,
      { params }
    );
    return response.data;
  },

  /**
   * Get all links for an entity (both directions)
   */
  async getAllLinksForEntity(
    tripId: number,
    entityType: EntityType,
    entityId: number
  ): Promise<EntityLinksResponse> {
    const response = await axios.get(
      `/trips/${tripId}/links/entity/${entityType}/${entityId}`
    );
    return response.data;
  },

  /**
   * Get photos linked to an entity
   */
  async getPhotosForEntity(
    tripId: number,
    entityType: EntityType,
    entityId: number
  ): Promise<Photo[]> {
    const response = await axios.get(
      `/trips/${tripId}/links/photos/${entityType}/${entityId}`
    );
    return response.data;
  },

  /**
   * Get link summary for entire trip
   */
  async getTripLinkSummary(tripId: number): Promise<TripLinkSummary> {
    const response = await axios.get(`/trips/${tripId}/links/summary`);
    return response.data;
  },

  /**
   * Get all links targeting a specific entity type
   * Useful for building entity-to-location mappings for timeline
   */
  async getLinksByTargetType(
    tripId: number,
    targetType: EntityType
  ): Promise<Array<{ sourceType: EntityType; sourceId: number; targetId: number }>> {
    const response = await axios.get(`/trips/${tripId}/links/target-type/${targetType}`);
    return response.data;
  },

  /**
   * Delete a specific link by source/target
   */
  async deleteLink(tripId: number, data: DeleteEntityLinkInput): Promise<void> {
    await axios.delete(`/trips/${tripId}/links`, { data });
  },

  /**
   * Delete a link by ID
   */
  async deleteLinkById(tripId: number, linkId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/links/${linkId}`);
  },

  /**
   * Update a link (relationship and/or notes)
   */
  async updateLink(tripId: number, linkId: number, data: UpdateEntityLinkInput): Promise<EntityLink> {
    const response = await axios.patch(`/trips/${tripId}/links/${linkId}`, data);
    return response.data;
  },

  /**
   * Delete all links for an entity
   */
  async deleteAllLinksForEntity(
    tripId: number,
    entityType: EntityType,
    entityId: number
  ): Promise<{ deleted: number }> {
    const response = await axios.delete(
      `/trips/${tripId}/links/entity/${entityType}/${entityId}`
    );
    return response.data;
  },

  /**
   * Get all links for a trip (for offline caching)
   */
  async getTripLinks(tripId: number): Promise<EntityLink[]> {
    const response = await axios.get(`/trips/${tripId}/links`);
    return response.data;
  },

};

export default entityLinkService;
