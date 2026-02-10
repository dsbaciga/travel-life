import axios from '../lib/axios';
import type { Tag, TripTag, CreateTagInput, UpdateTagInput } from '../types/tag';

const tagService = {
  async createTag(data: CreateTagInput): Promise<Tag> {
    const response = await axios.post('/tags', data);
    return response.data;
  },

  async getTagsByUser(): Promise<Tag[]> {
    const response = await axios.get('/tags');
    return response.data;
  },

  async getTagById(tagId: number): Promise<Tag> {
    const response = await axios.get(`/tags/${tagId}`);
    return response.data;
  },

  async updateTag(tagId: number, data: UpdateTagInput): Promise<Tag> {
    const response = await axios.put(`/tags/${tagId}`, data);
    return response.data;
  },

  async deleteTag(tagId: number): Promise<void> {
    await axios.delete(`/tags/${tagId}`);
  },

  async linkTagToTrip(tripId: number, tagId: number): Promise<void> {
    await axios.post('/tags/link', { tripId, tagId });
  },

  async unlinkTagFromTrip(tripId: number, tagId: number): Promise<void> {
    await axios.delete(`/tags/trips/${tripId}/tags/${tagId}`);
  },

  async assignTagToTrip(tripId: number, tagId: number): Promise<void> {
    await axios.post('/tags/link', { tripId, tagId });
  },

  async removeTagFromTrip(tripId: number, tagId: number): Promise<void> {
    await axios.delete(`/tags/trips/${tripId}/tags/${tagId}`);
  },

  async getTagsByTrip(tripId: number): Promise<TripTag[]> {
    const response = await axios.get(`/tags/trips/${tripId}`);
    return response.data;
  },

  async reorderTags(tagIds: number[]): Promise<TripTag[]> {
    const response = await axios.put('/tags/reorder', { tagIds });
    return response.data;
  },

  async getAllTags(): Promise<TripTag[]> {
    const response = await axios.get('/tags');
    return response.data;
  },
};

export default tagService;
