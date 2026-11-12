/**
 * Receipt scanner (#122): photograph a receipt, recognise the text on-device,
 * and turn it into a multi-currency expense — optionally split between
 * companions (#97) and attached to today's matching activity or stay.
 */
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  type SyncEntityMap,
  EXPENSE_CATEGORIES,
  dayKeyInTimezone,
  parseReceiptText,
  resolveTimezone,
  splitExpense,
  type ExpenseCategory,
  type ParsedReceipt,
  type SplitMode,
} from '@travel-life/shared';

import { AppText, Banner, Button, Card, Chip, EmptyState, Field, Row, Screen } from '@/components/ui';
import { createEntity, updateEntity } from '@/domain/mutations';
import { getDb } from '@/lib/db';
import { completeEntity } from '@/lib/entityForms';
import { emergencyKey, type EmergencyCard } from '@/lib/extras';
import { useActiveTrip, useEntities, useKv, useUserTimezone } from '@/lib/hooks';
import { api } from '@/lib/session';
import { notifyLocalChange, syncNow } from '@/lib/sync';

interface Draft {
  description: string;
  amount: string;
  currency: string;
  date: string;
  category: ExpenseCategory;
  confidence: number;
  source: 'on-device' | 'server';
}

const toDraft = (parsed: ParsedReceipt, today: string, source: Draft['source']): Draft => ({
  description: parsed.merchant ?? '',
  amount: parsed.amount !== null ? String(parsed.amount) : '',
  currency: parsed.currency ?? '',
  date: parsed.date ?? today,
  category: parsed.category,
  confidence: parsed.confidence,
  source,
});

