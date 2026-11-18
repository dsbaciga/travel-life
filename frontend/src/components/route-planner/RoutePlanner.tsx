import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import toast from 'react-hot-toast';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import tripStopService from '../../services/tripStop.service';
import type { Location } from '../../types/location';
import { useUnits } from '../../hooks/useUnits';
import { useTripEditAccess } from '../../hooks/useTripEditAccess';
import AddStopPanel from './AddStopPanel';
import type { NewStopFromSearch } from './AddStopPanel';
import type { TripStop } from '../../types/tripStop';
import { formatDateOnly } from '../../utils/timezone';
import {
  computeSchedule,
  estimateTravel,
  FLIGHT_THRESHOLD_KM,
  formatTravelMinutes,
  haversineKm,
  optimizeRoute,
  tripLengthNights,
} from '../../utils/routePlanner';
import LoadingSpinner from '../LoadingSpinner';
import EmptyState from '../EmptyState';

const RoutePlannerMap = lazy(() => import('./RoutePlannerMap'));

interface RoutePlannerProps {
  tripId: number;
  /** Calendar dates of the trip (date-only; never timezone-converted). */
  tripStartDate: string | null;
  tripEndDate: string | null;
  /** The trip's saved places, as already loaded by the trip page (no extra request). */
  locations?: Location[];
}

/** Stops below this saving are not worth proposing. */
const MIN_WORTHWHILE_SAVING_KM = 1;

const stopsKey = (tripId: number) => ['tripStops', tripId] as const;

/** Identity of the plan: order plus coordinates, so a proposal is dropped once anything moves. */
const planSignature = (stops: TripStop[]) =>
  stops.map((s) => `${s.id}:${s.latitude},${s.longitude}`).join('|');

interface Proposal {
  basis: string;
  stopIds: number[];
  savedKm: number;
  optimizedKm: number;
}

interface UndoState {
  /** The order to go back to. */
  previousIds: number[];
  /** The plan as it was right after applying; the undo is offered only while it still holds. */
  appliedBasis: string;
  savedKm: number;
}

interface StopRowProps {
  tripId: number;
  stop: TripStop;
  /** An earlier stop is the same saved place: this one returns to it. */
  returnVisit: boolean;
  index: number;
  count: number;
  /** False for a view-only viewer: the row is read-only, with no handle, nights input or remove. */
  canEdit: boolean;
  active: boolean;
  arrival: string | null;
  departure: string | null;
  onActive: (id: number | null) => void;
  onMove: (id: number, delta: -1 | 1) => void;
  onNightsChange: (id: number, nights: number | null) => void;
  onRemove: (stop: TripStop) => void;
}

