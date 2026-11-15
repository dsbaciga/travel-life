/**
 * Food nearby: restaurants, cafés and bakeries around the phone, filtered for a
 * dietary restriction. Needs a connection; the search runs on the server against
 * OpenStreetMap.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  DIETARY_LABELS,
  DIETARY_RESTRICTIONS,
  buildMapsAppLinks,
  dietBadge,
  formatDistance,
  getDeviceTimezone,
  openingHoursService,
  type DietBadgeTone,
  type DietaryRestriction,
  type NearbyFoodPlace,
  type NearbyFoodResponse,
  type SyncEntityMap,
} from '@travel-life/shared';

import { showActionSheet, type SheetAction } from '@/components/ActionSheet';
import { AppText, Banner, Button, Card, Chip, EmptyState, Field, Row, Screen, SectionHeader } from '@/components/ui';
import { kvGet, kvSet } from '@/db/repository';
import { createEntity } from '@/domain/mutations';
import {
  DEFAULT_FOOD_RADIUS,
  FOOD_RADII,
  describePlace,
  dietHighlights,
  foodSearchErrorMessage,
  groupPlaces,
  mealParamsFor,
  parseStoredDiet,
  parseStoredRadius,
  telUrl,
  websiteUrl,
  type FoodRadius,
} from '@/domain/food';
import { getDb } from '@/lib/db';
import { completeEntity } from '@/lib/entityForms';
import { useActiveTrip, useEntities } from '@/lib/hooks';
import { api } from '@/lib/session';
import { notifyLocalChange, syncNow } from '@/lib/sync';
import { spacing } from '@/lib/theme';
import { getCurrentPosition, positionFailureMessage } from '@/tasks/location';
import { isUsableCoordinate } from '@travel-life/shared';

const TONE: Record<DietBadgeTone, 'success' | 'warning' | 'default' | 'danger'> = {
  good: 'success',
  ok: 'warning',
  unknown: 'default',
  bad: 'danger',
};

type Position = { latitude: number; longitude: number };

/** Somewhere other than the phone to search around. */
interface SearchPlace extends Position {
  name: string;
}

interface PlaceHit extends SearchPlace {
  description: string;
}

