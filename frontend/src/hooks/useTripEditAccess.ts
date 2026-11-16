import { useQuery } from "@tanstack/react-query";
import collaborationService from "../services/collaboration.service";

/**
 * Whether the signed-in user may edit a trip, built on the existing
 * `GET /trips/:id/permission` endpoint (`{ isOwner, permissionLevel }`).
 * The owner and `edit`/`admin` collaborators can edit; `view` cannot.
 *
 * `canEdit` is false while loading and on error, so edit-only controls start
 * hidden and never flash on for a view-only collaborator. The server still
 * enforces access on every write; this only decides what the UI offers.
 *
 * @example
 * const { canEdit, isLoading } = useTripEditAccess(trip.id);
 */
export function useTripEditAccess(tripId: number | undefined): {
  canEdit: boolean;
  isLoading: boolean;
} {
  const enabled = typeof tripId === "number" && tripId > 0;
  const { data, isLoading } = useQuery({
    queryKey: ["trip-permission", tripId],
    queryFn: () => collaborationService.getPermissionLevel(tripId as number),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const canEdit =
    !!data &&
    (data.isOwner ||
      data.permissionLevel === "edit" ||
      data.permissionLevel === "admin");

  return { canEdit, isLoading: enabled && isLoading };
}