function StopRow({
  tripId,
  stop,
  returnVisit,
  index,
  count,
  canEdit,
  active,
  arrival,
  departure,
  onActive,
  onMove,
  onNightsChange,
  onRemove,
}: StopRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id });
  const [nightsText, setNightsText] = useState(stop.nights === null ? '' : String(stop.nights));

  // Follow the server value after a save, an undo or a reload.
  useEffect(() => {
    setNightsText(stop.nights === null ? '' : String(stop.nights));
  }, [stop.nights]);

  const commitNights = () => {
    const trimmed = nightsText.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && (!Number.isInteger(next) || next < 0 || next > 365)) {
      toast.error('Nights must be a whole number from 0 to 365');
      setNightsText(stop.nights === null ? '' : String(stop.nights));
      return;
    }
    if (next !== stop.nights) onNightsChange(stop.id, next);
  };

  const dates =
    arrival && departure
      ? arrival === departure
        ? formatDateOnly(arrival, { month: 'short', day: 'numeric' })
        : `${formatDateOnly(arrival, { month: 'short', day: 'numeric' })} to ${formatDateOnly(departure, { month: 'short', day: 'numeric' })}`
      : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseEnter={() => onActive(stop.id)}
      onMouseLeave={() => onActive(null)}
      onFocus={() => onActive(stop.id)}
      onBlur={() => onActive(null)}
      className={`flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border px-2 py-2 bg-white dark:bg-navy-800 ${
        active ? 'border-gold ring-1 ring-gold/40' : 'border-primary-500/10 dark:border-navy-700'
      } ${isDragging ? 'shadow-lg opacity-90 relative z-10' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${stop.name}, stop ${index + 1} of ${count}. Press space to pick up, arrow keys to move.`}
          className="flex-none min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate dark:text-dusk-400 hover:bg-primary-50 dark:hover:bg-navy-700 cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
      )}

      <span
        className="flex-none w-7 h-7 rounded-full bg-gold text-navy-900 flex items-center justify-center text-xs font-bold"
        aria-hidden="true"
      >
        {index + 1}
      </span>

      {/* Below sm the name takes its own line above the controls so it is never squeezed to nothing. */}
      <div className="min-w-0 order-first basis-full px-1 sm:order-none sm:basis-0 sm:flex-1 sm:px-0">
        <p className="font-medium text-charcoal dark:text-white truncate" title={stop.name}>
          {stop.name}
        </p>
        <p className="text-sm text-slate dark:text-dusk-400 truncate">
          {dates ?? (arrival === null ? 'Set trip dates to see arrival dates' : '')}
        </p>
        {stop.locationId !== null && (
          <p className="text-xs text-slate dark:text-dusk-400 truncate">
            <Link
              to={`/trips/${tripId}?tab=locations&highlight=${stop.locationId}`}
              className="inline-flex items-center gap-1 underline hover:text-charcoal dark:hover:text-white"
              aria-label={`Open ${stop.name} in this trip's places`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Saved place
            </Link>
            {returnVisit && <span className="ml-2 font-medium">Return visit</span>}
          </p>
        )}
      </div>

      {canEdit ? (
        <label className="flex-none flex items-center gap-1 text-sm text-slate dark:text-dusk-300">
          <span className="sr-only">Nights in {stop.name}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={nightsText}
            placeholder="0"
            onChange={(e) => setNightsText(e.target.value)}
            onBlur={commitNights}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-16 min-h-[44px] rounded-lg border border-primary-500/20 dark:border-navy-600 bg-white dark:bg-navy-900 px-2 text-center max-lg:text-base text-charcoal dark:text-white"
          />
          <span aria-hidden="true">nights</span>
        </label>
      ) : (
        <span className="flex-none text-sm text-slate dark:text-dusk-300 tabular-nums">
          {stop.nights ?? 0} {stop.nights === 1 ? 'night' : 'nights'}
        </span>
      )}

      {canEdit && (
      <>
      <div className="flex-none flex flex-col sm:flex-row">
        <button
          type="button"
          onClick={() => onMove(stop.id, -1)}
          disabled={index === 0}
          aria-label={`Move ${stop.name} earlier`}
          className="min-w-[44px] min-h-[22px] sm:min-h-[44px] flex items-center justify-center rounded text-slate dark:text-dusk-300 hover:bg-primary-50 dark:hover:bg-navy-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMove(stop.id, 1)}
          disabled={index === count - 1}
          aria-label={`Move ${stop.name} later`}
          className="min-w-[44px] min-h-[22px] sm:min-h-[44px] flex items-center justify-center rounded text-slate dark:text-dusk-300 hover:bg-primary-50 dark:hover:bg-navy-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        onClick={() => onRemove(stop)}
        aria-label={`Remove ${stop.name}`}
        className="flex-none min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
      </>
      )}
    </li>
  );
}

/**
 * Multi-City Trip Planner: the trip's route as an ordered, draggable list of stops beside
 * a map. Distances are great-circle (haversine) and the times beside them are rough
 * estimates from distance alone, all computed in the browser so a drag updates instantly
 * and makes no external request. Only the final order is sent to the server.
 */