export default function ReceiptScreen() {
  const userTimezone = useUserTimezone();
  const { data: trip } = useActiveTrip();
  const { data: card } = useKv<EmergencyCard>(trip ? emergencyKey(trip.id) : 'emergency:none');
  const { data: activities = [] } = useEntities(trip?.id, 'ACTIVITY');
  const { data: lodging = [] } = useEntities(trip?.id, 'LODGING');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [rawText, setRawText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode | 'none'>('none');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [splitWith, setSplitWith] = useState<Set<string>>(new Set());
  const [attachTo, setAttachTo] = useState<string | null>(null);

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
      </Screen>
    );
  }

  const tripZone = resolveTimezone(trip.timezone, userTimezone);
  const today = dayKeyInTimezone(new Date(), tripZone);
  const people = (card?.companions ?? []).map((companion) => companion.name);

  const analyse = async (text: string) => {
    // On-device parse first: instant, private, and works with no signal.
    const local = parseReceiptText(text, { defaultCurrency: trip.budgetCurrency });
    setDraft(toDraft(local, today, 'on-device'));
    try {
      // Then let the server refine it (LLM, if the user has one configured).
      const refined = await api.request<ParsedReceipt & { source: string }>(
        `/trips/${trip.id}/expenses/parse-receipt`,
        { method: 'POST', body: { text } }
      );
      if (refined && refined.confidence >= local.confidence) {
        setDraft(toDraft(refined, today, 'server'));
      }
    } catch {
      // Offline or unavailable: the on-device result stands.
    }
  };

  const scan = async (source: 'camera' | 'library') => {
    setError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera permission is needed to scan a receipt.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: true };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return;

    setBusy(true);
    try {
      // Loaded on demand: the ML Kit binding is not verified on React Native's
      // new architecture, and a failure to load must degrade to manual entry
      // (the catch below) rather than break the whole screen.
      const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
      const recognised = await TextRecognition.recognize(result.assets[0].uri);
      const text = recognised.text?.trim() ?? '';
      if (!text) {
        setError('No text could be read from that photo. Try again with the receipt flat and well lit, or enter it by hand.');
        setDraft(toDraft(parseReceiptText(''), today, 'on-device'));
        return;
      }
      setRawText(text);
      await analyse(text);
    } catch {
      setError('Text recognition is unavailable on this device. Enter the expense by hand.');
      setDraft(toDraft(parseReceiptText(''), today, 'on-device'));
    } finally {
      setBusy(false);
    }
  };

  const amount = Number((draft?.amount ?? '').replace(',', '.'));
  const splitPeople = people.filter((person) => splitWith.has(person));
  const shares =
    draft && splitMode === 'equal' && splitPeople.length > 0 && Number.isFinite(amount)
      ? splitExpense(amount, splitPeople, 'equal')
      : null;

  // Activities and stays that cover the receipt's date, as attach targets.
  const attachTargets = draft
    ? [
        ...activities
          .filter((a) => a.startTime && dayKeyInTimezone(a.startTime, resolveTimezone(a.timezone, tripZone)) === draft.date)
          .map((a) => ({ key: `ACTIVITY:${a.id}`, label: a.name })),
        ...lodging
          .filter(
            (l) =>
              dayKeyInTimezone(l.checkInDate, tripZone) <= draft.date &&
              draft.date <= dayKeyInTimezone(l.checkOutDate, tripZone)
          )
          .map((l) => ({ key: `LODGING:${l.id}`, label: l.name })),
      ]
    : [];

  const save = async () => {
    if (!draft) return;
    if (!draft.description.trim()) {
      setError('Add a description.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0 || draft.amount.trim() === '') {
      setError('Enter the amount paid.');
      return;
    }
    if (draft.currency && !/^[A-Za-z]{3}$/.test(draft.currency)) {
      setError('Currency must be a three-letter code such as EUR.');
      return;
    }
    setBusy(true);
    try {
      const db = await getDb();
      // The expense model has no split columns; the split is recorded in the
      // note so it travels with the expense to the web app.
      const splitNote = [
        paidBy ? `Paid by ${paidBy}.` : null,
        shares
          ? `Split equally: ${Object.entries(shares)
              .map(([person, share]) => `${person} ${share.toFixed(2)}`)
              .join(', ')}.`
          : null,
      ]
        .filter(Boolean)
        .join(' ');

      await createEntity(
        db,
        'EXPENSE',
        trip.id,
        completeEntity('EXPENSE', {
          description: draft.description.trim(),
          category: draft.category,
          amount,
          currency: draft.currency ? draft.currency.toUpperCase() : null,
          date: draft.date,
          notes: splitNote || null,
        }) as Omit<SyncEntityMap['EXPENSE'], 'id' | 'tripId'>
      );

      if (attachTo) {
        const [kind, id] = attachTo.split(':');
        const cost = { cost: amount, currency: draft.currency ? draft.currency.toUpperCase() : null };
        const target = /^\d+$/.test(id) ? Number(id) : (id as `local_${string}`);
        if (kind === 'ACTIVITY') await updateEntity(db, 'ACTIVITY', target, cost);
        if (kind === 'LODGING') await updateEntity(db, 'LODGING', target, cost);
      }
      await notifyLocalChange();
      void syncNow();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <Banner text={error} tone="warning" /> : null}

      {!draft ? (
        <>
          <AppText muted>
            Photograph the receipt. The text is read on this phone; only the text — never the image — is sent for refinement when you are online.
          </AppText>
          <Button label="📷 Scan receipt" onPress={() => void scan('camera')} loading={busy} />
          <Button label="Choose a photo" variant="secondary" onPress={() => void scan('library')} disabled={busy} />
          <Button
            label="Enter by hand"
            variant="ghost"
            onPress={() => setDraft(toDraft(parseReceiptText(''), today, 'on-device'))}
          />
        </>
      ) : (
        <>
          {draft.confidence > 0 && draft.confidence < 0.5 ? (
            <Banner tone="warning" text="The total was hard to read — please check the amount." />
          ) : null}
          <Field label="Merchant / description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} />
          <Field label="Amount" keyboardType="decimal-pad" value={draft.amount} onChangeText={(value) => setDraft({ ...draft, amount: value })} />
          <Field label="Currency" autoCapitalize="characters" maxLength={3} value={draft.currency} onChangeText={(currency) => setDraft({ ...draft, currency })} />
          <Field label="Date (YYYY-MM-DD)" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} />
          <AppText variant="label" muted>
            Category
          </AppText>
          <Row>
            {EXPENSE_CATEGORIES.map((category) => (
              <Chip key={category} label={category} selected={draft.category === category} onPress={() => setDraft({ ...draft, category })} />
            ))}
          </Row>

          {people.length > 1 ? (
            <Card>
              <AppText variant="heading">Split</AppText>
              <AppText variant="label" muted>
                Paid by
              </AppText>
              <Row>
                {people.map((person) => (
                  <Chip key={person} label={person} selected={paidBy === person} onPress={() => setPaidBy(paidBy === person ? null : person)} />
                ))}
              </Row>
              <Row>
                <Chip label="No split" selected={splitMode === 'none'} onPress={() => setSplitMode('none')} />
                <Chip label="Split equally" selected={splitMode === 'equal'} onPress={() => setSplitMode('equal')} />
              </Row>
              {splitMode === 'equal' ? (
                <Row>
                  {people.map((person) => (
                    <Chip
                      key={person}
                      label={shares?.[person] !== undefined ? `${person} · ${shares[person].toFixed(2)}` : person}
                      selected={splitWith.has(person)}
                      onPress={() =>
                        setSplitWith((prev) => {
                          const next = new Set(prev);
                          if (next.has(person)) next.delete(person);
                          else next.add(person);
                          return next;
                        })
                      }
                    />
                  ))}
                </Row>
              ) : null}
            </Card>
          ) : null}

          {attachTargets.length > 0 ? (
            <Card>
              <AppText variant="heading">Also set as the cost of</AppText>
              <Row>
                {attachTargets.map((target) => (
                  <Chip
                    key={target.key}
                    label={target.label}
                    selected={attachTo === target.key}
                    onPress={() => setAttachTo(attachTo === target.key ? null : target.key)}
                  />
                ))}
              </Row>
            </Card>
          ) : null}

          <Button label="Save expense" onPress={() => void save()} loading={busy} />
          {rawText ? (
            <AppText variant="caption" muted numberOfLines={6}>
              Read {draft.source === 'server' ? '(refined online)' : 'on this phone'}: {rawText}
            </AppText>
          ) : null}
        </>
      )}
    </Screen>
  );
}
