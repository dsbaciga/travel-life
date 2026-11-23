export type PermissionLevel = 'view' | 'edit' | 'admin';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface UserSummary {
  id: number;
  username: string;
  email: string;
  avatarUrl?: string | null;
}

export interface TripSummary {
  id: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Uploaded cover image, used when the trip has no gallery photo as its cover */
  coverImagePath?: string | null;
  coverImageThumbnailPath?: string | null;
  coverColor?: string | null;
  coverPhoto?: {
    id: number;
    localPath: string | null;
    thumbnailPath: string | null;
  } | null;
}

export interface Collaborator {
  id: number;
  tripId: number;
  userId: number;
  permissionLevel: PermissionLevel;
  createdAt: string;
  user: UserSummary;
}

export interface TripInvitation {
  id: number;
  tripId: number;
  email: string;
  permissionLevel: PermissionLevel;
  status: InvitationStatus;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  respondedAt?: string | null;
  trip: TripSummary;
  invitedBy: UserSummary;
}

export interface CollaboratorsResponse {
  owner: UserSummary | null;
  collaborators: Collaborator[];
}

export interface SendInvitationInput {
  email: string;
  permissionLevel?: PermissionLevel;
  message?: string;
}

export interface UpdateCollaboratorInput {
  permissionLevel: PermissionLevel;
}

export interface UserPermission {
  isOwner: boolean;
  permissionLevel: PermissionLevel | null;
}

export interface SharedTrip {
  id: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverPhoto?: {
    id: number;
    localPath: string | null;
    thumbnailPath: string | null;
  } | null;
  user: UserSummary;
  tagAssignments: Array<{
    tag: {
      id: number;
      name: string;
      color: string | null;
      textColor: string | null;
    };
  }>;
  permissionLevel: PermissionLevel;
  collaboratorSince: string;
}
