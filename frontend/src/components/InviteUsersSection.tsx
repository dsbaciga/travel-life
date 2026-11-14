import { useState, useEffect, useId } from 'react';
import { isAxiosError } from 'axios';
import userInvitationService from '../services/userInvitation.service';
import type { UserInvitation } from '../types/userInvitation';
import toast from 'react-hot-toast';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import PendingInvitations from './PendingInvitations';

export default function InviteUsersSection() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [resendingId, setResendingId] = useState<number | null>(null);

  const emailInputId = useId();
  const messageInputId = useId();

  useEffect(() => {
    loadInvitations();
    checkEmailStatus();
  }, []);

  const loadInvitations = async () => {
    try {
      const data = await userInvitationService.getSentInvitations();
      setInvitations(data);
    } catch (error) {
      console.error('Failed to load invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkEmailStatus = async () => {
    try {
      const status = await userInvitationService.getEmailStatus();
      setEmailConfigured(status.emailConfigured);
    } catch (error) {
      console.error('Failed to check email status:', error);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setSending(true);
    try {
      const invitation = await userInvitationService.sendInvitation({
        email: email.trim(),
        message: message.trim() || undefined,
      });

      setEmail('');
      setMessage('');
      await loadInvitations();

      if (invitation.emailSent) {
        toast.success('Invitation sent successfully!');
      } else {
        toast.success('Invitation created! Email will be sent when SMTP is configured.');
      }
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to send invitation');
      } else {
        toast.error('Failed to send invitation');
      }
    } finally {
      setSending(false);
    }
  };

  const handleCancelInvitation = async (invitationId: number) => {
    const confirmed = await confirm({
      title: 'Cancel Invitation',
      message: 'Are you sure you want to cancel this invitation?',
      confirmLabel: 'Cancel Invitation',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await userInvitationService.cancelInvitation(invitationId);
      toast.success('Invitation cancelled');
      await loadInvitations();
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to cancel invitation');
      } else {
        toast.error('Failed to cancel invitation');
      }
    }
  };

  const handleResendInvitation = async (invitationId: number) => {
    setResendingId(invitationId);
    try {
      const invitation = await userInvitationService.resendInvitation(invitationId);
      await loadInvitations();

      if (invitation.emailSent) {
        toast.success('Invitation resent successfully!');
      } else {
        toast.success('Invitation updated! Email will be sent when SMTP is configured.');
      }
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || 'Failed to resend invitation');
      } else {
        toast.error('Failed to resend invitation');
      }
    } finally {
      setResendingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      PENDING: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-800 dark:text-yellow-200',
        label: 'Pending',
      },
      ACCEPTED: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-800 dark:text-green-200',
        label: 'Accepted',
      },
      DECLINED: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-800 dark:text-red-200',
        label: 'Declined',
      },
      EXPIRED: {
        bg: 'bg-gray-100 dark:bg-dusk-700',
        text: 'text-gray-800 dark:text-dusk-200',
        label: 'Expired',
      },
    };

    const badge = badges[status] || badges.PENDING;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Received Trip Collaboration Invitations */}
      <PendingInvitations onUpdate={loadInvitations} />

      {/* Email Configuration Warning */}
      {!emailConfigured && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Email Not Configured
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                SMTP is not configured on the server. Invitations will be created but emails won't be sent.
                Contact your administrator to configure email settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Send Invitation Form */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Invite Someone to Travel Life
        </h2>
        <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
          Send an invitation to someone you'd like to join Travel Life. They'll receive an email with a link to create their account.
        </p>

        <form onSubmit={handleSendInvitation} className="space-y-4">
          <div>
            <label htmlFor={emailInputId} className="label">
              Email Address
            </label>
            <input
              type="email"
              id={emailInputId}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              className="input w-full max-w-md"
              required
            />
          </div>

          <div>
            <label htmlFor={messageInputId} className="label">
              Personal Message (optional)
            </label>
            <textarea
              id={messageInputId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message to include in the invitation email..."
              className="input w-full max-w-md h-24 resize-none"
              maxLength={1000}
            />
            <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
              {message.length}/1000 characters
            </p>
          </div>

          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Invitation
              </>
            )}
          </button>
        </form>
      </div>

      {/* Sent Invitations List */}
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Sent Invitations
        </h2>

        {/* Accessibility: aria-live region for status updates */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {loading ? 'Loading invitations...' : `${invitations.length} invitation${invitations.length !== 1 ? 's' : ''} loaded`}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 dark:text-dusk-400 mt-2">Loading invitations...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 dark:text-dusk-400">
              No invitations sent yet. Invite someone to get started!
            </p>
          </div>
        ) : (
          <ul role="list" aria-label="Sent invitations" className="space-y-3">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="bg-gray-50 dark:bg-dusk-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {invitation.email}
                      </span>
                      {getStatusBadge(invitation.status)}
                    </div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
                      Sent {formatDate(invitation.createdAt)}
                      {invitation.status === 'PENDING' && (
                        <span className="ml-2">
                          · Expires {formatDate(invitation.expiresAt)}
                        </span>
                      )}
                      {invitation.status === 'ACCEPTED' && invitation.acceptedUser && (
                        <span className="ml-2">
                          · Joined as <span className="font-medium">{invitation.acceptedUser.username}</span>
                        </span>
                      )}
                    </div>
                    {invitation.message && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-dusk-300 italic">
                        "{invitation.message}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {(invitation.status === 'PENDING' || invitation.status === 'EXPIRED') && (
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResendInvitation(invitation.id)}
                        disabled={resendingId === invitation.id}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50"
                      >
                        {resendingId === invitation.id ? 'Resending...' : 'Resend'}
                      </button>
                      {invitation.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialogComponent />
    </div>
  );
}
