/**
 * Sync status: what is waiting to upload, what the server rejected, and the
 * two-way comparison for edits that collided with a collaborator's.
 */
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { useOutbox, useUserTimezone } from '@/lib/hooks';
import { notifyLocalChange, syncNow, useSync } from '@/lib/sync';
import { spacing, usePalette } from '@/lib/theme';
import { discardFailedEntry, resolveConflict } from '@/sync/engine';
import { retryEntry, type FieldConflict, type OutboxEntry } from '@/sync/outbox';
import { formatDateOnly, formatTimeInTimezone } from '@travel-life/shared';

const OP_LABEL: Readonly<Record<OutboxEntry['op'], string>> = {
  create: 'Add',
  update: 'Edit',
  delete: 'Delete',
};

const FIELD_LABEL: Readonly<Record<string, string>> = {
  startTime: 'Start time',
  endTime: 'End time',
  scheduledStart: 'Departure',
  scheduledEnd: 'Arrival',
  manualOrder: 'Position in the day',
  notes: 'Notes',
  name: 'Name',
};

const titleOf = (entry: OutboxEntry): string => {
  for (const key of ['name', 'title', 'description', 'dish', 'url']) {
    const value = entry.payload[key];
    if (typeof value === 'string' && value) return value;
  }
  return `${entry.kind.replace(/_/g, ' ').toLowerCase()}`;
};

function ConflictValue({ value, timezone }: { value: unknown; timezone: string }) {
  if (value === null || value === undefined || value === '') return <AppText muted>(empty)</AppText>;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return (
      <AppText>
        {formatDateOnly(value, { month: 'short', day: 'numeric' })} · {formatTimeInTimezone(value, timezone)}
      </AppText>
    );
  }
  return <AppText>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</AppText>;
}

export default function SyncScreen() {
  const palette = usePalette();
  const timezone = useUserTimezone();
  const { data: entries = [] } = useOutbox();
  const syncing = useSync((state) => state.syncing);
  const offline = useSync((state) => state.offline);
  const lastSyncedAt = useSync((state) => state.lastSyncedAt);
  const lastError = useSync((state) => state.lastError);

  const conflicts = entries.filter((entry) => entry.status === 'conflict');
  const failed = entries.filter((entry) => entry.status === 'failed');
  const pending = entries.filter((entry) => entry.status === 'pending');

  const act = async (work: () => Promise<void>) => {
    await work();
    await notifyLocalChange();
    void syncNow();
  };

  return (
    <Screen>
      <Row>
        {offline ? <Chip label="Offline" tone="warning" /> : <Chip label="Online" tone="success" />}
        <AppText muted>
          {lastSyncedAt ? `Last synced ${formatTimeInTimezone(lastSyncedAt, timezone)}` : 'Not synced yet'}
        </AppText>
      </Row>
      {lastError ? <Banner text={lastError} tone="danger" /> : null}
      <Button label="Sync now" onPress={() => void syncNow()} loading={syncing} />

      {entries.length === 0 ? (
        <EmptyState title="Everything is synced" message="Changes you make offline wait here until there is a connection." />
      ) : null}

      {conflicts.length > 0 ? <SectionHeader title="Needs your decision" /> : null}
      {conflicts.map((entry) => (
        <Card key={entry.seq} style={{ borderColor: palette.warning }}>
          <AppText variant="heading">{titleOf(entry)}</AppText>
          <AppText muted>Someone else changed this while you were offline.</AppText>
          {(entry.conflict ?? []).map((conflict: FieldConflict) => (
            <View key={conflict.field} style={styles.compare}>
              <AppText variant="label">{FIELD_LABEL[conflict.field] ?? conflict.field}</AppText>
              <Row style={styles.sides}>
                <View style={styles.side}>
                  <AppText variant="caption" muted>
                    Yours
                  </AppText>
                  <ConflictValue value={conflict.mine} timezone={timezone} />
                </View>
                <View style={styles.side}>
                  <AppText variant="caption" muted>
                    Theirs
                  </AppText>
                  <ConflictValue value={conflict.theirs} timezone={timezone} />
                </View>
              </Row>
            </View>
          ))}
          <Row>
            <Button
              label="Keep mine"
              compact
              onPress={() => void act(async () => resolveConflict(await getDb(), entry.seq, 'mine'))}
            />
            <Button
              label="Keep theirs"
              variant="secondary"
              compact
              onPress={() => void act(async () => resolveConflict(await getDb(), entry.seq, 'theirs'))}
            />
          </Row>
        </Card>
      ))}

      {failed.length > 0 ? <SectionHeader title="Rejected by the server" /> : null}
      {failed.map((entry) => (
        <Card key={entry.seq} style={{ borderColor: palette.danger }}>
          <AppText variant="heading">
            {OP_LABEL[entry.op]}: {titleOf(entry)}
          </AppText>
          <AppText color={palette.danger}>{entry.lastError ?? 'Unknown error'}</AppText>
          <Row>
            <Button
              label="Try again"
              compact
              onPress={() => void act(async () => retryEntry(await getDb(), entry.seq))}
            />
            <Button
              label="Discard change"
              variant="danger"
              compact
              onPress={() => void act(async () => discardFailedEntry(await getDb(), entry.seq))}
            />
          </Row>
        </Card>
      ))}

      {pending.length > 0 ? <SectionHeader title={`Waiting to upload (${pending.length})`} /> : null}
      {pending.map((entry) => (
        <Card key={entry.seq}>
          <AppText>
            {OP_LABEL[entry.op]} {entry.kind === 'LINK' ? 'link' : entry.kind.replace(/_/g, ' ').toLowerCase()}:{' '}
            {titleOf(entry)}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  compare: { gap: spacing.xs },
  sides: { alignItems: 'flex-start', flexWrap: 'nowrap' },
  side: { flex: 1, gap: 2 },
});
