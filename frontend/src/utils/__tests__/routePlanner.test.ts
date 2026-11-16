import { describe, it, expect } from 'vitest';
import {
  haversineKm,
  routeLengthKm,
  optimizeRoute,
  estimateTravel,
  formatTravelMinutes,
  computeSchedule,
  tripLengthNights,
  type GeoPoint,
} from '../routePlanner';

const p = (latitude: number, longitude: number): GeoPoint => ({ latitude, longitude });

// Cities roughly along a west-east line, so the best order is obvious.
const LISBON = p(38.72, -9.14);
const MADRID = p(40.42, -3.7);
const PARIS = p(48.86, 2.35);
const BERLIN = p(52.52, 13.4);
const WARSAW = p(52.23, 21.01);

const applyOrder = (points: GeoPoint[], order: number[]) => order.map((i) => points[i]);
const isPermutation = (order: number[], n: number) =>
  order.length === n && [...order].sort((a, b) => a - b).every((v, i) => v === i);

describe('haversineKm', () => {
  it('is 0 for identical points and symmetric', () => {
    expect(haversineKm(PARIS, PARIS)).toBe(0);
    expect(haversineKm(PARIS, BERLIN)).toBeCloseTo(haversineKm(BERLIN, PARIS), 9);
  });

  it('matches a known distance (Paris to Berlin is about 878 km)', () => {
    expect(haversineKm(PARIS, BERLIN)).toBeGreaterThan(870);
    expect(haversineKm(PARIS, BERLIN)).toBeLessThan(885);
  });

  it('takes the short way across the antimeridian', () => {
    // 2 degrees of longitude at the equator, not 358.
    const km = haversineKm(p(0, 179), p(0, -179));
    expect(km).toBeCloseTo((2 * Math.PI * 6371) / 180, 0);
    expect(km).toBeLessThan(300);
  });

  it('does not return NaN for antipodal points', () => {
    expect(Number.isFinite(haversineKm(p(0, 0), p(0, 180)))).toBe(true);
    expect(Number.isFinite(haversineKm(p(90, 0), p(-90, 0)))).toBe(true);
  });
});

describe('optimizeRoute', () => {
  it('handles 0 stops', () => {
    const r = optimizeRoute([]);
    expect(r.order).toEqual([]);
    expect(r.savedKm).toBe(0);
    expect(r.originalKm).toBe(0);
  });

  it('handles 1 stop', () => {
    const r = optimizeRoute([PARIS]);
    expect(r.order).toEqual([0]);
    expect(r.savedKm).toBe(0);
  });

  it('handles 2 stops, with or without fixed ends', () => {
    for (const opts of [{}, { fixFirst: true }, { fixLast: true }, { fixFirst: true, fixLast: true }]) {
      const r = optimizeRoute([PARIS, BERLIN], opts);
      expect(r.order).toEqual([0, 1]);
      expect(r.savedKm).toBe(0);
    }
  });

  it('straightens a zig-zag route', () => {
    const points = [LISBON, WARSAW, MADRID, BERLIN, PARIS];
    const r = optimizeRoute(points);
    expect(isPermutation(r.order, points.length)).toBe(true);
    expect(r.savedKm).toBeGreaterThan(1000);
    expect(routeLengthKm(applyOrder(points, r.order))).toBeCloseTo(r.optimizedKm, 6);
    expect(r.optimizedKm).toBeCloseTo(r.originalKm - r.savedKm, 6);
    // Best route is the west-to-east sweep (or its reverse).
    const names = r.order.map((i) => points[i]);
    const sweep = [LISBON, MADRID, PARIS, BERLIN, WARSAW];
    const forward = names.every((pt, i) => pt === sweep[i]);
    const backward = names.every((pt, i) => pt === sweep[sweep.length - 1 - i]);
    expect(forward || backward).toBe(true);
  });

  it('keeps the first stop first when fixFirst is set', () => {
    const points = [WARSAW, LISBON, BERLIN, MADRID, PARIS];
    const r = optimizeRoute(points, { fixFirst: true });
    expect(r.order[0]).toBe(0);
    expect(isPermutation(r.order, points.length)).toBe(true);
    expect(r.optimizedKm).toBeLessThanOrEqual(r.originalKm);
  });

  it('keeps the last stop last when fixLast is set', () => {
    const points = [LISBON, WARSAW, MADRID, PARIS, BERLIN];
    const r = optimizeRoute(points, { fixLast: true });
    expect(r.order[points.length - 1]).toBe(points.length - 1);
    expect(isPermutation(r.order, points.length)).toBe(true);
    expect(r.optimizedKm).toBeLessThanOrEqual(r.originalKm);
  });

  it('keeps both ends when both are fixed', () => {
    const points = [LISBON, WARSAW, BERLIN, MADRID, PARIS, p(41.9, 12.5)];
    const r = optimizeRoute(points, { fixFirst: true, fixLast: true });
    expect(r.order[0]).toBe(0);
    expect(r.order[points.length - 1]).toBe(points.length - 1);
    expect(isPermutation(r.order, points.length)).toBe(true);
    expect(r.savedKm).toBeGreaterThan(0);
  });

  it('cannot move anything with both ends fixed and a single middle stop', () => {
    const r = optimizeRoute([LISBON, WARSAW, PARIS], { fixFirst: true, fixLast: true });
    expect(r.order).toEqual([0, 1, 2]);
    expect(r.savedKm).toBe(0);
  });

  it('never returns a longer route than the input (random inputs, all fixing modes)', () => {
    // Deterministic pseudo-random generator so a failure is reproducible.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 60; trial++) {
      const n = 3 + Math.floor(rand() * 10);
      const points = Array.from({ length: n }, () => p(rand() * 160 - 80, rand() * 360 - 180));
      for (const opts of [{}, { fixFirst: true }, { fixLast: true }, { fixFirst: true, fixLast: true }]) {
        const r = optimizeRoute(points, opts);
        expect(isPermutation(r.order, n)).toBe(true);
        expect(r.optimizedKm).toBeLessThanOrEqual(r.originalKm + 1e-6);
        expect(r.savedKm).toBeGreaterThanOrEqual(0);
        if (opts.fixFirst) expect(r.order[0]).toBe(0);
        if (opts.fixLast) expect(r.order[n - 1]).toBe(n - 1);
        expect(routeLengthKm(applyOrder(points, r.order))).toBeCloseTo(r.optimizedKm, 6);
      }
    }
  });

  it('returns the input order, with no saving, when it is already best', () => {
    const points = [LISBON, MADRID, PARIS, BERLIN, WARSAW];
    const r = optimizeRoute(points, { fixFirst: true, fixLast: true });
    expect(r.order).toEqual([0, 1, 2, 3, 4]);
    expect(r.savedKm).toBe(0);
  });

  it('treats coordinates across the antimeridian as close', () => {
    const FIJI = p(-17.7, 178.0);
    const SAMOA = p(-13.8, -172.0);
    const TONGA = p(-21.1, -175.2);
    const AUCKLAND = p(-36.85, 174.76);
    const points = [AUCKLAND, SAMOA, FIJI, TONGA];
    const r = optimizeRoute(points, { fixFirst: true });
    expect(r.order[0]).toBe(0);
    // Going round the world the long way would be over 20,000 km.
    expect(r.optimizedKm).toBeLessThan(6000);
    expect(r.optimizedKm).toBeLessThanOrEqual(r.originalKm);
  });

  it('copes with duplicate coordinates', () => {
    const points = [PARIS, PARIS, BERLIN, PARIS, BERLIN];
    const r = optimizeRoute(points);
    expect(isPermutation(r.order, 5)).toBe(true);
    expect(Number.isFinite(r.optimizedKm)).toBe(true);
    expect(r.optimizedKm).toBeLessThanOrEqual(r.originalKm);
    // All Paris together then all Berlin is one Paris-Berlin hop.
    expect(r.optimizedKm).toBeCloseTo(haversineKm(PARIS, BERLIN), 3);

    const allSame = optimizeRoute([PARIS, PARIS, PARIS]);
    expect(allSame.optimizedKm).toBe(0);
    expect(allSame.savedKm).toBe(0);
  });
});

