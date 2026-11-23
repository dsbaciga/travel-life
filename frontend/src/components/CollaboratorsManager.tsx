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
import Icon from './ui/Icon';

interface CollaboratorsManagerProps {
  tripId: number;
  tripTitle: string;
  isOwner: boolean;
  userPermission: PermissionLevel | null;
}

const PERMISSION_LABELS: Record<PermissionLevel, { label: string; color: string }> = {
  view: { label: 'View only', color: 'bg-gray-100 text-gray-700 dark:bg-dusk-700 dark:text-dusk-300' },
  edit: { label: 'Can edit', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
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
      toast.error("Couldn't load collaborators. Try again.");
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
      toast.error(error.response?.data?.message || "Couldn't update permission. Try again.");
    }
  };

  const handleRemoveCollaborator = async (collaborator: Collaborator) => {
    const confirmed = await confirm({
      title: 'Remove collaborator',
      message: `${collaborator.user.username} loses access to this trip.`,
      confirmLabel: 'Remove collaborator',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await collaborationService.removeCollaborator(tripId, collaborator.userId);
      toast.success(`${collaborator.user.username} removed from trip`);
      loadCollaborators();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Couldn't remove collaborator. Try again.");
    }
  };

  const handleCancelInvitation = async (invitation: TripInvitation) => {
    const confirmed = await confirm({
      title: 'Cancel invitation',
      message: `The invitation to ${invitation.email} is cancelled.`,
      confirmLabel: 'Cancel invitation',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await collaborationService.cancelInvitation(tripId, invitation.id);
      toast.success('Invitation cancelled');
      loadPendingInvitations();
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      toast.error("Couldn't cancel invitation. Try again.");
    }
  };

  const handleResendInvitation = async (invitation: TripInvitation) => {
    try {
      await collaborationService.resendInvitation(tripId, invitation.id);
      toast.success(`Invitation resent to ${invitation.email}`);
      loadPendingInvitations();
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      toast.error("Couldn't resend invitation. Try again.");
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
          <p className="text-sm text-gray-500 dark:text-dusk-400">
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
            <Icon name="add" />
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
                  <span className="text-xs text-gray-500 dark:text-dusk-400 shrink-0">(You)</span>
                )}
              </div>
              <div className="text-sm text-gray-500 dark:text-dusk-400 truncate">{owner.email}</div>
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
                <div className="w-10 h-10 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                  {collaborator.user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 basis-[calc(100%-3.5rem)] sm:basis-0">
                  <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2 break-words [overflow-wrap:anywhere]">
                    {collaborator.user.username}
                    {user?.id === collaborator.userId && (
                      <span className="text-xs text-gray-500 dark:text-dusk-400">(You)</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-dusk-400 break-all sm:truncate">
                    {collaborator.user.email}
                  </div>
                </div>

                <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:justify-start sm:gap-3">
                {/* Permission Badge / Selector */}
                {canManageCollaborators && user?.id !== collaborator.userId ? (
                  <select
                    value={collaborator.permissionLevel}
                    onChange={(e) =>
                      handleUpdatePermission(collaborator, e.target.value as PermissionLevel)
                    }
                    className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gold/30 rounded-lg bg-white dark:bg-navy-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold focus:border-transparent"
                  >
                    <option value="view">View only</option>
                    <option value="edit">Can edit</option>
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
                    <Icon name="delete" />
                  </button>
                )}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-dusk-400">
                Added {formatDate(collaborator.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Invitations */}
      {canManageCollaborators && pendingInvitations.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-dusk-300 mb-3">
            Pending Invitations ({pendingInvitations.length})
          </h4>
          <div className="space-y-3">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg p-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                    <Icon name="mail" />
                  </div>
                  <div className="flex-1 min-w-0 basis-[calc(100%-3.5rem)] sm:basis-0">
                    <div className="font-medium text-gray-900 dark:text-white break-all sm:truncate">
                      {invitation.email}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-dusk-400">
                      Expires {formatDate(invitation.expiresAt)}
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-3">
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
                      <Icon name="refresh" />
                    </button>
                    <button
                      onClick={() => handleCancelInvitation(invitation)}
                      className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title="Cancel invitation"
                    >
                      <Icon name="close" />
                    </button>
                  </div>
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
            <Icon name="users" size={32} className="text-gray-400 dark:text-dusk-400" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No collaborators yet</h4>
          <p className="text-gray-500 dark:text-dusk-400 mb-4">
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
