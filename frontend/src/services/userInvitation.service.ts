import axios from '../lib/axios';
import type {
  UserInvitation,
  UserInvitationPublicInfo,
  SendUserInvitationInput,
  AcceptInvitationInput,
  AcceptInvitationResponse,
  EmailStatusResponse,
} from '../types/userInvitation';

const userInvitationService = {
  /**
   * Check if email is configured on the backend
   */
  async getEmailStatus(): Promise<EmailStatusResponse> {
    const response = await axios.get('/user-invitations/email-status');
    return response.data;
  },

  /**
   * Get all invitations sent by the current user
   * Backend returns { invitations, total, page, totalPages }
   * after the axios interceptor unwraps { status, data }
   */
  async getSentInvitations(): Promise<UserInvitation[]> {
    const response = await axios.get('/user-invitations');
    return response.data?.invitations ?? [];
  },

  /**
   * Send a new invitation
   */
  async sendInvitation(data: SendUserInvitationInput): Promise<UserInvitation> {
    const response = await axios.post('/user-invitations', data);
    return response.data;
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(invitationId: number): Promise<{ message: string }> {
    const response = await axios.delete(`/user-invitations/${invitationId}`);
    return response.data;
  },

  /**
   * Resend an invitation (new token, extended expiry)
   */
  async resendInvitation(invitationId: number): Promise<UserInvitation> {
    const response = await axios.post(`/user-invitations/${invitationId}/resend`);
    return response.data;
  },

  /**
   * Get invitation details by token (public, no auth required)
   */
  async getInvitationByToken(token: string): Promise<UserInvitationPublicInfo> {
    const response = await axios.get(`/user-invitations/token/${token}`);
    return response.data;
  },

  /**
   * Accept an invitation and create account
   */
  async acceptInvitation(data: AcceptInvitationInput): Promise<AcceptInvitationResponse> {
    const response = await axios.post('/user-invitations/accept', data);
    return response.data;
  },

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string): Promise<{ message: string }> {
    const response = await axios.post(`/user-invitations/decline/${token}`);
    return response.data;
  },
};

export default userInvitationService;