export default function FoodScreen() {
  const { data: trip } = useActiveTrip();
  const [diet, setDiet] = useState<DietaryRestriction | null>(null);
  const [radius, setRadius] = useState<FoodRadius>(DEFAULT_FOOD_RADIUS);
  const [restored, setRestored] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  // Where to search: the phone's position unless the traveller picks somewhere else. Not remembered:
  // the next visit starts from where they are.
  const [custom, setCustom] = useState<SearchPlace | null>(null);
  const [picking, setPicking] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeHits, setPlaceHits] = useState<PlaceHit[] | null>(null);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const { data: tripPlaces = [] } = useEntities(trip?.id, 'LOCATION');
  // Opening hours are the place's own clock, and the phone is at the place, so its zone is the best guess.
  const [deviceZone] = useState(() => getDeviceTimezone());

  // The last diet and distance used, so the next search starts where this one ended.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const [storedDiet, storedRadius] = await Promise.all([
        kvGet<string>(db, 'foodDiet'),
        kvGet<number>(db, 'foodRadius'),
      ]);
      if (cancelled) return;
      setDiet(parseStoredDiet(storedDiet));
      setRadius(parseStoredRadius(storedRadius));
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyPosition = (here: Position | null) => {
    setPosition(here);
    setLocationError(here ? null : positionFailureMessage('find food near you'));
    setLocating(false);
  };

  useEffect(() => {
    let cancelled = false;
    void getCurrentPosition().then((here) => {
      if (!cancelled) applyPosition(here);
    });
    return () => {
      cancelled = true;
    };
    // Once, on opening the screen; later searches go through searchAgain.
  }, []);

  const searchAgain = async () => {
    setNotice(null);
    setCustom(null);
    setPicking(false);
    setLocating(true);
    applyPosition(await getCurrentPosition());
  };

  const choosePlace = (place: SearchPlace) => {
    setCustom(place);
    setPicking(false);
    setNotice(null);
    setPlaceHits(null);
    setPlaceQuery('');
  };

  const findPlace = async () => {
    const q = placeQuery.trim();
    if (q.length < 2) return;
    setPlaceSearching(true);
    setPlaceError(null);
    try {
      const response = await api.request<{ results: PlaceHit[] }>('/places/search', {
        timeoutMs: 20_000,
        query: { q, limit: '5' },
      });
      setPlaceHits(response.results);
    } catch (error) {
      setPlaceHits(null);
      setPlaceError(foodSearchErrorMessage(error));
    } finally {
      setPlaceSearching(false);
    }
  };

  // Places already on the trip that have somewhere to go to, as quick picks.
  const quickPlaces = tripPlaces
    .filter((place) => isUsableCoordinate(place))
    .slice(0, 8)
    .map((place) => ({ name: place.name, latitude: place.latitude as number, longitude: place.longitude as number }));

  // Rounded to about 110 m, the same cell the server caches on, so GPS jitter does not re-search.
  const origin: Position | null = custom ?? position;
  const cell = origin ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}` : null;
  const search = useQuery({
    queryKey: ['food-nearby', cell, radius, diet ?? 'any'],
    enabled: restored && origin !== null,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<NearbyFoodResponse> => {
      const here = origin as Position;
      return api.request<NearbyFoodResponse>('/places/food', {
        // The map server can take a while when it is busy, and the backend may try a second one.
        timeoutMs: 60_000,
        query: {
          lat: String(here.latitude),
          lng: String(here.longitude),
          radius: String(radius),
          ...(diet ? { diet } : {}),
        },
      });
    },
  });

  const chooseDiet = (next: DietaryRestriction | null) => {
    setDiet(next);
    void getDb().then((db) => kvSet(db, 'foodDiet', next));
  };
  const chooseRadius = (next: FoodRadius) => {
    setRadius(next);
    void getDb().then((db) => kvSet(db, 'foodRadius', next));
  };

  const openDirections = (place: NearbyFoodPlace) => {
    const links = buildMapsAppLinks({
      destination: {
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      },
      mode: 'walking',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (links.length === 0) return;
    showActionSheet(
      'Directions',
      links.map((link) => ({ label: link.label, onPress: () => void Linking.openURL(link.url) })),
      place.name
    );
  };

  const saveToTrip = async (place: NearbyFoodPlace) => {
    if (!trip) return;
    const db = await getDb();
    await createEntity(
      db,
      'LOCATION',
      trip.id,
      completeEntity('LOCATION', {
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        notes: describePlace(place),
      }) as Omit<SyncEntityMap['LOCATION'], 'id' | 'tripId'>
    );
    setSaved((prev) => new Set(prev).add(place.id));
    setNotice(`Saved ${place.name} to ${trip.title}.`);
    await notifyLocalChange();
    void syncNow();
  };

  const showMore = (place: NearbyFoodPlace) => {
    const actions: SheetAction[] = [];
    if (trip) {
      actions.push({
        label: 'Log a meal here',
        onPress: () =>
          router.push({ pathname: '/entity/[kind]/[id]', params: mealParamsFor(place, trip.id) }),
      });
      if (!saved.has(place.id)) {
        actions.push({ label: `Save to ${trip.title}`, onPress: () => void saveToTrip(place) });
      }
    }
    const tel = telUrl(place.phone);
    if (tel) actions.push({ label: `Call ${place.phone}`, onPress: () => void Linking.openURL(tel) });
    const site = websiteUrl(place.website);
    if (site) actions.push({ label: 'Open website', onPress: () => void Linking.openURL(site) });
    showActionSheet(place.name, actions, describePlace(place));
  };

  const data = search.data;
  const groups = data ? groupPlaces(data.places, data.diet) : [];
  const searching = (locating && !custom) || (restored && origin !== null && search.isFetching);
  const now = new Date();

  return (
    <Screen>
      <AppText muted>
        Restaurants, cafés and bakeries near you or anywhere you choose, from OpenStreetMap. Dietary details are only as good as the map:
        places nobody has tagged show as not confirmed. Check with the restaurant, especially for allergies.
      </AppText>

      <SectionHeader title="Where" />
      <Row>
        <Chip label="📍 My location" selected={custom === null} onPress={() => void searchAgain()} />
        {custom ? <Chip label={custom.name} selected /> : null}
        <Chip label="🔎 Another place" selected={picking} onPress={() => setPicking((open) => !open)} />
      </Row>
      {picking ? (
        <Card>
          <Field
            label="City, address or place"
            value={placeQuery}
            onChangeText={setPlaceQuery}
            placeholder="e.g. Akureyri, or 10 Rue de Rivoli, Paris"
            returnKeyType="search"
            autoCapitalize="words"
            onSubmitEditing={() => void findPlace()}
          />
          <Button
            label="Search"
            variant="secondary"
            loading={placeSearching}
            disabled={placeQuery.trim().length < 2}
            onPress={() => void findPlace()}
          />
          {placeError ? <Banner tone="danger" text={placeError} /> : null}
          {placeHits && placeHits.length === 0 ? <AppText muted>No place found. Try a city or a fuller address.</AppText> : null}
          {placeHits?.map((hit) => (
            <Card
              key={`${hit.latitude},${hit.longitude}`}
              onPress={() => choosePlace({ name: hit.name, latitude: hit.latitude, longitude: hit.longitude })}
              accessibilityLabel={`Search around ${hit.description}`}>
              <AppText variant="heading" numberOfLines={1}>{hit.name}</AppText>
              <AppText variant="caption" muted numberOfLines={2}>{hit.description}</AppText>
            </Card>
          ))}
          {quickPlaces.length > 0 ? (
            <>
              <AppText variant="label" muted>On this trip</AppText>
              <Row>
                {quickPlaces.map((place) => (
                  <Chip key={`${place.name}:${place.latitude}`} label={place.name} onPress={() => choosePlace(place)} />
                ))}
              </Row>
            </>
          ) : null}
        </Card>
      ) : null}

      <SectionHeader title="Dietary needs" />
      <Row>
        <Chip label="Any" selected={diet === null} onPress={() => chooseDiet(null)} />
        {DIETARY_RESTRICTIONS.map((option) => (
          <Chip
            key={option}
            label={DIETARY_LABELS[option]}
            selected={diet === option}
            onPress={() => chooseDiet(option)}
          />
        ))}
      </Row>

      <SectionHeader title="How far" />
      <Row>
        {FOOD_RADII.map((option) => (
          <Chip key={option} label={formatDistance(option)} selected={radius === option} onPress={() => chooseRadius(option)} />
        ))}
      </Row>

      {notice ? <Banner tone="info" text={notice} /> : null}
      {locationError && !locating && !custom ? (
        <>
          <Banner tone="warning" text={locationError} />
          <Button label="Try again" variant="secondary" onPress={() => void searchAgain()} />
        </>
      ) : null}
      {search.isError && !searching ? (
        <>
          <Banner tone="danger" text={foodSearchErrorMessage(search.error)} />
          <Button label="Try again" variant="secondary" onPress={() => void search.refetch()} />
        </>
      ) : null}

      {locating && !custom ? <AppText muted>Finding where you are…</AppText> : null}
      {!(locating && !custom) && searching && !data ? <AppText muted>Searching nearby…</AppText> : null}

      {data ? (
        <>
          <AppText variant="heading">
            {data.places.length} {data.places.length === 1 ? 'place' : 'places'} within {formatDistance(data.radiusMeters)}
            {custom ? ` of ${custom.name}` : ''}
            {searching ? ' · updating…' : ''}
          </AppText>
          {data.excludedCount > 0 && data.diet ? (
            <AppText variant="caption" muted>
              {data.excludedCount} hidden: the map says {data.excludedCount === 1 ? 'it does' : 'they do'} not
              cater for {DIETARY_LABELS[data.diet].toLowerCase()}.
            </AppText>
          ) : null}

          {data.places.length === 0 && !searching ? (
            <EmptyState
              title="Nothing found"
              message="Try a wider distance, or Any, since many places have no diet information on the map."
            />
          ) : null}

          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              {group.title ? <AppText variant="label" muted>{group.title}</AppText> : null}
              {group.places.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  diet={data.diet}
                  now={now}
                  zone={deviceZone}
                  saved={saved.has(place.id)}
                  onDirections={() => openDirections(place)}
                  onMore={() => showMore(place)}
                />
              ))}
            </View>
          ))}
        </>
      ) : null}

      <Button
        label={custom ? 'Back to my location' : 'Search again from here'}
        variant="secondary"
        loading={locating && !custom}
        onPress={() => void searchAgain()}
      />
    </Screen>
  );
}

interface PlaceCardProps {
  place: NearbyFoodPlace;
  diet: DietaryRestriction | null;
  now: Date;
  zone: string;
  saved: boolean;
  onDirections: () => void;
  onMore: () => void;
}

function PlaceCard({ place, diet, now, zone, saved, onDirections, onMore }: PlaceCardProps) {
  const status = place.openingHours ? openingHoursService.evaluate(place.openingHours, now, zone).status : null;
  const badge = diet && place.diet ? dietBadge(place.diet, diet) : null;
  const highlights = dietHighlights(place, diet);

  return (
    <Card onPress={onMore} accessibilityLabel={`${place.name}. ${describePlace(place)}. More options.`}>
      <AppText variant="heading" numberOfLines={2}>
        {place.name}
      </AppText>
      <AppText muted>{describePlace(place)}</AppText>
      <Row>
        {badge ? <Chip label={badge.label} tone={TONE[badge.tone]} /> : null}
        {highlights.map((highlight) => (
          <Chip key={highlight.diet} label={highlight.label} tone="success" />
        ))}
        {status === 'OPEN' ? <Chip label="Open now" tone="success" /> : null}
        {status === 'CLOSED' ? <Chip label="Closed now" tone="danger" /> : null}
        {saved ? <Chip label="Saved" tone="info" /> : null}
      </Row>
      {place.address ? <AppText variant="caption" muted>{place.address}</AppText> : null}
      <Row>
        <Button label="Directions" variant="secondary" compact onPress={onDirections} />
        <Button label="More" variant="ghost" compact onPress={onMore} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
