import { useState, useEffect, Suspense, lazy } from "react";
import Modal from "../Modal";
import ErrorBoundary from "../ErrorBoundary";
import LoadingSpinner from "../LoadingSpinner";
import collaborationService from "../../services/collaboration.service";
import type { UserPermission } from "../../types/collaboration";

const CollaboratorsManager = lazy(() => import("../CollaboratorsManager"));

interface ShareTripModalProps {
  isOpen: boolean;
  tripId: number;
  tripTitle: string;
  onClose: () => void;
}

export default function ShareTripModal({
  isOpen,
  tripId,
  tripTitle,
  onClose,
}: ShareTripModalProps) {
  const [userPermission, setUserPermission] = useState<UserPermission | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (isOpen && tripId) {
      collaborationService
        .getPermissionLevel(tripId)
        .then((permission) => {
          if (!cancelled) setUserPermission(permission);
        })
        .catch(() => {
          if (!cancelled) setUserPermission(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen, tripId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Trip"
      icon="👥"
      maxWidth="lg"
    >
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <CollaboratorsManager
            tripId={tripId}
            tripTitle={tripTitle}
            isOwner={userPermission?.isOwner ?? false}
            userPermission={userPermission?.permissionLevel ?? null}
          />
        </Suspense>
      </ErrorBoundary>
    </Modal>
  );
}
