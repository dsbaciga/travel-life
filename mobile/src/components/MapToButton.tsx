/**
 * "Map to" button: starts Google Maps navigation to an item's destination.
 * Renders nothing when the item has nowhere to go (no place, address or coordinates).
 * Transport goes to where the journey ends.
 */
import type { EntityId } from '@travel-life/shared';
import { navKey } from '../domain/destination';
import { useNavTargets } from '../lib/hooks';
import { openNavigation } from '../lib/navigation';
import { Button } from './ui';

interface MapToButtonProps {
  tripId: number | undefined;
  kind: string;
  id: EntityId;
  compact?: boolean;
}

export default function MapToButton({ tripId, kind, id, compact = true }: MapToButtonProps) {
  const { data: targets } = useNavTargets(tripId);
  const target = targets?.get(navKey(kind, id));
  if (!target) return null;
  return (
    <Button
      label={`🧭 ${target.label}`}
      variant="secondary"
      compact={compact}
      accessibilityHint={`Starts navigation to ${target.title}`}
      onPress={() => void openNavigation(target)}
    />
  );
}
