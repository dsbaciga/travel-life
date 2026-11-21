// End-to-end smoke test of a running Travel Life backend against a real database.
// Exercises the Prisma client through the HTTP API: creates, reads, updates,
// raw-SQL paths (memories, photo groupings), a backup round trip and deletes.
// Usage: node api-smoke.cjs <baseUrl> <outFile>
const fs = require('fs');
const base = process.argv[2].replace(/\/$/, '');
const out = process.argv[3];

const results = [];
let token = null;

async function call(name, method, path, body, { expect = [200, 201], raw = false } = {}) {
  const headers = { Accept: 'application/json', 'X-Client-Platform': 'mobile' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let status = 0;
  let json = null;
  let text = '';
  try {
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    text = await res.text();
    try { json = JSON.parse(text); } catch { /* not json */ }
  } catch (e) {
    text = String(e);
  }
  const ok = expect.includes(status);
  results.push({ name, status, ok, detail: ok ? '' : text.slice(0, 1500) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(status).padEnd(4)} ${name}${ok ? '' : '  -> ' + text.slice(0, 1500)}`);
  return raw ? json : json && json.data !== undefined ? json.data : json;
}

(async () => {
  const stamp = Date.now();
  const email = `smoke${stamp}@example.com`;

  await call('health', 'GET', '/health');
  const reg = await call('register', 'POST', '/api/auth/register', { username: `smoke${stamp}`, email, password: 'Smoke-Test-123' });
  token = reg && reg.accessToken;
  const login = await call('login', 'POST', '/api/auth/login', { email, password: 'Smoke-Test-123' });
  token = (login && login.accessToken) || token;
  const refreshed = await call('refresh', 'POST', '/api/auth/refresh', { refreshToken: login && login.refreshToken });
  token = (refreshed && refreshed.accessToken) || token;
  await call('auth me', 'GET', '/api/auth/me');
  await call('users me', 'GET', '/api/users/me');
  await call('update settings', 'PUT', '/api/users/settings', { timezone: 'Europe/Paris' });

  const trip = await call('create trip', 'POST', '/api/trips', {
    title: 'Smoke trip', description: 'desc', startDate: '2026-06-01', endDate: '2026-06-05', timezone: 'Europe/Paris', countryCode: 'FR',
  });
  const tripId = trip && trip.id;
  await call('list trips', 'GET', '/api/trips');
  await call('get trip', 'GET', `/api/trips/${tripId}`);
  await call('update trip', 'PUT', `/api/trips/${tripId}`, { title: 'Smoke trip (edited)', budget: 1500, budgetCurrency: 'EUR' }, { expect: [200, 400] });

  const parent = await call('create location', 'POST', '/api/locations', {
    tripId, name: 'Paris', latitude: 48.8566, longitude: 2.3522, address: 'Paris, France',
  });
  const child = await call('create child location', 'POST', '/api/locations', {
    tripId, name: 'Louvre', latitude: 48.8606, longitude: 2.3376, parentId: parent && parent.id,
  });
  await call('update location coords', 'PUT', `/api/locations/${child && child.id}`, { latitude: 48.861, longitude: 2.338, notes: 'moved' });
  await call('list locations', 'GET', `/api/locations/trip/${tripId}`);
  await call('get location', 'GET', `/api/locations/${parent && parent.id}`);

  const activity = await call('create activity', 'POST', '/api/activities', {
    tripId, name: 'Museum', startTime: '2026-06-02T09:00:00.000Z', endTime: '2026-06-02T11:00:00.000Z', timezone: 'Europe/Paris',
    cost: 22.5, currency: 'EUR', bookingUrl: 'https://example.com/tickets', dietaryTags: ['vegetarian'],
  });
  await call('reject javascript: booking link', 'POST', '/api/activities', { tripId, name: 'Bad', bookingUrl: 'javascript:alert(1)' }, { expect: [400] });
  await call('update activity', 'PUT', `/api/activities/${activity && activity.id}`, { notes: 'bring tickets', cost: 25 });
  await call('list activities', 'GET', `/api/activities/trip/${tripId}`);

  const lodging = await call('create lodging', 'POST', '/api/lodging', {
    tripId, type: 'hotel', name: 'Hotel Smoke', checkInDate: '2026-06-01T15:00:00.000Z', checkOutDate: '2026-06-05T10:00:00.000Z', cost: 480, currency: 'EUR',
  });
  await call('list lodging', 'GET', `/api/lodging/trip/${tripId}`);

  const transport = await call('create transportation', 'POST', '/api/transportation', {
    tripId, type: 'train', fromLocationName: 'Lyon', toLocationId: parent && parent.id,
    departureTime: '2026-06-01T08:00:00.000Z', arrivalTime: '2026-06-01T10:00:00.000Z', startTimezone: 'Europe/Paris', endTimezone: 'Europe/Paris', cost: 60, currency: 'EUR',
  });
  await call('list transportation', 'GET', `/api/transportation/trip/${tripId}`);

  await call('create journal entry', 'POST', '/api/journal', { tripId, title: 'Day 1', content: '**Arrived** in Paris', entryDate: '2026-06-01T20:00:00.000Z' });
  await call('list journal', 'GET', `/api/journal/trip/${tripId}`);

  await call('create link activity->location', 'POST', `/api/trips/${tripId}/links`, {
    tripId, sourceType: 'ACTIVITY', sourceId: activity && activity.id, targetType: 'LOCATION', targetId: child && child.id,
  });
  await call('link summary', 'GET', `/api/trips/${tripId}/links/summary`);

  const expense = await call('create expense', 'POST', `/api/trips/${tripId}/expenses`, { description: 'Lunch', category: 'food', amount: 31.4, currency: 'EUR', date: '2026-06-02' }, { expect: [200, 201, 400] });
  await call('list expenses', 'GET', `/api/trips/${tripId}/expenses`);
  await call('budget summary', 'GET', `/api/trips/${tripId}/budget-summary`, undefined, { expect: [200, 404] });
  void expense;

  const tag = await call('create tag', 'POST', '/api/tags', { name: `smoke-${stamp}`, color: '#336699' });
  await call('link tag to trip', 'POST', '/api/tags/link', { tripId, tagId: tag && tag.id }, { expect: [200, 201, 404] });
  await call('create companion', 'POST', '/api/companions', { name: 'Sam', email: 'sam@example.com', allergies: ['nuts'] });
  await call('list companions', 'GET', '/api/companions');

  await call('checklists', 'GET', '/api/checklists');
  await call('create checklist', 'POST', '/api/checklists', { name: 'Packing', type: 'custom', tripId }, { expect: [200, 201, 400] });
  await call('saved links', 'GET', '/api/saved-links');
  await call('deadlines upcoming', 'GET', '/api/deadlines/upcoming', undefined, { expect: [200, 404] });
  await call('travel documents', 'GET', '/api/travel-documents');
  await call('trip series', 'GET', '/api/trip-series');

  await call('search (raw + filters)', 'GET', '/api/search?q=Smoke');
  await call('memories on this day (raw SQL)', 'GET', '/api/memories/on-this-day');
  await call('memories year in review (raw SQL)', 'GET', '/api/memories/year-in-review/2026');
  await call('photos by trip', 'GET', `/api/photos/trip/${tripId}`);
  await call('photo date groupings (raw SQL)', 'GET', `/api/photos/trip/${tripId}/date-groupings`);
  await call('albums by trip', 'GET', `/api/albums/trip/${tripId}`);
  await call('mobile sync snapshot', 'GET', `/api/trips/${tripId}/mobile-sync`);
  await call('trip validate', 'GET', `/api/trips/${tripId}/validate`);
  await call('collaborators', 'GET', `/api/trips/${tripId}/collaborators`);
  await call('shared trips', 'GET', '/api/trips/shared');
  await call('packing suggestions', 'GET', `/api/trips/${tripId}/packing-suggestions`, undefined, { expect: [200, 400, 404] });

  const share = await call('enable share', 'POST', `/api/trips/${tripId}/share`, {});
  const shareToken = share && (share.shareToken || share.token);
  const saved = token;
  token = null;
  await call('public share (no sign-in)', 'GET', `/api/public/trips/${shareToken}`);
  await call('anonymous request is refused', 'GET', '/api/trips', undefined, { expect: [401] });
  token = saved;
  const cal = await call('calendar token', 'POST', '/api/users/me/calendar-token', {});
  token = null;
  await call('calendar feed (no sign-in)', 'GET', `/api/calendar/${cal && cal.token}.ics`, undefined, { expect: [200] });
  token = saved;

  const dup = await call('duplicate trip (transaction)', 'POST', `/api/trips/${tripId}/duplicate`, {
    title: 'Smoke copy', copyEntities: { locations: true, activities: true, lodging: true, transportation: true, journalEntries: true },
  });

  const backup = await call('create backup', 'POST', '/api/backup/create', {}, { raw: true });
  await call('backup info', 'GET', '/api/backup/info');
  const backupData = backup && backup.data !== undefined && backup.status ? backup.data : backup;
  await call('restore backup (long transaction)', 'POST', '/api/backup/restore', { backupData, options: { clearExistingData: true } }, { expect: [200, 201] });
  const after = await call('list trips after restore', 'GET', '/api/trips');
  const count = Array.isArray(after) ? after.length : after && (after.trips ? after.trips.length : after.total);
  results.push({ name: 'trips present after restore', status: count, ok: count >= 2, detail: `count=${count}` });
  console.log(`${count >= 2 ? 'ok  ' : 'FAIL'} ${String(count).padEnd(4)} trips present after restore`);
  void dup;

  const list = Array.isArray(after) ? after : (after && after.trips) || [];
  for (const t of list) await call(`delete trip (cascade)`, 'DELETE', `/api/trips/${t.id}`, undefined, { expect: [200, 204] });
  await call('logout', 'POST', '/api/auth/logout', { refreshToken: refreshed && refreshed.refreshToken });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} checks, ${failed.length} failed`);
  fs.writeFileSync(out, JSON.stringify(results.map(({ name, status, ok }) => ({ name, status, ok })), null, 1));
  process.exit(0);
})();
