// GENERATED FILE - DO NOT EDIT.
// Vendored from packages/shared/src/brand/contours.ts by packages/shared/scripts/sync-vendored.mjs.
// Edit the source and re-run the script.

/**
 * Deterministic topographic contour lines for decorative backdrops.
 *
 * Pure and dependency-free so web and mobile draw the same terrain for the same
 * seed. Also vendored into the frontend (its Docker build context cannot reach
 * packages/shared): edit here and run `npm run sync:vendored`.
 */

export interface ContourOptions {
  /** Anything stable per trip: an id, a name, or a destination. Same seed, same terrain. */
  seed: string | number;
  /** Drawing area in the caller's units (SVG viewBox). */
  width: number;
  height: number;
  /** Total closed paths to return. Default 8. */
  count?: number;
}

/** Build a stable seed string from a trip id and/or destination coordinates. */
export function contourSeed(parts: {
  id?: string | number | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const out: string[] = [];
  if (parts.id !== null && parts.id !== undefined) out.push(`id${parts.id}`);
  if (typeof parts.latitude === 'number' && typeof parts.longitude === 'number') {
    // One decimal is about 11 km: nearby destinations share terrain.
    out.push(`ll${parts.latitude.toFixed(1)},${parts.longitude.toFixed(1)}`);
  }
  return out.length ? out.join('|') : 'travel-life';
}

/** FNV-1a, 32 bit. */
function hashSeed(seed: string | number): number {
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for decoration. */
function makeRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Closed smooth path through points (Catmull-Rom converted to cubic beziers). */
function closedSmoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length;
  let d = `M${round(points[0][0])} ${round(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2[0])} ${round(p2[1])}`;
  }
  return `${d}Z`;
}

const STEPS = 32;

/**
 * Concentric wobbly iso-lines around one or two peaks. Each ring keeps its
 * peak's harmonics, so rings nest like real contours instead of crossing.
 * Returns SVG path `d` strings; rings may run past the box, so clip to it.
 */
export function generateContours({ seed, width, height, count = 8 }: ContourOptions): string[] {
  const total = Math.max(1, Math.min(24, Math.floor(count)));
  if (!(width > 0) || !(height > 0)) return [];
  const random = makeRandom(hashSeed(seed));
  const reach = Math.max(width, height);
  const peaks = total >= 6 ? 2 : 1;
  const paths: string[] = [];

  for (let peak = 0; peak < peaks; peak += 1) {
    const rings = peak === 0 ? Math.ceil(total / peaks) : total - paths.length;
    // Keep centres inside the box, off-centre so text areas stay calm.
    const cx = width * (0.15 + random() * 0.7);
    const cy = height * (0.15 + random() * 0.7);
    const harmonics = [2, 3, 5].map((k) => ({
      k,
      amplitude: (0.1 + random() * 0.12) / (k / 2),
      phase: random() * Math.PI * 2,
    }));
    const squash = 0.7 + random() * 0.5;
    const baseRadius = reach * (peak === 0 ? 0.07 : 0.05);
    const step = reach * (peak === 0 ? 0.075 : 0.06);

    for (let ring = 0; ring < rings; ring += 1) {
      const radius = baseRadius + step * ring;
      // Outer rings wobble a little more, like real terrain.
      const wobble = 1 + ring * 0.06;
      const points: Array<[number, number]> = [];
      for (let s = 0; s < STEPS; s += 1) {
        const theta = (s / STEPS) * Math.PI * 2;
        let scale = 1;
        for (const h of harmonics) scale += h.amplitude * wobble * Math.sin(h.k * theta + h.phase + ring * 0.12);
        points.push([cx + Math.cos(theta) * radius * scale, cy + Math.sin(theta) * radius * scale * squash]);
      }
      paths.push(closedSmoothPath(points));
    }
  }
  return paths;
}