describe('estimateTravel', () => {
  it('assumes driving for short legs and a flight for long ones', () => {
    expect(estimateTravel(140).mode).toBe('drive');
    expect(estimateTravel(140).minutes).toBe(Math.round(((140 * 1.3) / 70) * 60));
    expect(estimateTravel(1500).mode).toBe('flight');
    expect(estimateTravel(1500).minutes).toBe(Math.round((1500 / 800) * 60 + 150));
  });

  it('is zero minutes for no distance', () => {
    expect(estimateTravel(0)).toEqual({ mode: 'drive', minutes: 0 });
  });
});

describe('formatTravelMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatTravelMinutes(0)).toBe('0 min');
    expect(formatTravelMinutes(45)).toBe('45 min');
    expect(formatTravelMinutes(180)).toBe('3 h');
    expect(formatTravelMinutes(200)).toBe('3 h 20 min');
  });
});

describe('computeSchedule', () => {
  it('chains arrival and departure from the trip start date', () => {
    expect(computeSchedule([3, 2, null], '2026-03-10T00:00:00.000Z')).toEqual([
      { arrival: '2026-03-10', departure: '2026-03-13' },
      { arrival: '2026-03-13', departure: '2026-03-15' },
      { arrival: '2026-03-15', departure: '2026-03-15' },
    ]);
  });

  it('is not shifted by a month or DST boundary', () => {
    expect(computeSchedule([2], '2026-03-07')[0]).toEqual({ arrival: '2026-03-07', departure: '2026-03-09' });
    expect(computeSchedule([5], '2026-10-29')[0].departure).toBe('2026-11-03');
  });

  it('returns null dates without a start date', () => {
    expect(computeSchedule([1, 2], null)).toEqual([
      { arrival: null, departure: null },
      { arrival: null, departure: null },
    ]);
  });
});

describe('tripLengthNights', () => {
  it('counts nights between calendar dates', () => {
    expect(tripLengthNights('2026-03-10T00:00:00.000Z', '2026-03-15T00:00:00.000Z')).toBe(5);
  });
  it('is null without both dates', () => {
    expect(tripLengthNights(null, '2026-03-15')).toBeNull();
    expect(tripLengthNights('2026-03-10', undefined)).toBeNull();
  });
});
