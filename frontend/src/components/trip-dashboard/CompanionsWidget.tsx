import { ChevronRightIcon, PlusIcon } from '../icons';
import type { Companion } from '../../types/companion';

interface CompanionsWidgetProps {
  companions: Companion[];
  onNavigateToCompanions: () => void;
  onInviteCompanion?: () => void;
}

/**
 * Users/group icon for the widget header
 */
function UsersIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

/**
 * User plus icon for invite action
 */
function UserPlusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
      />
    </svg>
  );
}

/**
 * Avatar color palette for companions without photos
 * Colors chosen to be visually distinct and work well in both light and dark modes
 */
const AVATAR_COLORS = [
  { bg: 'bg-blue-500', dark: 'dark:bg-blue-600' },
  { bg: 'bg-emerald-500', dark: 'dark:bg-emerald-600' },
  { bg: 'bg-purple-500', dark: 'dark:bg-purple-600' },
  { bg: 'bg-amber-500', dark: 'dark:bg-amber-600' },
  { bg: 'bg-rose-500', dark: 'dark:bg-rose-600' },
  { bg: 'bg-cyan-500', dark: 'dark:bg-cyan-600' },
  { bg: 'bg-indigo-500', dark: 'dark:bg-indigo-600' },
  { bg: 'bg-orange-500', dark: 'dark:bg-orange-600' },
];

/**
 * Generate a consistent color index from a string (companion name)
 */
function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

/**
 * Get initials from a companion's name (first letter of first and last name)
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Avatar component for a companion
 */
interface CompanionAvatarProps {
  companion: Companion;
  size?: 'sm' | 'md' | 'lg';
  showBorder?: boolean;
  className?: string;
}

function CompanionAvatar({
  companion,
  size = 'md',
  showBorder = false,
  className = '',
}: CompanionAvatarProps) {
  const initials = getInitials(companion.name);
  const colorIndex = getColorIndex(companion.name);
  const color = AVATAR_COLORS[colorIndex];

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const borderClasses = showBorder
    ? 'ring-2 ring-white dark:ring-navy-800'
    : '';

  if (companion.avatarUrl) {
    return (
      <img
        src={companion.avatarUrl}
        alt={companion.name}
        className={`${sizeClasses[size]} rounded-full object-cover ${borderClasses} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${color.bg} ${color.dark} rounded-full flex items-center justify-center
        font-medium text-white ${borderClasses} ${className}`}
      title={companion.name}
    >
      {initials}
    </div>
  );
}

/**
 * Stacked avatar display for multiple companions
 */
interface StackedAvatarsProps {
  companions: Companion[];
  maxDisplay?: number;
}

function StackedAvatars({ companions, maxDisplay = 5 }: StackedAvatarsProps) {
  const displayedCompanions = companions.slice(0, maxDisplay);
  const remainingCount = companions.length - maxDisplay;

  return (
    <div className="flex items-center -space-x-3">
      {displayedCompanions.map((companion, index) => (
        <div
          key={companion.id}
          className="relative hover:z-10 transition-transform duration-200 hover:scale-110"
          style={{ zIndex: displayedCompanions.length - index }}
        >
          <CompanionAvatar
            companion={companion}
            size="md"
            showBorder={true}
          />
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className="relative w-10 h-10 rounded-full bg-slate/20 dark:bg-navy-600
            flex items-center justify-center text-sm font-medium text-charcoal dark:text-warm-gray
            ring-2 ring-white dark:ring-navy-800"
          style={{ zIndex: 0 }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

/**
 * CompanionsWidget - Dashboard widget showing trip companions
 *
 * Features:
 * - Stacked/overlapping avatar display
 * - Shows up to 5 companions with "+X more" indicator
 * - Quick "invite companion" action button
 * - Navigate to companions tab for full management
 * - Empty state encouraging adding companions
 * - Dark mode support
 */
export default function CompanionsWidget({
  companions,
  onNavigateToCompanions,
  onInviteCompanion,
}: CompanionsWidgetProps) {
  // Empty state
  if (companions.length === 0) {
    return (
      <div className="card animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Companions
          </h3>
          <button
            onClick={onNavigateToCompanions}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Go to Companions"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Empty State */}
        <div className="text-center py-6">
          <div className="mb-3">
            <UsersIcon className="w-12 h-12 mx-auto text-primary-300 dark:text-gold/40" />
          </div>
          <p className="text-sm text-slate dark:text-warm-gray/70 mb-1">
            No companions yet
          </p>
          <p className="text-xs text-slate/70 dark:text-warm-gray/50 mb-4">
            Add friends and family to share this trip!
          </p>
          {onInviteCompanion ? (
            <button
              onClick={onInviteCompanion}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-gold hover:underline"
            >
              <UserPlusIcon className="w-4 h-4" />
              Add a companion
            </button>
          ) : (
            <button
              onClick={onNavigateToCompanions}
              className="text-sm font-medium text-primary-600 dark:text-gold hover:underline"
            >
              Manage companions
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Companions
          </h3>
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium
            bg-primary-100 text-primary-700 dark:bg-gold/20 dark:text-gold">
            {companions.length}
          </span>
        </div>
        <button
          onClick={onNavigateToCompanions}
          className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
            hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
          aria-label="Go to Companions"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Stacked Avatars */}
      <div className="flex items-center justify-between">
        <StackedAvatars companions={companions} maxDisplay={5} />

        {/* Invite Button */}
        {onInviteCompanion && (
          <button
            onClick={onInviteCompanion}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
              text-primary-600 dark:text-gold bg-primary-50 dark:bg-navy-700
              hover:bg-primary-100 dark:hover:bg-navy-600
              rounded-lg transition-colors duration-200"
            aria-label="Invite companion"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Invite</span>
          </button>
        )}
      </div>

      {/* Companion Names Preview */}
      <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
        <p className="text-sm text-slate dark:text-warm-gray/70 truncate">
          {companions.length <= 3
            ? companions.map((c) => c.name).join(', ')
            : `${companions.slice(0, 2).map((c) => c.name).join(', ')} and ${companions.length - 2} more`}
        </p>
      </div>

      {/* Footer Link */}
      <div className="mt-3">
        <button
          onClick={onNavigateToCompanions}
          className="w-full text-center text-sm font-medium text-primary-600 dark:text-gold hover:underline
            py-1.5 rounded-lg hover:bg-primary-50/50 dark:hover:bg-navy-700/30 transition-colors duration-200"
        >
          View all companions
        </button>
      </div>
    </div>
  );
}
