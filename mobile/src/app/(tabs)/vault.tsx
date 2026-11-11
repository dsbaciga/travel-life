/**
 * Travel vault & emergency: offline documents (#110), emergency card (#111),
 * local norms (#113) and the phrasebook. Optionally locked behind biometrics.
 */
import { useQuery } from '@tanstack/react-query';
import * as Brightness from 'expo-brightness';
import * as ExpoCrypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { formatDateOnly, getCountryFacts, resolveCountryFromAddress } from '@travel-life/shared';

import { showActionSheet } from '@/components/ActionSheet';
import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen, SectionHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { emergencyKey, phrasesKey, type EmergencyCard, type Phrase } from '@/lib/extras';
import { useActiveTrip, useKv } from '@/lib/hooks';
import { notifyLocalChange, useSync } from '@/lib/sync';
import { TOUCH_TARGET, usePalette } from '@/lib/theme';
import {
  VAULT_DOC_LABELS,
  VAULT_DOC_TYPES,
  addVaultDocument,
  listVaultDocuments,
  removeVaultDocument,
  type VaultDocType,
  type VaultDocument,
} from '@/lib/vault';

type Section = 'documents' | 'emergency' | 'norms' | 'phrases';

/** One-tap dial. Strips formatting so the dialer receives digits and a leading +. */
function PhoneLink({ label, number }: { label: string; number: string }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Call ${label}, ${number}`}
      style={styles.phone}
      onPress={() => void Linking.openURL(`tel:${number.replace(/[^\d+]/g, '')}`)}>
      <AppText>{label}</AppText>
      <AppText variant="heading" color={palette.primary}>
        {number}
      </AppText>
    </Pressable>
  );
}

export default function VaultScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const { data: trip } = useActiveTrip();
  const version = useSync((state) => state.dataVersion);
  const [section, setSection] = useState<Section>(params.section === 'phrases' ? 'phrases' : 'documents');
  const [unlocked, setUnlocked] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const { data: lockEnabled } = useKv<boolean>('vaultLock');
  const { data: card } = useKv<EmergencyCard>(trip ? emergencyKey(trip.id) : 'emergency:none');
  const { data: phrases } = useKv<Phrase[]>(trip ? phrasesKey(trip.id) : 'phrases:none');
  const { data: documents = [] } = useQuery({
    queryKey: ['vault', trip?.id, version],
    queryFn: async () => listVaultDocuments(await getDb(), trip?.id ?? null),
  });

  // Re-lock whenever the tab loses focus, so a phone handed to someone to
  // show a boarding pass does not stay open on passport details afterwards.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setUnlocked(false);
        void Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
      };
    }, [])
  );

  const unlock = async () => {
    setLockError(null);
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock travel vault' });
    if (result.success) setUnlocked(true);
    else setLockError('Could not verify it is you. Try again.');
  };

  const addDocument = async (docType: VaultDocType) => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/vnd.apple.pkpass'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0];
    await addVaultDocument(await getDb(), {
      id: ExpoCrypto.randomUUID(),
      tripId: trip?.id ?? null,
      title: asset.name.replace(/\.[^.]+$/, ''),
      docType,
      sourceUri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? null,
      neededAt: null,
    });
    await notifyLocalChange();
  };

  const openDocument = (document: VaultDocument) => {
    showActionSheet(document.title, [
      {
        label: 'Open',
        onPress: async () => {
          // Scanners at the gate read a dim screen poorly.
          if (document.docType === 'boarding_pass' || document.docType === 'ticket') {
            await Brightness.setBrightnessAsync(1).catch(() => undefined);
          }
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(document.localUri, { mimeType: document.mimeType ?? undefined });
          }
        },
      },
      {
        label: 'Remove from this phone',
        destructive: true,
        onPress: async () => {
          await removeVaultDocument(await getDb(), document);
          await notifyLocalChange();
        },
      },
    ]);
  };

  if (lockEnabled && !unlocked) {
    return (
      <Screen>
        <EmptyState title="Vault locked" message="Documents, passport details and medical notes are behind your device lock." />
        {lockError ? <Banner text={lockError} tone="danger" /> : null}
        <Button label="Unlock" onPress={() => void unlock()} />
      </Screen>
    );
  }

  // Country: the trip's explicit override, else inferred from its addresses.
  const countryCode =
    trip?.countryCode ??
    card?.countryCode ??
    (card?.locationAddresses ?? [])
      .map((address) => resolveCountryFromAddress(address))
      .find((code): code is string => Boolean(code)) ??
    null;
  const facts = getCountryFacts(countryCode);

  return (
    <Screen>
      <Row style={styles.between}>
        <AppText variant="title">Vault</AppText>
        <Button label="Settings" variant="ghost" compact onPress={() => router.push('/settings')} />
      </Row>
      <Row>
        <Chip label="Documents" selected={section === 'documents'} onPress={() => setSection('documents')} />
        <Chip label="Emergency" selected={section === 'emergency'} onPress={() => setSection('emergency')} />
        <Chip label="Local norms" selected={section === 'norms'} onPress={() => setSection('norms')} />
        <Chip label="Phrases" selected={section === 'phrases'} onPress={() => setSection('phrases')} />
      </Row>

      {section === 'documents' ? (
        <>
          <SectionHeader
            title="Travel documents"
            action={
              <Button
                label="+ Add"
                variant="secondary"
                compact
                onPress={() =>
                  showActionSheet(
                    'What is this document?',
                    VAULT_DOC_TYPES.map((docType) => ({
                      label: VAULT_DOC_LABELS[docType],
                      onPress: () => addDocument(docType),
                    }))
                  )
                }
              />
            }
          />
          <AppText variant="caption" muted>
            Files are stored only on this phone and open without a connection.
          </AppText>
          {documents.length === 0 ? (
            <EmptyState title="No documents yet" message="Add boarding passes, confirmations and visa PDFs before you travel." />
          ) : (
            documents.map((document) => (
              <Card key={document.id} onPress={() => openDocument(document)} accessibilityLabel={document.title}>
                <AppText variant="label" muted>
                  {VAULT_DOC_LABELS[document.docType]}
                  {document.neededAt ? ` · ${formatDateOnly(document.neededAt)}` : ''}
                </AppText>
                <AppText variant="heading" numberOfLines={1}>
                  {document.title}
                </AppText>
              </Card>
            ))
          )}
        </>
      ) : null}

      {section === 'emergency' ? (
        <>
          {facts ? (
            <Card>
              <AppText variant="heading">Emergency numbers · {facts.name}</AppText>
              {facts.emergency.universal ? <PhoneLink label="All services" number={facts.emergency.universal} /> : null}
              {facts.emergency.police ? <PhoneLink label="Police" number={facts.emergency.police} /> : null}
              {facts.emergency.ambulance ? <PhoneLink label="Ambulance" number={facts.emergency.ambulance} /> : null}
              {facts.emergency.fire ? <PhoneLink label="Fire" number={facts.emergency.fire} /> : null}
            </Card>
          ) : (
            <Banner tone="warning" text="No destination country is set for this trip, so local emergency numbers are unknown. Set it on the trip in the web app." />
          )}

          {card?.info ? (
            <Card>
              <AppText variant="heading">Insurance & embassy</AppText>
              {card.info.insuranceProvider ? <AppText>{card.info.insuranceProvider}</AppText> : null}
              {card.info.insurancePolicyNumber ? (
                <AppText selectable>Policy {card.info.insurancePolicyNumber}</AppText>
              ) : null}
              {card.info.insuranceAssistancePhone ? (
                <PhoneLink label="24/7 assistance" number={card.info.insuranceAssistancePhone} />
              ) : null}
              {card.info.embassyPhone ? (
                <PhoneLink label={card.info.embassyName ?? 'Embassy'} number={card.info.embassyPhone} />
              ) : null}
              {card.info.embassyAddress ? <AppText selectable>{card.info.embassyAddress}</AppText> : null}
              {card.info.notes ? <AppText muted>{card.info.notes}</AppText> : null}
            </Card>
          ) : (
            <AppText muted>Add insurance and embassy details to the trip in the web app to see them here offline.</AppText>
          )}

          {(card?.companions ?? []).map((companion) => (
            <Card key={companion.id}>
              <AppText variant="heading">{companion.name}</AppText>
              {companion.phone ? <PhoneLink label="Phone" number={companion.phone} /> : null}
              {companion.allergies.length > 0 ? <AppText>Allergies: {companion.allergies.join(', ')}</AppText> : null}
              {companion.medicalNotes ? <AppText>{companion.medicalNotes}</AppText> : null}
            </Card>
          ))}
          {card && !card.includesMedicalDetails && card.companions.length > 0 ? (
            // The server withholds medical fields from non-owners; say so rather
            // than imply nobody has any allergies.
            <Banner text="Medical details are only visible to the trip owner. Ask them if you need these." />
          ) : null}
        </>
      ) : null}

      {section === 'norms' ? (
        facts ? (
          <Card>
            <AppText variant="heading">{facts.name}</AppText>
            <AppText>
              🔌 Plugs {facts.electricity.plugTypes.join(', ')} · {facts.electricity.voltage} V ·{' '}
              {facts.electricity.frequency} Hz
            </AppText>
            <AppText>
              🚰 Tap water:{' '}
              {facts.tapWater === 'safe' ? 'safe to drink' : facts.tapWater === 'caution' ? 'use caution' : 'not safe to drink'}
            </AppText>
            <AppText>🚗 Drives on the {facts.drivingSide}</AppText>
            <AppText>💶 {facts.tipping}</AppText>
          </Card>
        ) : (
          <EmptyState title="Country unknown" message="Set the trip's destination country in the web app to see plugs, tipping and tap-water guidance." />
        )
      ) : null}

      {section === 'phrases' ? (
        (phrases ?? []).length === 0 ? (
          <EmptyState title="No phrasebook cached" message="Add a language to the trip in the web app, then sync while online." />
        ) : (
          (phrases ?? []).map((phrase, index) => (
            <Card key={`${phrase.english}-${index}`}>
              <AppText variant="label" muted>
                {[phrase.languageName, phrase.category].filter(Boolean).join(' · ')}
              </AppText>
              <AppText>{phrase.english}</AppText>
              <AppText variant="heading" selectable>
                {phrase.translation}
              </AppText>
              {phrase.pronunciation ? <AppText muted>{phrase.pronunciation}</AppText> : null}
            </Card>
          ))
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  phone: { minHeight: TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
