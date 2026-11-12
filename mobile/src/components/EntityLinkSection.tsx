/**
 * "Linked items" for any entity: incoming and outgoing links grouped by the
 * other entity's type, with relationship badges, tap-to-open and unlink.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { EntityId, EntityLinkDto, EntityType, SyncEntityKind } from '@travel-life/shared';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  LINK_RELATIONSHIPS,
  LINK_RELATIONSHIP_LABELS,
} from '@travel-life/shared';
import { getEntity } from '../db/repository';
import { removeLink, updateLink } from '../domain/mutations';
import { getDb } from '../lib/db';
import { isFormKind } from '../lib/entityForms';
import { useLinks } from '../lib/hooks';
import { notifyLocalChange, useSync } from '../lib/sync';
import { spacing } from '../lib/theme';
import { showActionSheet } from './ActionSheet';
import { AppText, Button, Card, Chip, Row, SectionHeader } from './ui';

interface EntityLinkSectionProps {
  tripId: number;
  type: EntityType;
  id: EntityId;
}

interface ResolvedLink {
  link: EntityLinkDto;
  otherType: EntityType;
  otherId: EntityId;
  label: string;
}

/** Best human name for any linkable entity row. */
export function entityLabel(type: EntityType, row: Record<string, unknown> | null): string {
  if (!row) return `${ENTITY_TYPE_LABELS[type]} (unavailable offline)`;
  for (const key of ['name', 'title', 'caption', 'dish', 'description', 'url']) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return ENTITY_TYPE_LABELS[type];
}

export default function EntityLinkSection({ tripId, type, id }: EntityLinkSectionProps) {
  const version = useSync((state) => state.dataVersion);
  const { data: links = [] } = useLinks(tripId, type, id);

  const { data: resolved = [] } = useQuery({
    queryKey: ['links-resolved', tripId, type, id, links.length, version],
    queryFn: async (): Promise<ResolvedLink[]> => {
      const db = await getDb();
      const out: ResolvedLink[] = [];
      for (const link of links) {
        const selfIsSource = link.sourceType === type && String(link.sourceId) === String(id);
        const otherType = selfIsSource ? link.targetType : link.sourceType;
        const otherId = selfIsSource ? link.targetId : link.sourceId;
        // PDF imports are not mirrored; everything else linkable is a sync kind.
        const row =
          otherType === 'PDF_IMPORT'
            ? null
            : ((await getEntity(db, otherType as SyncEntityKind, otherId)) as Record<
                string,
                unknown
              > | null);
        out.push({ link, otherType, otherId, label: entityLabel(otherType, row) });
      }
      return out;
    },
  });

  const openActions = (item: ResolvedLink) => {
    showActionSheet(
      item.label,
      [
        ...(isFormKind(item.otherType)
          ? [
              {
                label: 'Open',
                onPress: () =>
                  router.push({
                    pathname: '/entity/[kind]/[id]',
                    params: {
                      kind: item.otherType,
                      id: String(item.otherId),
                      tripId: String(tripId),
                    },
                  }),
              },
            ]
          : []),
        {
          label: 'Change relationship',
          onPress: () =>
            showActionSheet(
              'Relationship',
              LINK_RELATIONSHIPS.map((relationship) => ({
                label: LINK_RELATIONSHIP_LABELS[relationship],
                onPress: async () => {
                  await updateLink(await getDb(), item.link.id, { relationship });
                  await notifyLocalChange();
                },
              }))
            ),
        },
        {
          label: 'Unlink',
          destructive: true,
          onPress: async () => {
            await removeLink(await getDb(), item.link.id);
            await notifyLocalChange();
          },
        },
      ],
      LINK_RELATIONSHIP_LABELS[item.link.relationship]
    );
  };

  const groups = ENTITY_TYPES.map((groupType) => ({
    groupType,
    items: resolved.filter((item) => item.otherType === groupType),
  })).filter((group) => group.items.length > 0);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Linked items"
        action={
          <Button
            label="+ Link"
            variant="secondary"
            compact
            onPress={() =>
              router.push({
                pathname: '/link-picker',
                params: { tripId: String(tripId), sourceType: type, sourceId: String(id) },
              })
            }
          />
        }
      />
      {groups.length === 0 ? (
        <AppText muted>Nothing linked yet.</AppText>
      ) : (
        groups.map(({ groupType, items }) => (
          <Card key={groupType}>
            <AppText variant="label" muted>
              {ENTITY_TYPE_LABELS[groupType]}
            </AppText>
            {items.map((item) => (
              <Row key={String(item.link.id)} style={styles.linkRow}>
                <Chip
                  label={item.label}
                  onPress={() => openActions(item)}
                />
                <Chip label={LINK_RELATIONSHIP_LABELS[item.link.relationship]} tone="info" />
              </Row>
            ))}
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  linkRow: { justifyContent: 'space-between' },
});
