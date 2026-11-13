import { useState, useId } from 'react';
import Modal from './Modal';
import collaborationService from '../services/collaboration.service';
import type { PermissionLevel, TripInvitation } from '../types/collaboration';
import toast from 'react-hot-toast';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: number;
  tripTitle: string;
  onInvitationSent?: (invitation: TripInvitation) => void;
}

const PERMISSION_OPTIONS: { value: PermissionLevel; label: string; description: string }[] = [
  { value: 'view', label: 'View Only', description: 'Can view trip details but cannot make changes' },
  { value: 'edit', label: 'Can Edit', description: 'Can view and edit trip details' },
  { value: 'admin', label: 'Admin', description: 'Full access including managing collaborators' },
];

export default function InviteUserModal({
  isOpen,
  onClose,
  tripId,
  tripTitle,
  onInvitationSent,
}: InviteUserModalProps) {
  const [email, setEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>('view');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailId = useId();
  const permissionId = useId();
  const messageId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const invitation = await collaborationService.sendInvitation(tripId, {
        email: email.trim().toLowerCase(),
        permissionLevel,
        message: message.trim() || undefined,
      });

      toast.success(`Invitation sent to ${email}`);
      onInvitationSent?.(invitation);
      handleClose();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      const errorMessage = error.response?.data?.message || 'Failed to send invitation';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setPermissionLevel('view');
    setMessage('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Invite Collaborator"
      icon="👥"
      maxWidth="md"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 dark:text-dusk-300 bg-gray-100 dark:bg-navy-700 rounded-lg hover:bg-gray-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="invite-form"
            disabled={isSubmitting || !email.trim()}
            className="px-4 py-2 bg-gold text-navy-900 rounded-lg hover:bg-gold/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-navy-900/30 border-t-navy-900 rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              'Send Invitation'
            )}
          </button>
        </div>
      }
    >
      <form id="invite-form" onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-dusk-400 -mt-2">
          Invite someone to collaborate on <span className="font-medium">{tripTitle}</span>
        </p>

        {/* Email */}
        <div>
          <label htmlFor={emailId} className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Email Address *
          </label>
          <input
            type="email"
            id={emailId}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            required
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 dark:border-gold/30 rounded-lg bg-white dark:bg-navy-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold focus:border-transparent"
          />
        </div>

        {/* Permission Level */}
        <div>
          <label htmlFor={permissionId} className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
            Permission Level
          </label>
          <div className="space-y-2">
            {PERMISSION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  permissionLevel === option.value
                    ? 'border-gold bg-gold/10 dark:bg-gold/5'
                    : 'border-gray-200 dark:border-gold/20 hover:border-gold/50'
                }`}
              >
                <input
                  type="radio"
                  name="permission"
                  value={option.value}
                  checked={permissionLevel === option.value}
                  onChange={(e) => setPermissionLevel(e.target.value as PermissionLevel)}
                  className="mt-0.5 text-gold focus:ring-gold"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{option.label}</div>
                  <div className="text-sm text-gray-500 dark:text-dusk-400">{option.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Personal Message */}
        <div>
          <label htmlFor={messageId} className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
            Personal Message (Optional)
          </label>
          <textarea
            id={messageId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a personal message to the invitation..."
            rows={3}
            maxLength={1000}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gold/30 rounded-lg bg-white dark:bg-navy-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
            {message.length}/1000 characters
          </p>
        </div>
      </form>
    </Modal>
  );
}
