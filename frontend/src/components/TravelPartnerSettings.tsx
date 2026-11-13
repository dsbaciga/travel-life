import { useState, useEffect, useCallback, useRef } from 'react';
import userService from '../services/user.service';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { isPartnerPermission } from '../types/user';
import type {
  TravelPartnerSettings as TravelPartnerSettingsType,
  TravelPartnerRequest,
  TravelPartnerRequests,
  PartnerPermission,
  UserSearchResult,
} from '../types/user';
import toast from 'react-hot-toast';

const EMPTY_REQUESTS: TravelPartnerRequests = { incoming: [], outgoing: [] };

const errorMessage = (err: unknown, fallback: string): string => {
  const error = err as { response?: { data?: { message?: string } } };
  return error.response?.data?.message || fallback;
};

/** Avatar or initial-circle for a user, shared by the search list and request rows. */
function UserAvatar({ user, size = 'md' }: { user: UserSearchResult; size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const textSize = size === 'sm' ? '' : 'text-lg';

  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.username} className={`${dimensions} rounded-full`} />;
  }

  return (
    <div
      className={`${dimensions} rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold ${textSize}`}
    >
      {user.username.charAt(0).toUpperCase()}
    </div>
  );
}

export default function TravelPartnerSettings() {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const [settings, setSettings] = useState<TravelPartnerSettingsType | null>(null);
  const [requests, setRequests] = useState<TravelPartnerRequests>(EMPTY_REQUESTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [permission, setPermission] = useState<PartnerPermission>('edit');
  // Opt-in to back-sharing MY existing trips. Tracked separately for the two places
  // the choice is offered: `shareOnSend` when I ask someone, `shareOnAccept` (keyed by
  // request id) when I answer someone. Both default to off — retroactive sharing is
  // never implied.
  const [shareOnSend, setShareOnSend] = useState(false);
  const [shareOnAccept, setShareOnAccept] = useState<Record<number, boolean>>({});
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // Cleanup timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadSettings = async () => {
    try {
      const [data, partnerRequests] = await Promise.all([
        userService.getTravelPartnerSettings(),
        userService.getTravelPartnerRequests(),
      ]);
      setSettings(data);
      setRequests(partnerRequests);
      setPermission(data.defaultPartnerPermission || 'edit');
    } catch (error) {
      console.error('Failed to load travel partner settings:', error);
      toast.error('Failed to load travel partner settings');
    } finally {
      setIsLoading(false);
    }
  };

  const reloadRequests = async () => {
    try {
      setRequests(await userService.getTravelPartnerRequests());
    } catch (error) {
      console.error('Failed to load travel partner requests:', error);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    // Require at least 3 characters to reduce unnecessary requests
    if (query.length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Abort any previous pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsSearching(true);
    try {
      const results = await userService.searchUsers(query, abortController.signal);
      // Only update state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to search users:', error);
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(query);
    }, 300);
  };

  /**
   * Sending a request grants nothing on its own — the partnership only exists once
   * the other user accepts.
   */
  const handleRequestPartner = async (user: UserSearchResult) => {
    setIsSaving(true);
    try {
      await userService.sendTravelPartnerRequest({
        recipientId: user.id,
        shareExistingTrips: shareOnSend,
      });
      await reloadRequests();
      setSearchQuery('');
      setSearchResults([]);
      setShowDropdown(false);
      toast.success(`Request sent to ${user.username}`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to send travel partner request'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptRequest = async (request: TravelPartnerRequest) => {
    setPendingRequestId(request.id);
    try {
      const result = await userService.acceptTravelPartnerRequest(request.id, {
        shareExistingTrips: shareOnAccept[request.id] ?? false,
      });
      setSettings({
        travelPartnerId: result.travelPartnerId,
        defaultPartnerPermission: result.defaultPartnerPermission,
        travelPartner: result.travelPartner,
      });
      setPermission(result.defaultPartnerPermission || 'edit');
      await reloadRequests();
      toast.success(`${request.requester.username} is now your travel partner!`);

      const shared = result.sharedTripCount;
      const received = result.receivedTripCount;
      if (shared > 0 || received > 0) {
        const parts: string[] = [];
        if (shared > 0) {
          parts.push(`shared ${shared} of your trips with them`);
        }
        if (received > 0) {
          parts.push(`${received} of their trips shared with you`);
        }
        toast.success(`Existing trips: ${parts.join('; ')}`);
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to accept travel partner request'));
    } finally {
      setPendingRequestId(null);
    }
  };

  const handleDeclineRequest = async (request: TravelPartnerRequest) => {
    setPendingRequestId(request.id);
    try {
      await userService.declineTravelPartnerRequest(request.id);
      await reloadRequests();
      toast.success('Request declined');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to decline travel partner request'));
    } finally {
      setPendingRequestId(null);
    }
  };

  const handleCancelRequest = async (request: TravelPartnerRequest) => {
    setPendingRequestId(request.id);
    try {
      await userService.cancelTravelPartnerRequest(request.id);
      await reloadRequests();
      toast.success('Request cancelled');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to cancel travel partner request'));
    } finally {
      setPendingRequestId(null);
    }
  };

  const handleRemovePartner = async () => {
    if (!settings?.travelPartner) return;

    const confirmed = await confirm({
      title: 'Remove Travel Partner',
      message: `Remove ${settings.travelPartner.username} as your travel partner? Your new trips will no longer be shared with them. They keep their own setting until they remove you too.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const result = await userService.updateTravelPartnerSettings({
        travelPartnerId: null,
      });
      setSettings(result);
      toast.success('Travel partner removed');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to remove travel partner'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePermission = async (newPermission: PartnerPermission) => {
    setPermission(newPermission);

    // Only update if there's an existing partner
    if (!settings?.travelPartnerId) return;

    setIsSaving(true);
    try {
      const result = await userService.updateTravelPartnerSettings({
        defaultPartnerPermission: newPermission,
      });
      setSettings(result);
      toast.success('Permission level updated');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update permission'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
        <p className="text-gray-600 dark:text-dusk-400">Loading travel partner settings...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Travel Partner
      </h2>

      <p className="text-sm text-gray-600 dark:text-dusk-400 mb-4">
        Set a default travel partner who will automatically be added as a collaborator
        to all new trips you create. Because it also shares their new trips with you,
        the other person has to accept your request before the partnership starts.
      </p>

      {/* Incoming requests — shown first, they need a response */}
      {requests.incoming.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Requests for you
          </h3>
          {requests.incoming.map((request) => (
            <div
              key={request.id}
              className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <UserAvatar user={request.requester} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {request.requester.username}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    wants to be your travel partner
                  </p>
                  {request.message && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-dusk-400 italic break-words">
                      “{request.message}”
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptRequest(request)}
                    disabled={pendingRequestId === request.id}
                    className="btn btn-primary text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(request)}
                    disabled={pendingRequestId === request.id}
                    className="text-sm text-gray-600 hover:text-gray-800 dark:text-dusk-400 dark:hover:text-dusk-200"
                  >
                    Decline
                  </button>
                </div>
              </div>

              {/* Each side controls its own history: this checkbox only gives away
                  the current user's trips. Whether the requester's trips come the
                  other way was their choice, shown read-only below. */}
              <label className="mt-3 flex items-start gap-2 text-sm text-gray-700 dark:text-dusk-300">
                <input
                  type="checkbox"
                  checked={shareOnAccept[request.id] ?? false}
                  onChange={(e) =>
                    setShareOnAccept((current) => ({
                      ...current,
                      [request.id]: e.target.checked,
                    }))
                  }
                  disabled={pendingRequestId === request.id}
                  className="mt-0.5"
                />
                <span>
                  Also share <strong>my existing trips</strong> with{' '}
                  {request.requester.username}
                </span>
              </label>

              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                {request.shareExistingTrips
                  ? `${request.requester.username} chose to share their existing trips with you.`
                  : `${request.requester.username} is not sharing their existing trips — only new ones.`}
              </p>
            </div>
          ))}
        </div>
      )}

      {settings?.travelPartner ? (
        // Partner is set - show current partner
        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
            <div className="flex items-center gap-4">
              <UserAvatar user={settings.travelPartner} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {settings.travelPartner.username}
                </p>
              </div>
              <button
                onClick={handleRemovePartner}
                disabled={isSaving}
                className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm shrink-0"
              >
                Remove
              </button>
            </div>
            <p className="mt-3 text-sm text-green-700 dark:text-green-300">
              You and {settings.travelPartner.username} are travel partners. New trips will be automatically shared.
            </p>
          </div>

          {/* Permission Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
              Default Permission Level for Shared Trips
            </label>
            <select
              value={permission}
              onChange={(e) => {
                // `e.target.value` is a plain string at runtime; ignore anything that
                // is not one of the three permissions rather than trusting a cast.
                if (isPartnerPermission(e.target.value)) {
                  handleUpdatePermission(e.target.value);
                }
              }}
              disabled={isSaving}
              className="input w-full max-w-xs"
            >
              <option value="view">View Only - Can view trip details</option>
              <option value="edit">Edit - Can add and modify trip content</option>
              <option value="admin">Admin - Full access including collaborator management</option>
            </select>
          </div>
        </div>
      ) : (
        // No partner - show search
        <div className="space-y-4">
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
              Find a Travel Partner
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              placeholder="Search by username or email..."
              className="input w-full"
            />

            {/* Search Results Dropdown */}
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-dusk-700 rounded-lg shadow-lg border border-gray-200 dark:border-dusk-600 max-h-60 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-center text-gray-500 dark:text-dusk-400">
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 dark:text-dusk-400">
                    No users found
                  </div>
                ) : (
                  searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleRequestPartner(user)}
                      disabled={isSaving}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-dusk-600 transition-colors text-left"
                    >
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {user.username}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-dusk-400">
                          Send a partner request
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Permission Level (for new partner) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-2">
              Permission Level for Auto-Shared Trips
            </label>
            <select
              value={permission}
              onChange={(e) => {
                if (isPartnerPermission(e.target.value)) {
                  setPermission(e.target.value);
                }
              }}
              className="input w-full max-w-xs"
            >
              <option value="view">View Only - Can view trip details</option>
              <option value="edit">Edit - Can add and modify trip content</option>
              <option value="admin">Admin - Full access including collaborator management</option>
            </select>
            <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
              This permission level will be applied when trips are automatically shared.
            </p>
          </div>

          {/* Opt-in for the request being sent. Only ever shares the current user's
              own trips — the other person decides separately about theirs. */}
          <div>
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-dusk-300">
              <input
                type="checkbox"
                checked={shareOnSend}
                onChange={(e) => setShareOnSend(e.target.checked)}
                disabled={isSaving}
                className="mt-0.5"
              />
              <span>
                Also share <strong>my existing trips</strong> with them if they accept
              </span>
            </label>
            <p className="mt-1 text-sm text-gray-500 dark:text-dusk-400">
              This shares your own past and current trips only. It does not give you access
              to theirs — they choose that for themselves when they accept. Trips you
              excluded from auto-sharing are skipped.
            </p>
          </div>
        </div>
      )}

      {/* Outgoing requests awaiting a response */}
      {requests.outgoing.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Requests you sent
          </h3>
          {requests.outgoing.map((request) => (
            <div
              key={request.id}
              className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-dusk-700/40 border border-gray-200 dark:border-dusk-600 rounded-lg"
            >
              <UserAvatar user={request.recipient} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {request.recipient.username}
                </p>
                <p className="text-sm text-gray-500 dark:text-dusk-400">
                  Waiting for them to accept
                  {request.shareExistingTrips
                    ? ' — your existing trips will be shared on acceptance'
                    : ' — your existing trips will not be shared'}
                </p>
              </div>
              <button
                onClick={() => handleCancelRequest(request)}
                disabled={pendingRequestId === request.id}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 shrink-0"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How Travel Partners Work
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
          <li>Send a request; the partnership only starts once the other person accepts</li>
          <li>Once accepted, both of you automatically share new trips with each other</li>
          <li>You can still exclude specific trips from auto-sharing when creating them</li>
          <li>
            Existing trips are shared only if you explicitly tick the box - and each of you
            decides that for your own trips, so ticking it never gives you access to theirs
          </li>
          <li>Either partner can remove the connection at any time</li>
        </ul>
      </div>

      <ConfirmDialogComponent />
    </div>
  );
}
