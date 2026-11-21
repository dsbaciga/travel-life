/**
 * Where an activity or lodging is: its own `locationId` (a direct FK), plus any loose
 * location links (a second place it is associated with). The result is keyed
 * `"TYPE:id"` and lists the own place first, so `ids[0]` is "the" place.
 */

export interface LocationLinkRef {
  sourceType: string;
  sourceId: number;
  targetId: number;
}

interface HasOwnLocation {
  id: number;
  locationId?: number | null;
}

export type EntityLocationIdsMap = Record<string, number[]>;

export function buildEntityLocationIdsMap(
  links: readonly LocationLinkRef[],
  activities: readonly HasOwnLocation[],
  lodging: readonly HasOwnLocation[]
): EntityLocationIdsMap {
  const map: EntityLocationIdsMap = {};
  const add = (key: string, locationId: number) => {
    const ids = (map[key] ??= []);
    if (!ids.includes(locationId)) ids.push(locationId);
  };

  // Own places first, so they lead each list.
  for (const activity of activities) {
    if (activity?.locationId != null) add(`ACTIVITY:${activity.id}`, activity.locationId);
  }
  for (const stay of lodging) {
    if (stay?.locationId != null) add(`LODGING:${stay.id}`, stay.locationId);
  }
  for (const link of links) {
    add(`${link.sourceType}:${link.sourceId}`, link.targetId);
  }
  return map;
}
