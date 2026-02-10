import axios from '../lib/axios';
import type { User, UpdateUserSettingsInput, UserSearchResult, TravelPartnerSettings, UpdateTravelPartnerInput } from '../types/user';

export interface SmtpSettingsResponse {
  smtpProvider: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpPasswordSet: boolean;
  smtpConfigured: boolean;
}

export interface UpdateSmtpSettingsInput {
  smtpProvider?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFrom?: string | null;
}

const userService = {
  async getMe(): Promise<User> {
    const response = await axios.get('/users/me');
    return response.data;
  },

  async updateSettings(data: UpdateUserSettingsInput): Promise<User> {
    const response = await axios.put('/users/settings', data);
    return response.data;
  },

  async updateUsername(username: string): Promise<{ success: boolean; message: string; username: string }> {
    const response = await axios.put('/users/username', { username });
    return response.data;
  },

  async updatePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const response = await axios.put('/users/password', { currentPassword, newPassword });
    return response.data;
  },

  async getWeatherSettings(): Promise<{ weatherApiKeySet: boolean }> {
    const response = await axios.get('/users/weather-settings');
    return response.data;
  },

  async updateWeatherSettings(data: { weatherApiKey: string | null }): Promise<{ success: boolean; message: string; weatherApiKeySet: boolean }> {
    const response = await axios.put('/users/weather-settings', data);
    return response.data;
  },

  async getAviationstackSettings(): Promise<{ aviationstackApiKeySet: boolean }> {
    const response = await axios.get('/users/aviationstack-settings');
    return response.data;
  },

  async updateAviationstackSettings(data: { aviationstackApiKey: string | null }): Promise<{ success: boolean; message: string; aviationstackApiKeySet: boolean }> {
    const response = await axios.put('/users/aviationstack-settings', data);
    return response.data;
  },

  async getOpenrouteserviceSettings(): Promise<{ openrouteserviceApiKeySet: boolean }> {
    const response = await axios.get('/users/openrouteservice-settings');
    return response.data;
  },

  async updateOpenrouteserviceSettings(data: { openrouteserviceApiKey: string | null }): Promise<{ success: boolean; message: string; openrouteserviceApiKeySet: boolean }> {
    const response = await axios.put('/users/openrouteservice-settings', data);
    return response.data;
  },

  async getSmtpSettings(): Promise<SmtpSettingsResponse> {
    const response = await axios.get('/users/smtp-settings');
    return response.data;
  },

  async updateSmtpSettings(data: UpdateSmtpSettingsInput): Promise<{ success: boolean; message: string; smtpConfigured: boolean }> {
    const response = await axios.put('/users/smtp-settings', data);
    return response.data;
  },

  async testSmtpSettings(): Promise<{ success: boolean; message: string }> {
    const response = await axios.post('/users/smtp-settings/test');
    return response.data;
  },

  async renameTripType(oldName: string, newName: string): Promise<{ success: boolean; message: string; tripTypes: Array<{ name: string; emoji: string }> }> {
    const response = await axios.put('/users/settings/trip-types/rename', { oldName, newName });
    return response.data;
  },

  async deleteTripType(typeName: string): Promise<{ success: boolean; message: string; tripTypes: Array<{ name: string; emoji: string }> }> {
    const response = await axios.delete(`/users/settings/trip-types/${encodeURIComponent(typeName)}`);
    return response.data;
  },

  async renameCategory(oldName: string, newName: string): Promise<{ success: boolean; message: string; categories: Array<{ name: string; emoji: string }> }> {
    const response = await axios.put('/users/settings/categories/rename', { oldName, newName });
    return response.data;
  },

  async deleteCategory(categoryName: string): Promise<{ success: boolean; message: string; categories: Array<{ name: string; emoji: string }> }> {
    const response = await axios.delete(`/users/settings/categories/${encodeURIComponent(categoryName)}`);
    return response.data;
  },

  async searchUsers(query: string, signal?: AbortSignal): Promise<UserSearchResult[]> {
    const response = await axios.get('/users/search', { params: { query }, signal });
    return response.data;
  },

  async getTravelPartnerSettings(): Promise<TravelPartnerSettings> {
    const response = await axios.get('/users/travel-partner');
    return response.data;
  },

  async updateTravelPartnerSettings(data: UpdateTravelPartnerInput): Promise<TravelPartnerSettings & { success: boolean; message: string }> {
    const response = await axios.put('/users/travel-partner', data);
    return response.data;
  },
};

export default userService;
