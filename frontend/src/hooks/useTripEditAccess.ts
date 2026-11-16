import { useQuery } from '@tanstack/react-query';
import collaborationService from '../services/collaboration.service';

/**
 * Whether the signed-in user may change this trip (the owner, or a collaborator
 * with edit or admin access). False while the answer is loading and for
 * view-only collaborators, so write actions stay hidden until access is known.
 */
export function useTripEditAccess(tripId: number): boolean {
  const { data } = useQuery({
    queryKey: ['tripPermission', tripId],
    queryFn: () => collaborationService.getPermissionLevel(tripId),
    staleTime: 5 * 60 * 1000,
  });
  if (!data) return false;
  return data.isOwner || data.permissionLevel === 'edit' || data.permissionLevel === 'admin';
}
