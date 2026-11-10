import { useState, useEffect } from 'react';
import collaborationService from '../services/collaboration.service';
import type { TripInvitation, PermissionLevel } from '../types/collaboration';
import { getFullAssetUrl } from '../lib/config';
import { getApiErrorMessage } from '../lib/errors';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  view: 'View Only',
  edit: 'Can Edit',
  admin: 'Admin',
};

interface PendingInvitationsProps {
  onUpdate?: () => void;
}

export default function PendingInvitations({ onUpdate }: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      const data = await collaborationService.getMyInvitations();
      setInvitations(data);
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitation: TripInvitation) => {
    setProcessingId(invitation.id);
    try {
      const collaborator = await collaborationService.acceptInvitation(invitation.id);
      toast.success(`You're now a collaborator on "${invitation.trip.title}"`);
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      onUpdate?.();
      // Navigate to the trip
      navigate(`/trips/${collaborator.tripId}`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to accept invitation'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invitation: TripInvitation) => {
    setProcessingId(invitation.id);
    try {
      await collaborationService.declineInvitation(invitation.id);
      toast.success('Invitation declined');
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      onUpdate?.();
    } catch (err: unknown) {
      console.error('Failed to decline invitation:', err);
      toast.error(getApiErrorMessage(err, 'Failed to decline invitation'));
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-24 bg-gray-200 dark:bg-navy-700 rounded-lg" />
        <div className="h-24 bg-gray-200 dark:bg-navy-700 rounded-lg" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          Pending Invitations
        </h3>
        <span className="px-2 py-1 text-xs font-medium bg-gold/20 text-gold rounded-full">
          {invitations.length} new
        </span>
      </div>

      <div className="space-y-3">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="bg-gradient-to-r from-gold/5 to-gold/10 dark:from-gold/5 dark:to-gold/10 border border-gold/30 rounded-xl p-4"
          >
            {/* Trip Info */}
            <div className="flex items-start gap-4 mb-4">
              {/* Trip Thumbnail */}
              <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-navy-700 flex-shrink-0 overflow-hidden">
                {invitation.trip.coverImageThumbnailPath || invitation.trip.coverPhoto?.thumbnailPath ? (
                  /* getFullAssetUrl returns string | null; React types src as
                     string | undefined, so null has to be bridged to undefined */
                  <img
                    src={
                      getFullAssetUrl(
                        invitation.trip.coverImageThumbnailPath || invitation.trip.coverPhoto?.thumbnailPath
                      ) ?? undefined
                    }
                    alt={invitation.trip.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                  {invitation.trip.title}
                </h4>
                {invitation.trip.startDate && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(invitation.trip.startDate)}
                    {invitation.trip.endDate && ` - ${formatDate(invitation.trip.endDate)}`}
                  </p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Invited by <span className="font-medium">{invitation.invitedBy.username}</span>
                </p>
              </div>

              {/* Permission Badge */}
              <span className="px-2 py-1 text-xs font-medium bg-white/50 dark:bg-navy-800/50 text-gray-700 dark:text-gray-300 rounded">
                {PERMISSION_LABELS[invitation.permissionLevel]}
              </span>
            </div>

            {/* Personal Message */}
            {invitation.message && (
              <div className="bg-white/50 dark:bg-navy-800/50 rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                  "{invitation.message}"
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handleAccept(invitation)}
                disabled={processingId === invitation.id}
                className="flex-1 px-4 py-2 bg-gold text-navy-900 rounded-lg hover:bg-gold/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processingId === invitation.id ? (
                  <span className="w-4 h-4 border-2 border-navy-900/30 border-t-navy-900 rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Accept
                  </>
                )}
              </button>
              <button
                onClick={() => handleDecline(invitation)}
                disabled={processingId === invitation.id}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-navy-800/50 rounded-lg hover:bg-white dark:hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