export default function RoutePlanner({ tripId, tripStartDate, tripEndDate, locations }: RoutePlannerProps) {
  const queryClient = useQueryClient();
  const { formatDistance } = useUnits();
  // False while loading and for view-only viewers, so editing controls never flash on.
  const { canEdit } = useTripEditAccess(tripId);
  const key = stopsKey(tripId);
  const { data: stops = [], isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => tripStopService.getStopsByTrip(tripId),
  });

  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixFirst, setFixFirst] = useState(true);
  const [fixLast, setFixLast] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [noGain, setNoGain] = useState(false);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const requestCounter = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const signature = useMemo(() => planSignature(stops), [stops]);
  const activeProposal = proposal && proposal.basis === signature ? proposal : null;
  const activeUndo = undo && undo.appliedBasis === signature ? undo : null;
  useEffect(() => {
    // Anything that changes the plan makes an old "no gain" notice stale.
    setNoGain(false);
  }, [signature, fixFirst, fixLast]);

  const byId = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);

  // ---- derived plan --------------------------------------------------------
  const legs = useMemo(
    () =>
      stops.slice(1).map((stop, i) => {
        const km = haversineKm(stops[i], stop);
        return { km, ...estimateTravel(km) };
      }),
    [stops]
  );
  const totalKm = legs.reduce((sum, leg) => sum + leg.km, 0);
  const totalTravelMinutes = legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const totalNights = stops.reduce((sum, s) => sum + (s.nights ?? 0), 0);
  const schedule = useMemo(
    () => computeSchedule(stops.map((s) => s.nights), tripStartDate),
    [stops, tripStartDate]
  );
  const tripNights = tripLengthNights(tripStartDate, tripEndDate);
  const overBy = tripNights !== null && totalNights > tripNights ? totalNights - tripNights : 0;

  // ---- writes --------------------------------------------------------------
  const saveOrder = useCallback(
    async (ids: number[]): Promise<boolean> => {
      const previous = queryClient.getQueryData<TripStop[]>(key) ?? [];
      const lookup = new Map(previous.map((s) => [s.id, s]));
      const optimistic: TripStop[] = [];
      ids.forEach((id, position) => {
        const stop = lookup.get(id);
        if (stop) optimistic.push({ ...stop, position });
      });
      queryClient.setQueryData(key, optimistic);

      const request = ++requestCounter.current;
      try {
        const saved = await tripStopService.reorderStops(tripId, ids);
        // A newer reorder is already in flight; its answer wins.
        if (request === requestCounter.current) queryClient.setQueryData(key, saved);
        return true;
      } catch {
        if (request === requestCounter.current) {
          queryClient.setQueryData(key, previous);
          queryClient.invalidateQueries({ queryKey: key });
        }
        toast.error('Could not save the new order');
        return false;
      }
    },
    [queryClient, key, tripId]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((s) => s.id === active.id);
    const to = stops.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    void saveOrder(arrayMove(stops, from, to).map((s) => s.id));
  };

  const handleMove = (id: number, delta: -1 | 1) => {
    const from = stops.findIndex((s) => s.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= stops.length) return;
    void saveOrder(arrayMove(stops, from, to).map((s) => s.id));
  };

  const createStop = async (input: Parameters<typeof tripStopService.createStop>[1]) => {
    setBusy(true);
    try {
      const created = await tripStopService.createStop(tripId, input);
      queryClient.setQueryData<TripStop[]>(key, (current = []) => [...current, created]);
    } catch {
      toast.error('Could not add the stop');
    } finally {
      setBusy(false);
    }
  };

  const handleNights = async (id: number, nights: number | null) => {
    const previous = queryClient.getQueryData<TripStop[]>(key) ?? [];
    queryClient.setQueryData(
      key,
      previous.map((s) => (s.id === id ? { ...s, nights } : s))
    );
    try {
      await tripStopService.updateStop(tripId, id, { nights });
    } catch {
      queryClient.setQueryData(key, previous);
      toast.error('Could not save the number of nights');
    }
  };

  const handleRemove = async (stop: TripStop) => {
    const previous = queryClient.getQueryData<TripStop[]>(key) ?? [];
    queryClient.setQueryData(
      key,
      previous.filter((s) => s.id !== stop.id)
    );
    try {
      await tripStopService.deleteStop(tripId, stop.id);
    } catch {
      queryClient.setQueryData(key, previous);
      toast.error('Could not remove the stop');
    }
  };

  // ---- optimise ------------------------------------------------------------
  const canOptimise = stops.length >= 3;

  const handlePropose = () => {
    setUndo(null);
    const result = optimizeRoute(stops, { fixFirst, fixLast });
    if (result.savedKm < MIN_WORTHWHILE_SAVING_KM) {
      setProposal(null);
      setNoGain(true);
      return;
    }
    setNoGain(false);
    setProposal({
      basis: signature,
      stopIds: result.order.map((i) => stops[i].id),
      savedKm: result.savedKm,
      optimizedKm: result.optimizedKm,
    });
  };

  const handleApply = async () => {
    if (!activeProposal) return;
    const previousIds = stops.map((s) => s.id);
    const saved = activeProposal.savedKm;
    const ok = await saveOrder(activeProposal.stopIds);
    setProposal(null);
    if (!ok) return;
    const applied = queryClient.getQueryData<TripStop[]>(key) ?? [];
    setUndo({ previousIds, appliedBasis: planSignature(applied), savedKm: saved });
  };

  const handleUndo = async () => {
    if (!activeUndo) return;
    const ids = activeUndo.previousIds;
    setUndo(null);
    await saveOrder(ids);
  };

  const proposedNames = activeProposal
    ? activeProposal.stopIds.map((id) => byId.get(id)?.name ?? '').filter(Boolean)
    : [];

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${byId.get(Number(active.id))?.name ?? 'stop'}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${byId.get(Number(active.id))?.name ?? 'Stop'} is over position ${
            stops.findIndex((s) => s.id === over.id) + 1
          } of ${stops.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${byId.get(Number(active.id))?.name ?? 'Stop'} dropped at position ${
            stops.findIndex((s) => s.id === over.id) + 1
          } of ${stops.length}.`
        : `${byId.get(Number(active.id))?.name ?? 'Stop'} dropped where it was.`,
    onDragCancel: ({ active }) => `Moving ${byId.get(Number(active.id))?.name ?? 'stop'} cancelled.`,
  };

  if (isLoading) return <LoadingSpinner.FullPage message="Loading route planner..." />;
  if (isError) {
    return (
      <p role="alert" className="py-6 text-sm text-red-600 dark:text-red-400">
        Could not load the route plan.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-charcoal dark:text-white">Route Planner</h2>
        <p className="text-sm text-slate dark:text-dusk-400">
          Order the cities of your trip, see how far apart they are, and find a shorter route.
        </p>
      </div>

      {/* The list comes first in the DOM so it sits above the map on a phone. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          {canEdit && (
          <AddStopPanel
            locations={locations}
            stops={stops}
            onAddFromSearch={(place: NewStopFromSearch) => void createStop(place)}
            onAddLocation={(location) => {
              if (location.latitude === null || location.longitude === null) return;
              // The server takes the position from the saved place; the snapshot is stored on the stop.
              void createStop({
                locationId: location.id,
                name: location.name,
                latitude: location.latitude,
                longitude: location.longitude,
              });
            }}
            disabled={busy}
          />
          )}

          {stops.length === 0 ? (
            <EmptyState
              icon="🗺️"
              message="No stops yet"
              subMessage={
                canEdit
                  ? 'Search for the cities you plan to visit, then drag them into order.'
                  : 'No route has been planned for this trip.'
              }
            />
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{ announcements }}
              >
                <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <ol className="mt-4" aria-label="Trip stops in order">
                    {stops.map((stop, index) => {
                      const leg = index > 0 ? legs[index - 1] : null;
                      return (
                        <Fragment key={stop.id}>
                          {leg && (
                            <li
                              aria-label={`${formatDistance(leg.km)}, about ${formatTravelMinutes(leg.minutes)} ${
                                leg.mode === 'flight' ? 'by air' : 'by road'
                              } from ${stops[index - 1].name} to ${stop.name}`}
                              className="list-none flex items-center gap-2 pl-14 py-1.5 text-sm text-slate dark:text-dusk-300"
                            >
                              <svg className="w-4 h-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                              <span className="tabular-nums">{formatDistance(leg.km)}</span>
                              <span aria-hidden="true">·</span>
                              <span title="Estimated from the straight-line distance, not a routed time">
                                ~{formatTravelMinutes(leg.minutes)} {leg.mode === 'flight' ? 'flight' : 'drive'} (est.)
                              </span>
                            </li>
                          )}
                          <StopRow
                            tripId={tripId}
                            stop={stop}
                            returnVisit={
                              stop.locationId !== null &&
                              stops.slice(0, index).some((earlier) => earlier.locationId === stop.locationId)
                            }
                            index={index}
                            count={stops.length}
                            canEdit={canEdit}
                            active={stop.id === activeId}
                            arrival={schedule[index]?.arrival ?? null}
                            departure={schedule[index]?.departure ?? null}
                            onActive={setActiveId}
                            onMove={handleMove}
                            onNightsChange={handleNights}
                            onRemove={handleRemove}
                          />
                        </Fragment>
                      );
                    })}
                  </ol>
                </SortableContext>
              </DndContext>

              {/* Totals */}
              <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-primary-500/10 dark:border-navy-700 p-3 text-center">
                <div>
                  <dt className="text-xs text-slate dark:text-dusk-400">Distance</dt>
                  <dd className="font-semibold text-charcoal dark:text-white tabular-nums">{formatDistance(totalKm)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate dark:text-dusk-400">Travel (est.)</dt>
                  <dd className="font-semibold text-charcoal dark:text-white tabular-nums">
                    ~{formatTravelMinutes(totalTravelMinutes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate dark:text-dusk-400">Nights</dt>
                  <dd className="font-semibold text-charcoal dark:text-white tabular-nums">
                    {totalNights}
                    {tripNights !== null && ` of ${tripNights}`}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-slate dark:text-dusk-400">
                Distances are straight-line. Times are rough estimates from distance (driving under {formatDistance(FLIGHT_THRESHOLD_KM)}, otherwise
                a flight with airport time), not routed times.
              </p>

              {overBy > 0 && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
                >
                  The stops add up to {totalNights} nights but the trip is only {tripNights}. That is {overBy} more
                  than the trip allows.
                </p>
              )}

              {/* Optimise */}
              {canEdit && (
              <section className="mt-5" aria-labelledby="route-planner-optimise">
                <h3 id="route-planner-optimise" className="text-sm font-semibold text-charcoal dark:text-warm-gray">
                  Optimise route
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-charcoal dark:text-warm-gray">
                    <input type="checkbox" checked={fixFirst} onChange={(e) => setFixFirst(e.target.checked)} />
                    Keep first stop
                  </label>
                  <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-charcoal dark:text-warm-gray">
                    <input type="checkbox" checked={fixLast} onChange={(e) => setFixLast(e.target.checked)} />
                    Keep last stop
                  </label>
                  <button
                    type="button"
                    onClick={handlePropose}
                    disabled={!canOptimise}
                    title={canOptimise ? undefined : 'Add at least three stops to optimise the order'}
                    className="min-h-[44px] px-4 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Optimise route
                  </button>
                </div>

                {noGain && (
                  <p role="status" className="mt-2 text-sm text-slate dark:text-dusk-300">
                    This order is already about as short as it gets with these settings.
                  </p>
                )}

                {activeProposal && (
                  <div
                    role="region"
                    aria-label="Proposed route"
                    className="mt-3 rounded-xl border border-gold/50 bg-gold/10 p-3"
                  >
                    <p className="font-medium text-charcoal dark:text-white">
                      {formatDistance(activeProposal.savedKm)} shorter ({formatDistance(activeProposal.optimizedKm)} instead of{' '}
                      {formatDistance(totalKm)})
                    </p>
                    <ol className="mt-2 list-decimal pl-5 text-sm text-charcoal dark:text-warm-gray">
                      {proposedNames.map((name, i) => (
                        <li key={`${name}-${i}`}>{name}</li>
                      ))}
                    </ol>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApply()}
                        className="min-h-[44px] px-4 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
                      >
                        Apply this order
                      </button>
                      <button
                        type="button"
                        onClick={() => setProposal(null)}
                        className="min-h-[44px] px-4 rounded-lg border border-primary-500/30 dark:border-navy-600 text-charcoal dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-700"
                      >
                        Keep my order
                      </button>
                    </div>
                  </div>
                )}

                {activeUndo && (
                  <p role="status" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-charcoal dark:text-warm-gray">
                    <span>Route optimised: {formatDistance(activeUndo.savedKm)} shorter.</span>
                    <button
                      type="button"
                      onClick={() => void handleUndo()}
                      className="min-h-[44px] px-3 rounded-lg border border-primary-500/30 dark:border-navy-600 font-medium hover:bg-primary-50 dark:hover:bg-navy-700"
                    >
                      Undo
                    </button>
                  </p>
                )}
              </section>
              )}
            </>
          )}
        </div>

        <div className="mt-6 lg:mt-0 h-[320px] sm:h-[420px] lg:h-[calc(100vh-18rem)] lg:min-h-[420px] lg:sticky lg:top-48">
          <Suspense fallback={<LoadingSpinner.FullPage message="Loading map..." />}>
            <RoutePlannerMap stops={stops} activeId={activeId} onSelect={setActiveId} className="h-full" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
