// Differential read test: asks the old and the new backend the same questions about
// copies of the same data and reports every response that differs.
// Usage: node compare-reads.cjs <oldBase> <newBase> <jwtSecret> <backend node_modules> <users json>
const [oldBase, newBase, secret, nm, usersJson] = process.argv.slice(2);
const jwt = require(nm + '/jsonwebtoken');
const users = JSON.parse(usersJson); // [{id,email,passwordVersion}]

// Fields that legitimately differ between two runs.
const VOLATILE = new Set(['serverTime', 'generatedAt', 'exportDate', 'integrity', 'timestamp', 'fetchedAt']);
const normalize = (v) => {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!VOLATILE.has(k)) o[k] = normalize(v[k]);
    return o;
  }
  return v;
};
const firstDiff = (a, b, path = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path || '(root)'}: old=${JSON.stringify(a)?.slice(0, 90)} new=${JSON.stringify(b)?.slice(0, 90)}`;
};

async function get(base, path, token) {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'mobile', Accept: 'application/json' } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { status: res.status, body };
}

const unwrap = (r) => (r.body && r.body.data !== undefined ? r.body.data : r.body);
const listOf = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? Object.values(d).find(Array.isArray) || [] : []);

(async () => {
  let compared = 0;
  const diffs = [];
  const statusCount = {};

  for (const user of users) {
    const token = jwt.sign({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion }, secret, { expiresIn: 3600 });
    const compare = async (path) => {
      const [o, n] = await Promise.all([get(oldBase, path, token), get(newBase, path, token)]);
      compared += 1;
      statusCount[n.status] = (statusCount[n.status] || 0) + 1;
      if (n.status >= 500 || ((n.status === 404 || n.status === 403 || n.status === 400) && !path.includes('999999'))) console.log('  ' + n.status, 'user', user.id, path, JSON.stringify(n.body).slice(0, 110));
      if (o.status !== n.status) diffs.push(`user ${user.id} ${path}: status old=${o.status} new=${n.status}`);
      else {
        const d = firstDiff(normalize(o.body), normalize(n.body));
        if (d) diffs.push(`user ${user.id} ${path}: ${d}`);
      }
      return n;
    };

    const global = [
      '/api/auth/me', '/api/users/me', '/api/users/immich-settings', '/api/users/weather-settings', '/api/users/aviationstack-settings',
      '/api/users/openrouteservice-settings', '/api/users/maps-settings', '/api/users/smtp-settings', '/api/users/link-ingest',
      '/api/users/travel-partner', '/api/users/travel-partner/requests', '/api/users/me/calendar-token', '/api/users/search?query=test',
      '/api/trips', '/api/trips?status=Completed', '/api/trips/shared', '/api/invitations', '/api/user-invitations', '/api/user-invitations/email-status',
      '/api/tags', '/api/companions', '/api/checklists', '/api/checklists/defaults/status', '/api/saved-links', '/api/saved-links/inbox-count',
      '/api/saved-links?tripId=none', '/api/travel-documents', '/api/travel-documents/alerts', '/api/travel-documents/primary-passport',
      '/api/trip-series', '/api/albums', '/api/locations/categories/list', '/api/locations/favorites', '/api/locations/visited',
      '/api/custom-items/types', '/api/deadlines/upcoming', '/api/food-log?q=a', '/api/pdf-imports', '/api/pdf-imports/pending', '/api/pdf-imports/pending/count',
      '/api/memories/on-this-day', '/api/memories/year-in-review/2025', '/api/memories/year-in-review/2026', '/api/search?q=a', '/api/search?q=trip',
      '/api/backup/info', '/api/push/public-key', '/api/languages', '/api/phrases/categories', '/api/phrases/es', '/api/airports?q=lax',
      '/api/transportation', '/api/auth/oidc/config',
    ];
    for (const p of global) await compare(p);

    const trips = listOf(unwrap(await get(newBase, '/api/trips?limit=200', token)));
    const shared = listOf(unwrap(await get(newBase, '/api/trips/shared', token)));
    const tripIds = [...new Set([...trips, ...shared].map((t) => t && (t.id || (t.trip && t.trip.id))).filter(Boolean))];
    // A trip the user must NOT be able to read, for the negative case.
    tripIds.push(999999);

    for (const id of tripIds) {
      const perTrip = [
        `/api/trips/${id}`, `/api/trips/${id}/validate`, `/api/trips/${id}/validation-status`, `/api/trips/${id}/permission`,
        `/api/trips/${id}/collaborators`, `/api/trips/${id}/invitations`, `/api/trips/${id}/mobile-sync`,
        `/api/trips/${id}/mobile-sync?since=2026-01-01T00:00:00.000Z`, `/api/trips/${id}/links/summary`, `/api/trips/${id}/links/target-type/LOCATION`,
        `/api/trips/${id}/expenses`, `/api/trips/${id}/budget-summary`, `/api/trips/${id}/deadlines`, `/api/trips/${id}/food-log`,
        `/api/trips/${id}/emergency-info`, `/api/trips/${id}/saved-links`, `/api/trips/${id}/languages`, `/api/trips/${id}/phrases`,
        `/api/trips/${id}/packing-suggestions`, `/api/trips/${id}/tracks?date=2026-06-01`, `/api/trips/${id}/ai/link-suggestions`,
        `/api/locations/trip/${id}`, `/api/activities/trip/${id}`, `/api/lodging/trip/${id}`, `/api/transportation/trip/${id}`,
        `/api/journal/trip/${id}`, `/api/custom-items/trip/${id}`, `/api/companions/trips/${id}`, `/api/tags/trips/${id}`,
        `/api/photos/trip/${id}`, `/api/photos/trip/${id}/unsorted`, `/api/photos/trip/${id}/date-groupings`, `/api/photos/trip/${id}/immich-asset-ids`,
        `/api/photos/trip/${id}/suggest-albums`, `/api/albums/trip/${id}`, `/api/travel-documents/trip/${id}/check`,
      ];
      const byPath = {};
      for (const p of perTrip) byPath[p] = await compare(p);

      const follow = async (listPath, detail) => {
        for (const item of listOf(unwrap(byPath[listPath] || { body: [] })).slice(0, 25)) if (item && item.id) await compare(detail(item.id));
      };
      await follow(`/api/locations/trip/${id}`, (x) => `/api/locations/${x}`);
      await follow(`/api/activities/trip/${id}`, (x) => `/api/activities/${x}`);
      await follow(`/api/lodging/trip/${id}`, (x) => `/api/lodging/${x}`);
      await follow(`/api/transportation/trip/${id}`, (x) => `/api/transportation/${x}`);
      await follow(`/api/journal/trip/${id}`, (x) => `/api/journal/${x}`);
      await follow(`/api/custom-items/trip/${id}`, (x) => `/api/custom-items/${x}`);
      await follow(`/api/photos/trip/${id}`, (x) => `/api/photos/${x}`);
      await follow(`/api/albums/trip/${id}`, (x) => `/api/albums/${x}`);
      await follow(`/api/trips/${id}/expenses`, (x) => `/api/trips/${id}/expenses/${x}`);
      await follow(`/api/activities/trip/${id}`, (x) => `/api/trips/${id}/links/entity/ACTIVITY/${x}`);
      await follow(`/api/locations/trip/${id}`, (x) => `/api/trips/${id}/links/to/LOCATION/${x}`);
      await follow(`/api/transportation/trip/${id}`, (x) => `/api/transportation/${x}/flight-status`);
    }
    for (const item of listOf(unwrap(await get(newBase, '/api/checklists', token))).slice(0, 25)) await compare(`/api/checklists/${item.id}`);
    for (const item of listOf(unwrap(await get(newBase, '/api/tags', token))).slice(0, 25)) await compare(`/api/tags/${item.id}`);
    for (const item of listOf(unwrap(await get(newBase, '/api/companions', token))).slice(0, 25)) await compare(`/api/companions/${item.id}`);
  }

  console.log(`requests compared: ${compared}`);
  console.log(`new-version status codes: ${JSON.stringify(statusCount)}`);
  console.log(`differences: ${diffs.length}`);
  for (const d of diffs) console.log(' -', d.slice(0, 330));
})();
