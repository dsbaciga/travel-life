import { useState, useEffect, useCallback } from 'react';
import collaborationService from '../services/collaboration.service';
import type {
  Collaborator,
  TripInvitation,
  PermissionLevel,
  UserSummary,
} from '../types/collaboration';
import toast from 'react-hot-toast';
import InviteUserModal from './InviteUserModal';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useAuthStore } from '../store/authStore';

interface CollaboratorsManagerProps {
  tripId: number;
  tripTitle: string;
  isOwner: boolean;
  userPermission: PermissionLevel | null;
}

const PERMISSION_LABELS: Record<PermissionLevel, { label: string; color: string }> = {
  view: { label: 'View Only', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  edit: { label: 'Can Edit', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  admin: { label: 'Admin', color: 'bg-gold/20 text-gold dark:bg-gold/10 dark:text-gold' },
};

export default function CollaboratorsManager({
  tripId,
  tripTitle,
  isOwner,
  userPermission,
}: CollaboratorsManagerProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [owner, setOwner] = useState<UserSummary | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<TripInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { user } = useAuthStore();

  const canManageCollaborators = isOwner || userPermission === 'admin';

  const loadCollaborators = useCallback(async () => {
    try {
      const response = await collaborationService.getCollaborators(tripId);
      setCollaborators(response.collaborators);
      setOwner(response.owner);
    } catch (err) {
      console.error('Failed to load collaborators:', err);
      toast.error('Failed to load collaborators');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadPendingInvitations = useCallback(async () => {
    try {
      const invitations = await collaborationService.getTripInvitations(tripId);
      setPendingInvitations(invitations);
    } catch (err) {
      console.error('Failed to load invitations:', err);
    }
  }, [tripId]);

  useEffect(() => {
    loadCollaborators();
    if (canManageCollaborators) {
      loadPendingInvitations();
    }
  }, [tripId, canManageCollaborators, loadCollaborators, loadPendingInvitations]);

  const handleUpdatePermission = async (collaborator: Collaborator, newPermission: PermissionLevel) => {
    try {
      await collaborationService.updateCollaborator(tripId, collaborator.userId, {
        permissionLevel: newPermission,
      });
      toast.success('Permission updated');
      loadCollaborators();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to update permission');
    }
  };

  const handleRemoveCollaborator = async (collaborator: Collaborator) => {
    const confirmed = await confirm({
      title: 'Remove Collaborator',
      message: `Remove ${collaborator.user.username} from this trip?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await collaborationService.removeCollaborator(tripId, collaborator.userId);
      toast.success(`${collaborator.user.username} removed from trip`);
      loadCollaborators();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to remove collaborator');
    }
  };

  const handleCancelInvitation = async (invitation: TripInvitation) => {
    const confirmed = await confirm({
      title: 'Cancel Invitation',
      message: `Cancel invitation to ${invitation.email}?`,
      confirmLabel: 'Cancel Invitation',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await collaborationService.cancelInvitation(tripId, invitation.id);
      toast.success('Invitation cancelled');
      loadPendingInvitations();
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      toast.error('Failed to cancel invitation');
    }
  };

  const handleResendInvitation = async (invitation: TripInvitation) => {
    try {
      await collaborationService.resendInvitation(tripId, invitation.id);
      toast.success(`Invitation resent to ${invitation.email}`);
      loadPendingInvitations();
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      toast.error('Failed to resend invitation');
    }
  };

  const handleInvitationSent = () => {
    loadPendingInvitations();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 dark:bg-navy-700 rounded-lg" />
        <div className="h-12 bg-gray-200 dark:bg-navy-700 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Collaborators</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {collaborators.length === 0
              ? 'No collaborators yet'
              : `${collaborators.length} collaborator${collaborators.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {canManageCollaborators && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-gold text-navy-900 rounded-lg hover:bg-gold/90 transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Invite
          </button>
        )}
      </div>

      {/* Owner */}
      {owner && (
        <div className="bg-gray-50 dark:bg-navy-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center text-gold font-medium">
              {owner.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <span className="truncate">{owner.username}</span>
                {user?.id === owner.id && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">(You)</span>
                )}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{owner.email}</div>
            </div>
            <span className="px-2 py-1 text-xs font-medium bg-gold/20 text-gold rounded shrink-0">Owner</span>
          </div>
        </div>
      )}

      {/* Collaborators List */}
      {collaborators.length > 0 && (
        <div className="space-y-3">
          {collaborators.map((collaborator) => (
            <div
              key={collaborator.id}
              className="bg-gray-50 dark:bg-navy-700/50 rounded-lg p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                  {collaborator.user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    {collaborator.user.username}
                    {user?.id === collaborator.userId && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">(You)</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {collaborator.user.email}
                  </div>
                </div>

                {/* Permission Badge / Selector */}
                {canManageCollaborators && user?.id !== collaborator.userId ? (
                  <select
                    value={collaborator.permissionLevel}
                    onChange={(e) =>
                      handleUpdatePermission(collaborator, e.target.value as PermissionLevel)
                    }
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gold/30 rounded-lg bg-white dark:bg-navy-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold focus:border-transparent"
                  >
                    <option value="view">View Only</option>
                    <option value="edit">Can Edit</option>
                    {isOwner && <option value="admin">Admin</option>}
                  </select>
                ) : (
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      PERMISSION_LABELS[collaborator.permissionLevel].color
                    }`}
                  >
                    {PERMISSION_LABELS[collaborator.permissionLevel].label}
                  </span>
                )}

                {/* Remove Button */}
                {canManageCollaborators && user?.id !== collaborator.userId && (
                  <button
                    onClick={() => handleRemoveCollaborator(collaborator)}
                    className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Remove collaborator"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-400">
                Added {formatDate(collaborator.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Invitations */}
      {canManageCollaborators && pendingInvitations.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Pending Invitations ({pendingInvitations.length})
          </h4>
          <div className="space-y-3">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white truncate">
                      {invitation.email}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Expires {formatDate(invitation.expiresAt)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      PERMISSION_LABELS[invitation.permissionLevel].color
                    }`}
                  >
                    {PERMISSION_LABELS[invitation.permissionLevel].label}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResendInvitation(invitation)}
                      className="p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                      title="Resend invitation"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleCancelInvitation(invitation)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Cancel invitation"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {collaborators.length === 0 && pendingInvitations.length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-navy-700 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No collaborators yet</h4>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Invite others to view or help plan this trip
          </p>
          {canManageCollaborators && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-gold text-navy-900 rounded-lg hover:bg-gold/90 transition-colors font-medium"
            >
              Send an Invitation
            </button>
          )}
        </div>
      )}

      {/* Invite Modal */}
      <InviteUserModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        tripId={tripId}
        tripTitle={tripTitle}
        onInvitationSent={handleInvitationSent}
      />

      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  );
}
