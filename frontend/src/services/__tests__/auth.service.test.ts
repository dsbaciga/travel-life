import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../lib/axios';
import authService from '../auth.service';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should call POST /auth/register with registration data', async () => {
      const registerData = { username: 'testuser', email: 'test@example.com', password: 'password123' };
      const mockResponse = { user: { id: 1, username: 'testuser', email: 'test@example.com' }, accessToken: 'token123' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await authService.register(registerData);

      expect(api.post).toHaveBeenCalledWith('/auth/register', registerData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors on registration failure', async () => {
      const registerData = { username: 'testuser', email: 'test@example.com', password: 'password123' };
      const error = new Error('Email already exists');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(authService.register(registerData)).rejects.toThrow('Email already exists');
    });
  });

  describe('login', () => {
    it('should call POST /auth/login with login credentials', async () => {
      const loginData = { email: 'test@example.com', password: 'password123' };
      const mockResponse = { user: { id: 1, username: 'testuser', email: 'test@example.com' }, accessToken: 'token123' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await authService.login(loginData);

      expect(api.post).toHaveBeenCalledWith('/auth/login', loginData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors on login failure', async () => {
      const loginData = { email: 'test@example.com', password: 'wrongpassword' };
      const error = new Error('Invalid credentials');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('getCurrentUser', () => {
    it('should call GET /auth/me and return user data', async () => {
      const mockUser = { id: 1, username: 'testuser', email: 'test@example.com' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockUser });

      const result = await authService.getCurrentUser();

      expect(api.get).toHaveBeenCalledWith('/auth/me');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUser);
    });

    it('should propagate errors when not authenticated', async () => {
      const error = new Error('Unauthorized');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(authService.getCurrentUser()).rejects.toThrow('Unauthorized');
    });
  });

  describe('logout', () => {
    it('should call POST /auth/logout', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await authService.logout();

      expect(api.post).toHaveBeenCalledWith('/auth/logout');
      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on logout failure', async () => {
      const error = new Error('Server error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(authService.logout()).rejects.toThrow('Server error');
    });
  });

  describe('silentRefresh', () => {
    it('should call POST /auth/silent-refresh and return user data with token', async () => {
      const mockResponse = { user: { id: 1, username: 'testuser' }, accessToken: 'newtoken123' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await authService.silentRefresh();

      expect(api.post).toHaveBeenCalledWith('/auth/silent-refresh');
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should return null when silent refresh fails', async () => {
      const error = new Error('No session');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await authService.silentRefresh();

      expect(result).toBeNull();
    });

    it('should return null when backend returns null data', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      const result = await authService.silentRefresh();

      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    it('should call POST /auth/refresh and return new access token', async () => {
      const mockResponse = { accessToken: 'refreshedtoken123' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await authService.refreshToken();

      expect(api.post).toHaveBeenCalledWith('/auth/refresh');
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors when refresh fails', async () => {
      const error = new Error('Refresh token expired');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(authService.refreshToken()).rejects.toThrow('Refresh token expired');
    });
  });
});
