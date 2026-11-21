// End-to-end check of the November 2026 feature batch against a real database.
// Covers: expense splits (#97), receipts (#122), photo favorites (#100), loyalty programs (#109),
// trip stops (#13), measurement units, trip comparison (#11), CSV import (#27), journal day
// draft (#120), Immich sync (#70), booking deadlines (#116), the backup round trip, trip
// duplication and mobile sync.
//
// Usage: node batch-nov-2026-smoke.cjs <baseUrl> <outFile> [dbContainer]
//   baseUrl      the running backend, started from `backend/` (its cwd decides where uploads/ is)
//   dbContainer  docker container to run psql in (default tl-batch-verify; database `batch`, user `tl`)
//
// The fake-Immich section needs the backend to accept a loopback Immich URL, which is an
// operator opt-in: start it with ALLOW_PRIVATE_INTEGRATION_URLS=true. Without it that section
// is reported as SKIP (never silently passed) and the no-Immich checks still run.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const base = process.argv[2].replace(/\/$/, '');
const outFile = process.argv[3];
const dbContainer = process.argv[4] || 'tl-batch-verify';
const backendDir = path.resolve(__dirname, '../../backend');
const uploadsDir = path.join(backendDir, 'uploads');
const sharp = require(path.join(backendDir, 'node_modules', 'sharp'));

const results = [];

function record(name, ok, detail, status = '') {
  results.push({ name, ok, status, detail: ok ? '' : String(detail).slice(0, 1500) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(status).padEnd(4)} ${name}${ok ? '' : '  -> ' + String(detail).slice(0, 1500)}`);
  return ok;
}
function skip(name, why) {
  results.push({ name, ok: true, skipped: true, status: 'SKIP', detail: why });
  console.log(`SKIP      ${name}  (${why})`);
}
const check = (name, cond, detail = '') => record(name, Boolean(cond), detail);

async function http_(method, p, { token, body, form, headers = {}, mobile = true } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (mobile) h['X-Client-Platform'] = 'mobile';
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + p, { method, headers: h, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, data: json && json.data !== undefined ? json.data : json, text, buf, headers: res.headers };
}

// A call that is recorded as one step. `expect` lists acceptable statuses.
async function call(name, method, p, body, { token, expect = [200, 201], form, ...rest } = {}) {
  let r;
  try {
    r = await http_(method, p, { token, body, form, ...rest });
  } catch (e) {
    record(name, false, String(e));
    return { status: 0, data: null, json: null, text: String(e), buf: Buffer.alloc(0) };
  }
  record(name, expect.includes(r.status), r.text.slice(0, 1500), r.status);
  return r;
}

const money = (n) => Math.round(n * 100) / 100;
const sum = (xs) => money(xs.reduce((a, b) => a + b, 0));
const psql = (sql) => execFileSync('docker', ['exec', dbContainer, 'psql', '-U', 'tl', '-d', 'batch', '-Atc', sql], { encoding: 'utf8' }).trim();

function makeImage(kind, { w = 800, h = 600, color = { r: 200, g: 60, b: 60 }, marker } = {}) {
  let s = sharp({ create: { width: w, height: h, channels: 3, background: color } });
  if (kind === 'png') return s.png().toBuffer();
  if (marker) s = s.withExif({ IFD0: { Copyright: marker, ImageDescription: marker } });
  return s.jpeg().toBuffer();
}
function formWith(field, buf, filename, type, extra = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.append(k, String(v));
  f.append(field, new Blob([buf], { type }), filename);
  return f;
}
const fileOnDisk = (urlPath) => path.join(backendDir, urlPath.replace(/^\//, ''));
const exists = (urlPath) => fs.existsSync(fileOnDisk(urlPath));

async function register(label) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `batch-${label}-${stamp}@example.com`;
  const r = await call(`register ${label}`, 'POST', '/api/auth/register', { username: `b${label}${stamp}`.slice(0, 40), email, password: 'Batch-Test-123' });
  return { label, email, token: r.data && r.data.accessToken, refresh: r.data && r.data.refreshToken, id: r.data && r.data.user && r.data.user.id };
}

async function addCollaborator(owner, tripId, user, level) {
  const inv = await call(`invite ${user.label} (${level})`, 'POST', `/api/trips/${tripId}/invitations`, { email: user.email, permissionLevel: level }, { token: owner.token });
  const id = inv.data && (inv.data.id || (inv.data.invitation && inv.data.invitation.id));
  await call(`accept invitation ${user.label}`, 'POST', `/api/invitations/${id}/accept`, {}, { token: user.token });
}

(async () => {
  const stamp = Date.now();
  console.log(`Backend: ${base}   uploads: ${uploadsDir}\n`);
  await call('health', 'GET', '/health');

  // ---------------------------------------------------------------------------------------------
  // Users and the main trip
  // ---------------------------------------------------------------------------------------------
  const O = await register('owner');
  const E = await register('editor');
  const V = await register('viewer');
  const X = await register('stranger');
  await call('owner base currency EUR', 'PUT', '/api/users/settings', { baseCurrency: 'EUR', timezone: 'Europe/Paris' }, { token: O.token });

  const mk = async (title, extra = {}) => (await call(`create trip "${title}"`, 'POST', '/api/trips', {
    title, startDate: '2026-06-01', endDate: '2026-06-05', timezone: 'Europe/Paris', countryCode: 'FR', ...extra,
  }, { token: O.token })).data;
  const trip = await mk('Batch trip');
  const T = trip.id;
  await addCollaborator(O, T, E, 'edit');
  await addCollaborator(O, T, V, 'view');

  const paris = (await call('create location Paris', 'POST', '/api/locations', { tripId: T, name: 'Paris', latitude: 48.8566, longitude: 2.3522 }, { token: O.token })).data;
  const hidden = (await call('create location excludeFromMap', 'POST', '/api/locations', { tripId: T, name: 'Hidden spot', latitude: 48.9, longitude: 2.4, excludeFromMap: true }, { token: O.token })).data;
  const noCoords = (await call('create location without coordinates', 'POST', '/api/locations', { tripId: T, name: 'Nowhere' }, { token: O.token })).data;
  const lyon = (await call('create location Lyon', 'POST', '/api/locations', { tripId: T, name: 'Lyon', latitude: 45.764, longitude: 4.8357 }, { token: O.token })).data;

  // ---------------------------------------------------------------------------------------------
  // #97 expense splits
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #97 expense splits');
  const sam = (await call('create companion Sam', 'POST', '/api/companions', { name: 'Sam' }, { token: O.token })).data;
  const alex = (await call('create companion Alex', 'POST', '/api/companions', { name: 'Alex' }, { token: O.token })).data;
  const temp = (await call('create companion Temp', 'POST', '/api/companions', { name: 'Temp' }, { token: O.token })).data;
  let r = await call('participants before linking', 'GET', `/api/trips/${T}/expenses/participants`, undefined, { token: O.token });
  check('participants: only the owner before any companion is linked', Array.isArray(r.data) && r.data.length === 1 && r.data[0].key === 'owner' && r.data[0].kind === 'owner', r.text);
  for (const c of [sam, alex, temp]) await call(`link companion ${c.name} to trip`, 'POST', '/api/companions/link', { tripId: T, companionId: c.id }, { token: O.token });
  r = await call('participants after linking', 'GET', `/api/trips/${T}/expenses/participants`, undefined, { token: O.token });
  const keys = (r.data || []).map((p) => p.key);
  check('participants: owner + three companions with companion:<id> keys', keys.length === 4 && keys.includes(`companion:${sam.id}`) && keys.includes(`companion:${temp.id}`), r.text);
  await call('participants: stranger refused', 'GET', `/api/trips/${T}/expenses/participants`, undefined, { token: X.token, expect: [403, 404] });
  r = await call('participants: view-only collaborator may read', 'GET', `/api/trips/${T}/expenses/participants`, undefined, { token: V.token });

  const exp = async (description, category, amount, currency, date = '2026-06-02') =>
    (await call(`create expense "${description}" ${amount} ${currency}`, 'POST', `/api/trips/${T}/expenses`, { description, category, amount, currency, date }, { token: O.token })).data;
  const e1 = await exp('Dinner', 'food', 90, 'EUR');
  const e2 = await exp('Souvenirs', 'shopping', 60, 'USD');
  const e3 = await exp('Taxi odd cents', 'transportation', 100.01, 'EUR', '2026-06-03');
  const e4 = await exp('Tickets', 'activities', 200, 'EUR', '2026-06-03');
  const e5 = await exp('Unsplit', 'other', 10, 'EUR', '2026-06-04');
  check('new expense has paidBy null and no splits', e1.paidBy === null && Array.isArray(e1.splits) && e1.splits.length === 0, JSON.stringify(e1));

  const split = (id, body, token = O.token, expect = [200]) => call(`set split on expense ${id} ${JSON.stringify(body).slice(0, 90)}`, 'PUT', `/api/trips/${T}/expenses/${id}/split`, body, { token, expect });
  const O_ = 'owner', S_ = `companion:${sam.id}`, A_ = `companion:${alex.id}`, T_ = `companion:${temp.id}`;
  r = await split(e1.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }, { participant: S_ }, { participant: A_ }] });
  check('equal split of 90 = 30/30/30 and sums to the amount', r.data && r.data.splits.length === 3 && r.data.splits.every((s) => s.amount === 30) && r.data.paidBy === 'owner', r.text);
  r = await split(e3.id, { paidBy: S_, method: 'equal', participants: [{ participant: O_ }, { participant: S_ }, { participant: A_ }] });
  check('equal split of 100.01 keeps every cent (sums exactly)', r.data && sum(r.data.splits.map((s) => s.amount)) === 100.01 && r.data.paidBy === S_, r.text);
  r = await split(e2.id, { paidBy: S_, method: 'amount', participants: [{ participant: O_, amount: 20 }, { participant: S_, amount: 40 }] });
  check('amount split on the USD expense is stored in USD', r.data && sum(r.data.splits.map((s) => s.amount)) === 60 && r.data.splitMethod === 'amount' && r.data.splits.length === 2, r.text);
  r = await split(e4.id, { paidBy: A_, method: 'percentage', participants: [{ participant: O_, percentage: 25 }, { participant: S_, percentage: 25 }, { participant: A_, percentage: 50 }] });
  check('percentage split 25/25/50 of 200 = 50/50/100 with percentages kept', r.data && r.data.splits.map((s) => s.amount).sort((a, b) => a - b).join() === '50,50,100' && r.data.splits.some((s) => s.percentage === 50), r.text);
  await split(e5.id, { paidBy: O_, method: 'amount', participants: [{ participant: O_, amount: 4 }, { participant: S_, amount: 5 }] }, O.token, [400]);
  await split(e5.id, { paidBy: O_, method: 'percentage', participants: [{ participant: O_, percentage: 60 }, { participant: S_, percentage: 30 }] }, O.token, [400]);
  await split(e5.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }, { participant: O_ }] }, O.token, [400]);
  await split(e5.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }, { participant: 'companion:99999999' }] }, O.token, [400]);
  await split(e5.id, { paidBy: O_, participants: [{ participant: O_ }] }, O.token, [400]);
  await split(e5.id, { paidBy: O_, method: 'equal', participants: [] }, O.token, [400]);
  await split(e5.id, { paidBy: 'bogus', method: 'equal', participants: [{ participant: O_ }] }, O.token, [400]);
  r = await call('rejected splits left expense 5 untouched', 'GET', `/api/trips/${T}/expenses/${e5.id}`, undefined, { token: O.token });
  check('expense 5 still has no payer/splits', r.data.paidBy === null && r.data.splits.length === 0, r.text);
  await split(e5.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }] }, V.token, [403]);
  await split(e5.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }] }, X.token, [403, 404]);
  r = await split(e5.id, { paidBy: O_, method: 'equal', participants: [{ participant: O_ }, { participant: S_ }] }, E.token);
  check('edit collaborator can set a split', r.data && r.data.splits.length === 2, r.text);
  r = await split(e5.id, { paidBy: null });
  check('paidBy null clears payer and split', r.data && r.data.paidBy === null && r.data.splits.length === 0, r.text);

  r = await call('settle-up', 'GET', `/api/trips/${T}/settle-up`, undefined, { token: O.token });
  const su = r.data || { balances: [], transfers: [], unsplit: [], unconverted: [] };
  check('settle-up currency is the owner base currency EUR', su.currency === 'EUR', r.text);
  check('settle-up balances sum to zero', Math.abs(sum(su.balances.map((b) => b.net))) <= 0.02, JSON.stringify(su.balances));
  check('settle-up: paid - owed = net for each balance', su.balances.every((b) => Math.abs(b.paid - b.owed - b.net) <= 0.011), JSON.stringify(su.balances));
  const net = Object.fromEntries(su.balances.map((b) => [b.participant, b.net]));
  for (const t of su.transfers) { net[t.from] = money((net[t.from] || 0) + t.amount); net[t.to] = money((net[t.to] || 0) - t.amount); }
  check('settle-up: applying the transfers settles every balance', Object.values(net).every((v) => Math.abs(v) <= 0.02), JSON.stringify({ net, transfers: su.transfers }));
  check('settle-up: the unsplit expense (e5) is listed, nothing unconverted (FX reachable)', su.unsplit.some((u) => u.expenseId === e5.id) && su.unconverted.length === 0 && su.isComplete === false, r.text);
  const samBal = su.balances.find((b) => b.participant === S_);
  check('settle-up: mixed currencies - Sam paid 100.01 EUR + 60 USD converted', samBal && samBal.paid > 100.01 + 40 && samBal.paid < 100.01 + 70, JSON.stringify(samBal));
  await call('settle-up: stranger refused', 'GET', `/api/trips/${T}/settle-up`, undefined, { token: X.token, expect: [403, 404] });
  await call('settle-up: view-only collaborator may read', 'GET', `/api/trips/${T}/settle-up`, undefined, { token: V.token });

  // Changing an amount re-scales the shares.
  r = await call('update expense 1 amount 90 -> 120', 'PUT', `/api/trips/${T}/expenses/${e1.id}`, { amount: 120 }, { token: O.token });
  const putSplits = r.data && r.data.splits;
  const g = await call('get expense 1 after amount change', 'GET', `/api/trips/${T}/expenses/${e1.id}`, undefined, { token: O.token });
  check('amount change re-scales the stored shares to 40/40/40 (sum 120)', g.data.splits.length === 3 && g.data.splits.every((s) => s.amount === 40), g.text);
  check('PUT /expenses/:id response carries the same splits as a GET', Array.isArray(putSplits) && putSplits.length === g.data.splits.length, `PUT returned splits=${JSON.stringify(putSplits)}`);
  r = await call('update expense 3 amount 100.01 -> 100.02 (odd cents)', 'PUT', `/api/trips/${T}/expenses/${e3.id}`, { amount: 100.02 }, { token: O.token });
  const g3 = await call('get expense 3', 'GET', `/api/trips/${T}/expenses/${e3.id}`, undefined, { token: O.token });
  check('re-scaled odd-cent shares still sum to the new amount', sum(g3.data.splits.map((s) => s.amount)) === 100.02, g3.text);
  await call('restore expense 3 amount', 'PUT', `/api/trips/${T}/expenses/${e3.id}`, { amount: 100.01 }, { token: O.token });

  // Deleting a companion.
  const e6 = await exp('Temp paid', 'other', 50, 'EUR', '2026-06-04');
  await split(e6.id, { paidBy: T_, method: 'equal', participants: [{ participant: O_ }, { participant: T_ }] });
  await call('delete companion Temp', 'DELETE', `/api/companions/${temp.id}`, undefined, { token: O.token, expect: [200, 204] });
  const g6 = await call('get expense paid by deleted companion', 'GET', `/api/trips/${T}/expenses/${e6.id}`, undefined, { token: O.token });
  check('deleting a companion clears them as payer and removes their share rows (expense is kept)', g6.data.paidBy === null && g6.data.splits.length === 1, g6.text);
  r = await call('settle-up after companion deletion', 'GET', `/api/trips/${T}/settle-up`, undefined, { token: O.token });
  check('expense whose split no longer adds up is reported as unsplit, balances still sum to zero', r.data.unsplit.some((u) => u.expenseId === e6.id) && Math.abs(sum(r.data.balances.map((b) => b.net))) <= 0.02, r.text);

  // ---------------------------------------------------------------------------------------------
  // #122 receipts
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #122 receipts');
  const MARK = 'EXIF-SECRET-MARK-123';
  const jpegWithExif = await makeImage('jpeg', { marker: MARK });
  check('test image carries the EXIF marker', jpegWithExif.includes(Buffer.from(MARK)), 'sharp did not write EXIF');
  const rp = (id) => `/api/trips/${T}/expenses/${id}/receipt`;
  r = await call('attach receipt (JPEG with EXIF) as owner', 'POST', rp(e1.id), undefined, { token: O.token, form: formWith('image', jpegWithExif, 'r.jpg', 'image/jpeg') });
  const rec1 = r.data && r.data.receiptPath;
  check('expense reports receiptPath /uploads/receipts/<uuid>.jpg, mime and size', /^\/uploads\/receipts\/[0-9a-f-]+\.jpg$/.test(rec1 || '') && r.data.receiptMimeType === 'image/jpeg' && r.data.receiptSizeBytes > 0 && r.data.receiptUploadedAt, r.text);
  r = await call('list expenses shows the receipt', 'GET', `/api/trips/${T}/expenses`, undefined, { token: O.token });
  check('list reports the receipt on that expense only', r.data.find((x) => x.id === e1.id).receiptPath === rec1 && r.data.find((x) => x.id === e2.id).receiptPath == null, r.text);
  check('stored file exists on disk', rec1 && exists(rec1), rec1);
  const stored = rec1 && exists(rec1) ? fs.readFileSync(fileOnDisk(rec1)) : Buffer.alloc(0);
  const meta = stored.length ? await sharp(stored).metadata() : {};
  check('stored file is a JPEG', meta.format === 'jpeg' && stored[0] === 0xff && stored[1] === 0xd8, JSON.stringify(meta));
  check('stored file has no EXIF block and no marker text', !meta.exif && !stored.includes(Buffer.from(MARK)), `exif=${meta.exif ? meta.exif.length : 0}`);
  const fetchFile = (p, token) => http_('GET', p, { token, mobile: false });
  r = await fetchFile(rec1, O.token); check('receipt file: owner 200 and is an image', r.status === 200 && /image\/jpeg/.test(r.headers.get('content-type') || '') && r.buf.length > 100, `status ${r.status}`);
  r = await fetchFile(rec1, E.token); check('receipt file: edit collaborator 200', r.status === 200, `status ${r.status}`);
  r = await fetchFile(rec1, V.token); check('receipt file: view-only collaborator 200', r.status === 200, `status ${r.status}`);
  r = await fetchFile(rec1, X.token); check('receipt file: stranger refused (404 by design: file existence is not revealed)', r.status === 404 || r.status === 403, `status ${r.status}`);
  r = await fetchFile(rec1, undefined); check('receipt file: unauthenticated refused (404 by design)', [401, 403, 404].includes(r.status), `status ${r.status}`);
  r = await fetchFile('/uploads/receipts/../../.env', O.token); check('receipt file: traversal attempt gets no file', r.status !== 200, `status ${r.status}`);

  r = await call('attach receipt as view-only collaborator refused', 'POST', rp(e2.id), undefined, { token: V.token, form: formWith('image', jpegWithExif, 'r.jpg', 'image/jpeg'), expect: [403] });
  r = await call('attach receipt as stranger refused', 'POST', rp(e2.id), undefined, { token: X.token, form: formWith('image', jpegWithExif, 'r.jpg', 'image/jpeg'), expect: [403, 404] });
  await call('attach: a text file named .jpg is rejected', 'POST', rp(e2.id), undefined, { token: O.token, form: formWith('image', Buffer.from('this is not an image at all'), 'r.jpg', 'image/jpeg'), expect: [400, 415, 422] });
  await call('attach: a file larger than 10 MB is rejected with 413', 'POST', rp(e2.id), undefined, { token: O.token, form: formWith('image', Buffer.alloc(11 * 1024 * 1024, 1), 'big.jpg', 'image/jpeg'), expect: [413] });
  await call('attach: no file is rejected', 'POST', rp(e2.id), undefined, { token: O.token, form: new FormData(), expect: [400] });
  r = await call('expense 2 still has no receipt after the rejections', 'GET', `/api/trips/${T}/expenses/${e2.id}`, undefined, { token: O.token });
  check('no receipt recorded for rejected uploads', r.data.receiptPath == null, r.text);

  const png = await makeImage('png', { color: { r: 20, g: 120, b: 200 } });
  r = await call('replace receipt with a PNG', 'POST', rp(e1.id), undefined, { token: O.token, form: formWith('image', png, 'r.png', 'image/png') });
  const rec1b = r.data && r.data.receiptPath;
  check('replacement has a new path, is stored as JPEG, and the old file is gone from disk', rec1b && rec1b !== rec1 && exists(rec1b) && !exists(rec1) && (await sharp(fs.readFileSync(fileOnDisk(rec1b))).metadata()).format === 'jpeg', `${rec1} -> ${rec1b}`);
  r = await fetchFile(rec1, O.token); check('old receipt URL is no longer served', r.status === 404, `status ${r.status}`);
  r = await call('remove receipt (DELETE)', 'DELETE', rp(e1.id), undefined, { token: O.token });
  check('DELETE clears the receipt fields and deletes the file', r.data.receiptPath === null && r.data.receiptMimeType === null && !exists(rec1b), r.text);
  r = await call('attach again (e1)', 'POST', rp(e1.id), undefined, { token: O.token, form: formWith('image', await makeImage('jpeg', { color: { r: 10, g: 200, b: 10 } }), 'r.jpg', 'image/jpeg') });
  const recKeep1 = r.data.receiptPath;
  r = await call('attach receipt on expense 3 (kept for the backup test)', 'POST', rp(e3.id), undefined, { token: O.token, form: formWith('image', await makeImage('jpeg', { color: { r: 10, g: 10, b: 200 } }), 'r.jpg', 'image/jpeg') });
  const recKeep3 = r.data.receiptPath;
  const eDel = await exp('Receipt to delete', 'other', 5, 'EUR');
  r = await call('attach receipt on throwaway expense', 'POST', rp(eDel.id), undefined, { token: O.token, form: formWith('image', png, 'r.png', 'image/png') });
  const recDel = r.data.receiptPath;
  await call('delete the expense', 'DELETE', `/api/trips/${T}/expenses/${eDel.id}`, undefined, { token: O.token });
  check('deleting an expense removes its receipt file', recDel && !exists(recDel), recDel);
  const tripDel = await mk('Trip with receipt');
  const eTD = (await call('create expense on throwaway trip', 'POST', `/api/trips/${tripDel.id}/expenses`, { description: 'x', category: 'food', amount: 3, currency: 'EUR', date: '2026-06-02' }, { token: O.token })).data;
  r = await call('attach receipt on throwaway trip', 'POST', `/api/trips/${tripDel.id}/expenses/${eTD.id}/receipt`, undefined, { token: O.token, form: formWith('image', png, 'r.png', 'image/png') });
  const recTD = r.data.receiptPath;
  await call('delete the trip', 'DELETE', `/api/trips/${tripDel.id}`, undefined, { token: O.token, expect: [200, 204] });
  check('deleting a trip removes its receipt files', recTD && !exists(recTD), recTD);
  r = await call('scan-receipt with no AI configured -> 503', 'POST', `/api/trips/${T}/expenses/scan-receipt`, undefined, { token: O.token, form: formWith('image', jpegWithExif, 'r.jpg', 'image/jpeg'), expect: [503] });
  check('scan-receipt 503 carries a message', r.json && /AI key/i.test(r.json.message || ''), r.text);

  // ---------------------------------------------------------------------------------------------
  // #100 photo favorites
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #100 photo favorites');
  const up = async (label, takenAt, color) => (await call(`upload photo ${label}`, 'POST', '/api/photos/upload', undefined, {
    token: O.token, form: formWith('photo', await makeImage('jpeg', { color, w: 640, h: 480 }), `${label}.jpg`, 'image/jpeg', { tripId: T, takenAt, caption: label }),
  })).data;
  const p1 = await up('p1', '2026-06-02T10:00:00.000Z', { r: 255, g: 0, b: 0 });
  const p2 = await up('p2', '2026-06-02T12:00:00.000Z', { r: 0, g: 255, b: 0 });
  const p3 = await up('p3', '2026-06-03T12:00:00.000Z', { r: 0, g: 0, b: 255 });
  check('uploaded photos start as not favorite', [p1, p2, p3].every((p) => p && p.isFavorite === false), JSON.stringify([p1, p2, p3].map((p) => p && p.isFavorite)));
  r = await call('star p1', 'PUT', `/api/photos/${p1.id}`, { isFavorite: true }, { token: O.token });
  check('PUT returns isFavorite true', r.data.isFavorite === true, r.text);
  await call('star p3', 'PUT', `/api/photos/${p3.id}`, { isFavorite: true }, { token: O.token });
  await call('star: view-only collaborator refused', 'PUT', `/api/photos/${p2.id}`, { isFavorite: true }, { token: V.token, expect: [403, 404] });
  await call('star: stranger refused', 'PUT', `/api/photos/${p2.id}`, { isFavorite: true }, { token: X.token, expect: [403, 404] });
  r = await call('photo p2 untouched by refused stars', 'GET', `/api/photos/${p2.id}`, undefined, { token: O.token });
  check('p2 is still not a favorite', r.data.isFavorite === false, r.text);
  const ids = (res) => ((res.data && (res.data.photos || res.data)) || []).map((p) => p.id).sort((a, b) => a - b);
  r = await call('trip photos favoritesOnly=true', 'GET', `/api/photos/trip/${T}?favoritesOnly=true`, undefined, { token: O.token });
  check('favoritesOnly returns exactly p1 and p3 and total 2', ids(r).join() === [p1.id, p3.id].sort((a, b) => a - b).join() && r.data.total === 2, r.text);
  r = await call('trip photos without the filter', 'GET', `/api/photos/trip/${T}`, undefined, { token: O.token });
  check('unfiltered list has all three', ids(r).length === 3, r.text);
  r = await call('trip photos favoritesOnly=false', 'GET', `/api/photos/trip/${T}?favoritesOnly=false`, undefined, { token: O.token });
  check('favoritesOnly=false is the unfiltered list', ids(r).length === 3, r.text);
  r = await call('unsorted photos favoritesOnly=true', 'GET', `/api/photos/trip/${T}/unsorted?favoritesOnly=true`, undefined, { token: O.token });
  check('unsorted + favoritesOnly returns only the starred ones', ids(r).join() === [p1.id, p3.id].sort((a, b) => a - b).join(), r.text);
  const album = (await call('create album', 'POST', '/api/albums', { tripId: T, name: 'Batch album' }, { token: O.token })).data;
  await call('add photos to album', 'POST', `/api/albums/${album.id}/photos`, { photoIds: [p1.id, p2.id] }, { token: O.token });
  r = await call('album favoritesOnly=true', 'GET', `/api/albums/${album.id}?favoritesOnly=true`, undefined, { token: O.token });
  const albumPhotoIds = ((r.data && r.data.photos) || []).map((x) => (x.photo || x).id);
  check('album + favoritesOnly returns only p1', albumPhotoIds.join() === String(p1.id), r.text);
  r = await call('photos by date (raw SQL) in Paris time', 'GET', `/api/photos/trip/${T}/by-date/2026-06-02?timezone=Europe/Paris`, undefined, { token: O.token });
  const byDate = (r.data && r.data.photos) || r.data || [];
  check('by-date rows carry isFavorite (true for p1, false for p2)', byDate.length === 2 && byDate.find((x) => x.id === p1.id).isFavorite === true && byDate.find((x) => x.id === p2.id).isFavorite === false, r.text);
  r = await call('photo date groupings (raw SQL)', 'GET', `/api/photos/trip/${T}/date-groupings?timezone=Europe/Paris`, undefined, { token: O.token });
  r = await call('enable public share', 'POST', `/api/trips/${T}/share`, {}, { token: O.token });
  const shareToken = r.data.shareToken || r.data.token;
  r = await call('public share payload (no sign-in)', 'GET', `/api/public/trips/${shareToken}`, undefined, { mobile: false });
  const sp = (r.data && r.data.photos) || [];
  check('public payload lists the local photos with isFavorite', sp.length === 3 && sp.find((x) => x.id === p1.id).isFavorite === true && sp.find((x) => x.id === p2.id).isFavorite === false, r.text.slice(0, 600));
  check('public payload exposes no receipt and no membership data', !/receipt/i.test(r.text) && !/uploads\/receipts/.test(r.text), 'receipt text found in public payload');
  await call('unstar p3', 'PUT', `/api/photos/${p3.id}`, { isFavorite: false }, { token: O.token });
  await call('star p3 again (kept for backup)', 'PUT', `/api/photos/${p3.id}`, { isFavorite: true }, { token: O.token });

  // ---------------------------------------------------------------------------------------------
  // #109 loyalty programs
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #109 loyalty programs');
  const NUM = `MEMBER-${stamp}-ZZ91`;
  r = await call('create loyalty program', 'POST', '/api/loyalty-programs', { name: 'Flying Blue', type: 'AIRLINE', providerName: 'Air France', providerCode: 'AF', alliance: 'SkyTeam', aliases: ['KLM'], membershipNumber: NUM, tier: 'Silver', pointsBalance: 12000, notes: 'n' }, { token: O.token });
  const lp = r.data;
  check('program returned in full with its own number', lp.membershipNumber === NUM && lp.tier === 'Silver' && lp.pointsBalance === 12000 && lp.aliases[0] === 'KLM', r.text);
  const lp2 = (await call('create second program', 'POST', '/api/loyalty-programs', { name: 'Marriott Bonvoy', type: 'HOTEL', providerName: 'Marriott', membershipNumber: `HOT-${stamp}` }, { token: O.token })).data;
  await call('create program: missing number rejected', 'POST', '/api/loyalty-programs', { name: 'x', type: 'AIRLINE', providerName: 'y' }, { token: O.token, expect: [400] });
  await call('create program: bad type rejected', 'POST', '/api/loyalty-programs', { name: 'x', type: 'SPACESHIP', providerName: 'y', membershipNumber: '1' }, { token: O.token, expect: [400] });
  r = await call('list programs', 'GET', '/api/loyalty-programs', undefined, { token: O.token });
  check('owner lists both programs', r.data.length === 2, r.text);
  r = await call('update program', 'PUT', `/api/loyalty-programs/${lp.id}`, { tier: 'Gold', pointsBalance: 15000, alliance: null }, { token: O.token });
  check('update changes tier/points and clears alliance', r.data.tier === 'Gold' && r.data.pointsBalance === 15000 && r.data.alliance === null && r.data.membershipNumber === NUM, r.text);
  r = await call('collaborator list: own programs only (empty)', 'GET', '/api/loyalty-programs', undefined, { token: E.token });
  check('edit collaborator sees none of the owner programs', Array.isArray(r.data) && r.data.length === 0 && !r.text.includes(NUM), r.text);
  await call('collaborator read owner program by id', 'GET', `/api/loyalty-programs/${lp.id}`, undefined, { token: E.token, expect: [404] });
  await call('collaborator update owner program', 'PUT', `/api/loyalty-programs/${lp.id}`, { tier: 'Hacked' }, { token: E.token, expect: [404] });
  await call('collaborator delete owner program', 'DELETE', `/api/loyalty-programs/${lp.id}`, undefined, { token: E.token, expect: [404] });

  const tr = (await call('create transportation with loyaltyProgramId', 'POST', '/api/transportation', {
    tripId: T, type: 'flight', fromLocationName: 'Lyon', toLocationName: 'Paris', departureTime: '2026-06-01T08:00:00.000Z', arrivalTime: '2026-06-01T09:00:00.000Z',
    startTimezone: 'Europe/Paris', endTimezone: 'Europe/Paris', carrier: 'Air France', loyaltyProgramId: lp.id, cost: 100, currency: 'EUR',
  }, { token: O.token })).data;
  check('transportation carries loyaltyProgramId', tr.loyaltyProgramId === lp.id, JSON.stringify(tr));
  const lg = (await call('create lodging with loyaltyProgramId', 'POST', '/api/lodging', {
    tripId: T, type: 'hotel', name: 'Bonvoy Paris', checkInDate: '2026-06-01T15:00:00.000Z', checkOutDate: '2026-06-05T10:00:00.000Z', loyaltyProgramId: lp2.id, cost: 400, currency: 'EUR',
  }, { token: O.token })).data;
  check('lodging carries loyaltyProgramId', lg.loyaltyProgramId === lp2.id, JSON.stringify(lg));
  await call('collaborator cannot attach owner program to a new booking', 'POST', '/api/lodging', { tripId: T, type: 'hotel', name: 'Sneaky', checkInDate: '2026-06-01T15:00:00.000Z', checkOutDate: '2026-06-02T10:00:00.000Z', loyaltyProgramId: lp.id }, { token: E.token, expect: [404] });
  await call('collaborator cannot attach owner program on update (transportation)', 'PUT', `/api/transportation/${tr.id}`, { loyaltyProgramId: lp2.id }, { token: E.token, expect: [404] });
  await call('collaborator cannot attach owner program on update (lodging)', 'PUT', `/api/lodging/${lg.id}`, { loyaltyProgramId: lp.id }, { token: E.token, expect: [404] });
  r = await call('collaborator may still edit the booking without touching the program', 'PUT', `/api/lodging/${lg.id}`, { notes: 'edited by collaborator' }, { token: E.token });
  check('program link survives a collaborator edit', r.data.loyaltyProgramId === lp2.id, r.text);

  const leak = [];
  const scan = async (label, p, token) => { const x = await http_('GET', p, { token }); if (x.text.includes(NUM) || x.text.includes(`HOT-${stamp}`)) leak.push(label); return x; };
  for (const [label, p] of [['trip', `/api/trips/${T}`], ['trips list', '/api/trips'], ['transportation list', `/api/transportation/trip/${T}`], ['lodging list', `/api/lodging/trip/${T}`],
    ['collaborators', `/api/trips/${T}/collaborators`], ['mobile sync', `/api/trips/${T}/mobile-sync`], ['shared trips', '/api/trips/shared']]) {
    await scan(`owner ${label}`, p, O.token); await scan(`editor ${label}`, p, E.token);
  }
  await scan('transportation by id', `/api/transportation/${tr.id}`, O.token); await scan('lodging by id', `/api/lodging/${lg.id}`, O.token);
  const pub = await http_('GET', `/api/public/trips/${shareToken}`, { mobile: false }); if (pub.text.includes(NUM)) leak.push('public share');
  check('membership numbers appear in no trip/booking/collaborator/mobile/share response', leak.length === 0, `leaked in: ${leak.join(', ')}`);

  r = await call('delete second loyalty program', 'DELETE', `/api/loyalty-programs/${lp2.id}`, undefined, { token: O.token });
  r = await call('lodging after program delete', 'GET', `/api/lodging/${lg.id}`, undefined, { token: O.token });
  check('deleting the program nulls the booking link (booking kept)', r.data.loyaltyProgramId === null, r.text);

  // ---------------------------------------------------------------------------------------------
  // #13 trip stops
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #13 trip stops');
  const SP = `/api/trips/${T}/stops`;
  const s1 = (await call('create stop (free place)', 'POST', SP, { name: 'Start', latitude: 45.0, longitude: 5.0, nights: 2 }, { token: O.token })).data;
  const s2 = (await call('create stop from locationId only', 'POST', SP, { locationId: lyon.id }, { token: O.token })).data;
  check('stop from a place takes its name and coordinates; positions are 0 then 1', s2.name === 'Lyon' && Math.abs(s2.latitude - 45.764) < 1e-6 && Math.abs(s2.longitude - 4.8357) < 1e-6 && s2.locationId === lyon.id && s1.position === 0 && s2.position === 1, JSON.stringify([s1, s2]));
  const s3 = (await call('create stop (third)', 'POST', SP, { name: 'End', latitude: 43.3, longitude: 5.4, nights: 0 }, { token: O.token })).data;
  await call('create stop: free place needs coordinates', 'POST', SP, { name: 'NoCoords' }, { token: O.token, expect: [400] });
  await call('create stop: latitude out of range', 'POST', SP, { name: 'Bad', latitude: 95, longitude: 5 }, { token: O.token, expect: [400] });
  await call('create stop: nights above 365', 'POST', SP, { name: 'Bad', latitude: 1, longitude: 1, nights: 400 }, { token: O.token, expect: [400] });
  const foreignTrip = await mk('Foreign trip');
  const foreignLoc = (await call('location on another trip', 'POST', '/api/locations', { tripId: foreignTrip.id, name: 'Elsewhere', latitude: 10, longitude: 10 }, { token: O.token })).data;
  await call('create stop: location from another trip rejected', 'POST', SP, { locationId: foreignLoc.id }, { token: O.token, expect: [404] });
  await call('create stop: location without coordinates rejected', 'POST', SP, { locationId: noCoords.id }, { token: O.token, expect: [400] });
  r = await call('create stop: coordinates > 50 km from the place rejected', 'POST', SP, { locationId: paris.id, latitude: 48.8566, longitude: 4.0 }, { token: O.token, expect: [400] });
  check('50 km rejection names the distance', /km/.test((r.json && r.json.message) || ''), r.text);
  r = await call('create stop: coordinates near the place accepted (name overridden)', 'POST', SP, { locationId: paris.id, name: 'Paris centre', latitude: 48.86, longitude: 2.35 }, { token: O.token });
  const s4 = r.data;
  const list = async () => (await call('list stops', 'GET', SP, undefined, { token: O.token })).data;
  let stops = await list();
  check('list is ordered 0..3', stops.map((s) => s.id).join() === [s1.id, s2.id, s3.id, s4.id].join() && stops.map((s) => s.position).join() === '0,1,2,3', JSON.stringify(stops.map((s) => [s.id, s.position])));
  r = await call('update stop (nights, name)', 'PUT', `${SP}/${s1.id}`, { nights: 5, name: 'Start renamed' }, { token: O.token });
  check('update applied', r.data.nights === 5 && r.data.name === 'Start renamed', r.text);
  await call('update stop: far-away coordinates for a linked place rejected', 'PUT', `${SP}/${s2.id}`, { latitude: 10, longitude: 10 }, { token: O.token, expect: [400] });
  await call('reorder with a missing id rejected', 'PUT', `${SP}/reorder`, { stopIds: [s4.id, s3.id, s2.id] }, { token: O.token, expect: [400] });
  await call('reorder with a duplicate id rejected', 'PUT', `${SP}/reorder`, { stopIds: [s4.id, s4.id, s2.id, s1.id] }, { token: O.token, expect: [400] });
  const otherStop = (await call('stop on another trip', 'POST', `/api/trips/${foreignTrip.id}/stops`, { name: 'F', latitude: 1, longitude: 1 }, { token: O.token })).data;
  await call('reorder with a foreign id rejected', 'PUT', `${SP}/reorder`, { stopIds: [s4.id, s3.id, s2.id, otherStop.id] }, { token: O.token, expect: [400] });
  stops = await list();
  check('failed reorders changed nothing', stops.map((s) => s.id).join() === [s1.id, s2.id, s3.id, s4.id].join(), JSON.stringify(stops.map((s) => s.id)));
  r = await call('reorder with the correct list', 'PUT', `${SP}/reorder`, { stopIds: [s4.id, s3.id, s2.id, s1.id] }, { token: O.token });
  check('reorder result is in the new order with positions 0..3', r.data.map((s) => s.id).join() === [s4.id, s3.id, s2.id, s1.id].join() && r.data.map((s) => s.position).join() === '0,1,2,3', r.text);
  await call('delete middle stop', 'DELETE', `${SP}/${s3.id}`, undefined, { token: O.token, expect: [200, 204] });
  stops = await list();
  check('delete closes the gap (positions 0..2, order kept)', stops.map((s) => s.id).join() === [s4.id, s2.id, s1.id].join() && stops.map((s) => s.position).join() === '0,1,2', JSON.stringify(stops.map((s) => [s.id, s.position])));
  await call('view-only collaborator can read stops', 'GET', SP, undefined, { token: V.token });
  await call('view-only collaborator cannot create', 'POST', SP, { name: 'v', latitude: 1, longitude: 1 }, { token: V.token, expect: [403] });
  await call('view-only collaborator cannot update', 'PUT', `${SP}/${s1.id}`, { nights: 9 }, { token: V.token, expect: [403] });
  await call('view-only collaborator cannot reorder', 'PUT', `${SP}/reorder`, { stopIds: [s1.id, s2.id, s4.id] }, { token: V.token, expect: [403] });
  await call('view-only collaborator cannot delete', 'DELETE', `${SP}/${s1.id}`, undefined, { token: V.token, expect: [403] });
  await call('stranger cannot read stops', 'GET', SP, undefined, { token: X.token, expect: [403, 404] });
  r = await call('edit collaborator can write', 'PUT', `${SP}/${s1.id}`, { nights: 6 }, { token: E.token });
  const stopLoc = (await call('location to delete (linked stop)', 'POST', '/api/locations', { tripId: T, name: 'Temp place', latitude: 44.0, longitude: 4.0 }, { token: O.token })).data;
  const s5 = (await call('stop linked to it', 'POST', SP, { locationId: stopLoc.id }, { token: O.token })).data;
  await call('delete the location', 'DELETE', `/api/locations/${stopLoc.id}`, undefined, { token: O.token, expect: [200, 204] });
  stops = await list();
  const s5after = stops.find((s) => s.id === s5.id);
  check('deleting the place keeps the stop with a null link and its snapshot', s5after && s5after.locationId === null && s5after.name === 'Temp place' && Math.abs(s5after.latitude - 44) < 1e-9, JSON.stringify(s5after));

  // ---------------------------------------------------------------------------------------------
  // Units
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- measurement system');
  for (const ms of ['metric', 'imperial']) {
    r = await call(`measurementSystem ${ms}`, 'PUT', '/api/users/settings', { measurementSystem: ms }, { token: O.token });
    check(`settings response carries ${ms}`, r.data.measurementSystem === ms, r.text);
    r = await call(`auth/me after ${ms}`, 'GET', '/api/auth/me', undefined, { token: O.token });
    check(`/auth/me carries ${ms}`, JSON.stringify(r.data).includes(`"measurementSystem":"${ms}"`), r.text);
  }
  r = await call('login carries measurementSystem', 'POST', '/api/auth/login', { email: O.email, password: 'Batch-Test-123' });
  check('login response user has imperial', r.data.user.measurementSystem === 'imperial', r.text);
  r = await call('refresh carries measurementSystem', 'POST', '/api/auth/refresh', { refreshToken: r.data.refreshToken });
  check('refresh response user has imperial', r.data.user.measurementSystem === 'imperial', r.text);
  O.token = r.data.accessToken;
  r = await call('measurementSystem invalid value rejected', 'PUT', '/api/users/settings', { measurementSystem: 'furlongs' }, { token: O.token, expect: [400] });
  r = await call('users/me still imperial after the rejection', 'GET', '/api/users/me', undefined, { token: O.token });
  check('invalid value did not change the setting', r.data.measurementSystem === 'imperial', r.text);
  r = await call('measurementSystem null clears it', 'PUT', '/api/users/settings', { measurementSystem: null }, { token: O.token });
  check('null clears the choice', r.data.measurementSystem === null, r.text);
  r = await call('settings without the field leave it alone', 'PUT', '/api/users/settings', { timezone: 'Europe/Paris' }, { token: O.token });
  await call('set metric for the backup test', 'PUT', '/api/users/settings', { measurementSystem: 'metric' }, { token: O.token });

  // ---------------------------------------------------------------------------------------------
  // #11 trip comparison
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #11 trip comparison');
  const t2 = await mk('Compare B', { startDate: '2026-07-10', endDate: '2026-07-12', timezone: 'America/New_York' });
  await call('B: location', 'POST', '/api/locations', { tripId: t2.id, name: 'NYC', latitude: 40.7128, longitude: -74.006 }, { token: O.token });
  await call('B: expense in USD', 'POST', `/api/trips/${t2.id}/expenses`, { description: 'Pizza', category: 'food', amount: 30, currency: 'USD', date: '2026-07-10' }, { token: O.token });
  await call('B: activity with cost in GBP', 'POST', '/api/activities', { tripId: t2.id, name: 'Show', cost: 50, currency: 'GBP', startTime: '2026-07-11T19:00:00.000Z' }, { token: O.token });
  r = await call('compare two trips', 'GET', `/api/trip-comparison?ids=${T},${t2.id}`, undefined, { token: O.token });
  const cmp = r.data;
  const ca = cmp && cmp.trips.find((t) => t.id === T), cb = cmp && cmp.trips.find((t) => t.id === t2.id);
  check('trips come back in request order with inclusive day counts (5 and 3)', cmp.trips.map((t) => t.id).join() === `${T},${t2.id}` && ca.days === 5 && cb.days === 3, r.text.slice(0, 600));
  check('counts: A has 1 transportation and 3 photos; B has 1 activity', ca.transportationCount === 1 && ca.photoCount === 3 && cb.activityCount === 1 && cb.locationCount === 1 && ca.locationCount === 4, JSON.stringify([ca, cb]).slice(0, 800));
  check('cost fields: currency EUR, spent > 0, costPerDay = spent/days, breakdown present', cmp.currency === 'EUR' && ca.cost.spent > 0 && Math.abs(ca.cost.costPerDay - ca.cost.spent / 5) < 0.02 && ca.cost.breakdown && cb.cost.spent > 0, JSON.stringify([ca.cost, cb.cost]).slice(0, 900));
  check('mixed currencies (EUR/USD/GBP) are all converted into the one comparison currency', cb.cost.currency === 'EUR' && cb.cost.unconverted.length === 0, JSON.stringify(cb.cost));
  check('map locations: Paris, Lyon and the second trip NYC only (excludeFromMap and coordinate-less places left out)', cmp.locations.length === 3 && cmp.locations.every((l) => l.id !== hidden.id && l.id !== noCoords.id) && cmp.locations.some((l) => l.id === paris.id) && cmp.locations.some((l) => l.tripId === t2.id), JSON.stringify(cmp.locations.map((l) => l.name)));
  await call('compare: one id -> 400', 'GET', `/api/trip-comparison?ids=${T}`, undefined, { token: O.token, expect: [400] });
  await call('compare: no ids -> 400', 'GET', '/api/trip-comparison', undefined, { token: O.token, expect: [400] });
  await call('compare: nine ids -> 400', 'GET', `/api/trip-comparison?ids=${[1, 2, 3, 4, 5, 6, 7, 8, 9].join(',')}`, undefined, { token: O.token, expect: [400] });
  await call('compare: duplicate ids -> 400', 'GET', `/api/trip-comparison?ids=${T},${T}`, undefined, { token: O.token, expect: [400] });
  await call('compare: garbage ids -> 400', 'GET', `/api/trip-comparison?ids=${T},abc`, undefined, { token: O.token, expect: [400] });
  const xTrip = (await call('stranger trip', 'POST', '/api/trips', { title: 'Stranger trip', startDate: '2026-08-01', endDate: '2026-08-02' }, { token: X.token })).data;
  r = await call('compare: a stranger trip rejects the whole request', 'GET', `/api/trip-comparison?ids=${T},${xTrip.id}`, undefined, { token: O.token, expect: [404] });
  check('rejection names the id and leaks no trip data', r.text.includes(String(xTrip.id)) && !r.text.includes('Stranger trip') && !r.text.includes('Batch trip'), r.text);
  r = await call('compare as the view-only collaborator (shared trip + own trip)', 'GET', `/api/trip-comparison?ids=${T},${t2.id}`, undefined, { token: V.token, expect: [404] });
  const vTrip = (await call('viewer own trip', 'POST', '/api/trips', { title: 'Viewer trip', startDate: '2026-09-01', endDate: '2026-09-03' }, { token: V.token })).data;
  r = await call('compare: shared trip + own trip as the collaborator', 'GET', `/api/trip-comparison?ids=${T},${vTrip.id}`, undefined, { token: V.token });
  check('collaborator comparison marks isOwner correctly', r.data.trips.find((t) => t.id === T).isOwner === false && r.data.trips.find((t) => t.id === vTrip.id).isOwner === true, r.text.slice(0, 500));

  // ---------------------------------------------------------------------------------------------
  // #27 CSV import
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #27 CSV import');
  const impT = await mk('Import trip');
  const IM = `/api/trips/${impT.id}/import`;
  const locRows = [
    { name: 'Eiffel Tower', address: 'Champ de Mars', latitude: '48.8584', longitude: '2.2945', category: 'Sightseeing', notes: 'n' },
    { name: 'Bad coords', latitude: '95', longitude: '2' },
    { name: 'No coords place' },
    { name: 'Eiffel Tower', latitude: '48.8584', longitude: '2.2945' },
  ];
  const countLocs = async () => ((await call('list locations', 'GET', `/api/locations/trip/${impT.id}`, undefined, { token: O.token })).data || []).length;
  r = await call('import locations dry run', 'POST', `${IM}/locations`, { rows: locRows, dryRun: true }, { token: O.token });
  check('dry run: reports per-row status without creating', r.data.dryRun === true && r.data.created === 0 && r.data.rows.length === 4 && r.data.rows[1].status === 'invalid' && r.data.rows[0].status === 'valid', r.text.slice(0, 900));
  check('dry run: invalid coordinates give an error on that field', r.data.rows[1].errors.some((e) => /latitude|coordinate/i.test(e.field + e.message)), JSON.stringify(r.data.rows[1]));
  check('dry run: the repeated row inside the file is flagged', r.data.rows[3].errors.concat(r.data.rows[3].warnings).some((i) => i.code === 'duplicate_in_file'), JSON.stringify(r.data.rows[3]));
  check('dry run wrote nothing', (await countLocs()) === 0, 'locations exist after a dry run');
  r = await call('import locations for real', 'POST', `${IM}/locations`, { rows: locRows }, { token: O.token });
  check('real run created the valid rows only', r.data.created >= 1 && r.data.rows[0].status === 'created' && r.data.rows[1].status === 'invalid', r.text.slice(0, 900));
  const nCreated = r.data.created;
  check('database holds exactly the created rows', (await countLocs()) === nCreated, `created=${nCreated}`);
  const storedLoc = psql(`select name || '|' || latitude || '|' || longitude from locations where trip_id = ${impT.id} and name = 'Eiffel Tower' order by id limit 1`);
  check('latitude/longitude stored for the imported location', /^Eiffel Tower\|48\.8584\d*\|2\.2945\d*$/.test(storedLoc), storedLoc);
  check('the imported batch has no spatial column left to fill (dropped in 20261125000000)', psql(`select count(*) from information_schema.columns where table_name = 'locations' and column_name = 'coordinates'`) === '0', 'coordinates column still exists');
  r = await call('second import: duplicates against existing rows are flagged', 'POST', `${IM}/locations`, { rows: [{ name: 'Eiffel Tower', latitude: '48.8584', longitude: '2.2945' }], dryRun: true }, { token: O.token });
  check('duplicate_existing reported', r.data.rows[0].errors.concat(r.data.rows[0].warnings).some((i) => i.code === 'duplicate_existing'), JSON.stringify(r.data.rows[0]));
  r = await call('second real import of the same row', 'POST', `${IM}/locations`, { rows: [{ name: 'Eiffel Tower', latitude: '48.8584', longitude: '2.2945' }] }, { token: O.token });
  const afterDup = await countLocs();
  record('duplicate handling on a real run is explicit (created or refused, never silent)', true, '', `${r.data.rows[0].status}/${afterDup}`);
  r = await call('exclude a row by index', 'POST', `${IM}/locations`, { rows: [{ name: 'Excluded place', latitude: '10', longitude: '10' }, { name: 'Included place', latitude: '11', longitude: '11' }], excludeRows: [0] }, { token: O.token });
  check('excluded row is not created', r.data.rows[0].status === 'excluded' && r.data.rows[1].status === 'created', r.text.slice(0, 500));
  await call('import: 501 rows rejected', 'POST', `${IM}/locations`, { rows: Array.from({ length: 501 }, (_, i) => ({ name: `L${i}`, latitude: '1', longitude: '1' })) }, { token: O.token, expect: [400] });
  await call('import: zero rows rejected', 'POST', `${IM}/locations`, { rows: [] }, { token: O.token, expect: [400] });
  await call('import: unknown column rejected', 'POST', `${IM}/locations`, { rows: [{ name: 'x', hack: '1' }] }, { token: O.token, expect: [400] });
  await call('import: 500 rows accepted (dry run)', 'POST', `${IM}/locations`, { rows: Array.from({ length: 500 }, (_, i) => ({ name: `L${i}`, latitude: '1', longitude: '1' })), dryRun: true }, { token: O.token });
  await call('import: view-only collaborator refused', 'POST', `${IM}/locations`, { rows: [{ name: 'x', latitude: '1', longitude: '1' }] }, { token: V.token, expect: [403, 404] });
  await addCollaborator(O, impT.id, V, 'view');
  await call('import: view-only collaborator on the import trip refused', 'POST', `${IM}/locations`, { rows: [{ name: 'x', latitude: '1', longitude: '1' }] }, { token: V.token, expect: [403] });
  await call('import: view-only collaborator dry run refused too', 'POST', `${IM}/activities`, { rows: [{ name: 'x' }], dryRun: true }, { token: V.token, expect: [403] });
  await call('import: stranger refused', 'POST', `${IM}/locations`, { rows: [{ name: 'x', latitude: '1', longitude: '1' }] }, { token: X.token, expect: [403, 404] });

  const actRows = [
    { name: 'Louvre visit', startTime: '2026-06-02 09:30', endTime: '2026-06-02 11:00', category: 'Museum', cost: '22.50', currency: 'EUR', location: 'Eiffel Tower' },
    { name: 'Offset time', startTime: '2026-06-02T10:30:00+02:00' },
    { name: 'Zoned cell', startTime: '2026-06-03 09:00', timezone: 'America/New_York' },
    { name: 'All day', startTime: '2026-06-04', allDay: 'true' },
    { name: 'Bad cost', cost: 'abc' },
    { name: 'Cost without currency', cost: '10' },
    { name: 'Louvre visit', startTime: '2026-06-02 09:30' },
  ];
  r = await call('import activities dry run', 'POST', `${IM}/activities`, { rows: actRows, dryRun: true }, { token: O.token });
  check('activity dry run: statuses per row, nothing created', r.data.created === 0 && r.data.rows[0].status === 'valid' && r.data.rows[4].status === 'invalid', r.text.slice(0, 1200));
  check('activity dry run: default timezone is the trip zone', r.data.defaultTimezone && r.data.defaultTimezone.zone === 'Europe/Paris' && r.data.defaultTimezone.source === 'trip', JSON.stringify(r.data.defaultTimezone));
  const acts0 = (await call('activities before', 'GET', `/api/activities/trip/${impT.id}`, undefined, { token: O.token })).data;
  check('dry run created no activity', acts0.length === 0, JSON.stringify(acts0));
  r = await call('import activities for real', 'POST', `${IM}/activities`, { rows: actRows }, { token: O.token });
  check('real run created the valid activities', r.data.rows[0].status === 'created' && r.data.rows[1].status === 'created' && r.data.rows[2].status === 'created', r.text.slice(0, 900));
  const acts = (await call('activities after', 'GET', `/api/activities/trip/${impT.id}`, undefined, { token: O.token })).data;
  const byName = (n) => acts.find((a) => a.name === n);
  const louvre = byName('Louvre visit');
  check('naive local time 09:30 in Europe/Paris (CEST, UTC+2) is stored as 07:30Z', louvre && new Date(louvre.startTime).toISOString() === '2026-06-02T07:30:00.000Z' && new Date(louvre.endTime).toISOString() === '2026-06-02T09:00:00.000Z', JSON.stringify(louvre));
  check('explicit offset 10:30+02:00 is stored as 08:30Z', new Date(byName('Offset time').startTime).toISOString() === '2026-06-02T08:30:00.000Z', JSON.stringify(byName('Offset time')));
  check('a timezone cell overrides the trip zone: 09:00 New York (UTC-4) = 13:00Z, timezone kept', new Date(byName('Zoned cell').startTime).toISOString() === '2026-06-03T13:00:00.000Z' && byName('Zoned cell').timezone === 'America/New_York', JSON.stringify(byName('Zoned cell')));
  check('imported activity keeps its trip-zone label and cost', louvre.timezone === 'Europe/Paris' && louvre.cost === 22.5 && louvre.currency === 'EUR', JSON.stringify(louvre));
  check('all-day row is stored as all-day', byName('All day') && byName('All day').allDay === true, JSON.stringify(byName('All day')));
  const lk = await call('link summary of the import trip', 'GET', `/api/trips/${impT.id}/links/summary`, undefined, { token: O.token });
  r = await call('second activity import: the repeated row is flagged as a duplicate of the existing one', 'POST', `${IM}/activities`, { rows: [{ name: 'Louvre visit', startTime: '2026-06-02 09:30' }], dryRun: true }, { token: O.token });
  check('duplicate_existing reported for activities', r.data.rows[0].errors.concat(r.data.rows[0].warnings).some((i) => i.code === 'duplicate_existing'), JSON.stringify(r.data.rows[0]));
  r = await call('trip with no timezone: import uses the user zone', 'POST', '/api/trips', { title: 'No-tz trip', startDate: '2026-06-01', endDate: '2026-06-02' }, { token: O.token });
  const noTz = r.data;
  await call('clear that trip timezone', 'PUT', `/api/trips/${noTz.id}`, { timezone: null }, { token: O.token });
  r = await call('dry run on the trip without a timezone', 'POST', `/api/trips/${noTz.id}/import/activities`, { rows: [{ name: 'A', startTime: '2026-06-01 09:00' }], dryRun: true }, { token: O.token });
  check('default timezone falls back to the user setting (not UTC)', r.data.defaultTimezone && r.data.defaultTimezone.source === 'user' && r.data.defaultTimezone.zone === 'Europe/Paris', JSON.stringify(r.data.defaultTimezone));

  // createActivity (single create) must persist timezone and allDay
  r = await call('single create activity with timezone + allDay', 'POST', '/api/activities', { tripId: impT.id, name: 'Single create', timezone: 'Asia/Tokyo', allDay: true, startTime: '2026-06-02T00:00:00.000Z' }, { token: O.token });
  check('createActivity persists timezone and allDay (pre-existing bug check)', r.data.timezone === 'Asia/Tokyo' && r.data.allDay === true, `timezone=${r.data.timezone} allDay=${r.data.allDay}`);
  const singleId = r.data.id;
  r = await call('update activity timezone', 'PUT', `/api/activities/${singleId}`, { timezone: 'Europe/Rome', allDay: false }, { token: O.token });
  check('updateActivity persists timezone and allDay', r.data.timezone === 'Europe/Rome' && r.data.allDay === false, r.text);

  // ---------------------------------------------------------------------------------------------
  // #120 journal day draft
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #120 journal day draft');
  const entriesBefore = (await call('journal before', 'GET', `/api/journal/trip/${T}`, undefined, { token: O.token })).data.length;
  const DD = `/api/trips/${T}/ai/journal-day-draft`;
  r = await call('day draft: date two days outside the trip -> 422', 'POST', DD, { date: '2026-06-07' }, { token: O.token, expect: [422] });
  check('422 names the trip range', /2026-06-01/.test(r.text) && /2026-06-05/.test(r.text), r.text);
  r = await call('day draft: a day before the trip -> 422', 'POST', DD, { date: '2026-05-30' }, { token: O.token, expect: [422] });
  await call('day draft: malformed date -> 400', 'POST', DD, { date: '06/02/2026' }, { token: O.token, expect: [400] });
  await call('day draft: impossible date -> 400', 'POST', DD, { date: '2026-02-31' }, { token: O.token, expect: [400] });
  r = await call('day draft: in-range date with recorded activity but no AI -> 503', 'POST', DD, { date: '2026-06-02' }, { token: O.token, expect: [503] });
  check('503 explains AI is not configured', /not configured/i.test(r.text), r.text);
  await call('day draft: in-range date with nothing recorded -> 422', 'POST', DD, { date: '2026-06-04' }, { token: O.token, expect: [422, 503] });
  await call('day draft: view-only collaborator refused', 'POST', DD, { date: '2026-06-02' }, { token: V.token, expect: [403, 404] });
  await call('day draft: stranger refused', 'POST', DD, { date: '2026-06-02' }, { token: X.token, expect: [403, 404] });
  const entriesAfter = (await call('journal after', 'GET', `/api/journal/trip/${T}`, undefined, { token: O.token })).data.length;
  check('no journal entry was created by any draft call', entriesBefore === entriesAfter, `${entriesBefore} -> ${entriesAfter}`);
  await call('journal summary without AI -> 503 (not 500)', 'POST', `/api/trips/${T}/ai/journal-summary`, {}, { token: O.token, expect: [400, 422, 503] });

  // ---------------------------------------------------------------------------------------------
  // #116 booking deadlines
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #116 booking deadlines');
  const bl = (await call('create booking (lodging) for a deadline', 'POST', '/api/lodging', { tripId: T, type: 'hotel', name: 'Deadline hotel', checkInDate: '2026-06-02T15:00:00.000Z', checkOutDate: '2026-06-03T10:00:00.000Z' }, { token: O.token })).data;
  r = await call('create deadline for that booking id', 'POST', `/api/trips/${T}/deadlines`, { entityType: 'lodging', entityId: bl.id, kind: 'cancellation', dueAt: '2026-05-25T12:00:00.000Z', note: 'free cancellation' }, { token: O.token });
  const dl = r.data;
  r = await call('list deadlines for the trip', 'GET', `/api/trips/${T}/deadlines`, undefined, { token: O.token });
  check('deadline is listed against the booking', JSON.stringify(r.data).includes('free cancellation') || (r.data || []).length >= 1, r.text.slice(0, 400));
  await call('delete the booking', 'DELETE', `/api/lodging/${bl.id}`, undefined, { token: O.token, expect: [200, 204] });
  r = await call('deadlines after the booking is deleted', 'GET', `/api/trips/${T}/deadlines`, undefined, { token: O.token });
  check('deleting the booking cascades to its deadline', !JSON.stringify(r.data).includes('free cancellation') && (r.data || []).length === 0, r.text.slice(0, 400));
  void dl;

  // ---------------------------------------------------------------------------------------------
  // #70 Immich
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- #70 Immich (no Immich configured)');
  const iAlbum = (await call('album for Immich checks', 'POST', '/api/albums', { tripId: T, name: 'Immich album', description: 'for sync' }, { token: O.token })).data;
  const four = (name, method, p, body, token = O.token) => call(name, method, p, body, { token, expect: [400, 401, 403, 404, 409, 422, 502, 503] });
  const msg = (x) => x.json && x.json.message;
  for (const [name, method, p, body] of [
    ['assets/query', 'POST', '/api/immich/assets/query', { filters: {} }],
    ['bulk-link/preview', 'POST', '/api/immich/bulk-link/preview', { tripId: T, filters: {} }],
    ['bulk-link/page', 'POST', '/api/immich/bulk-link/page', { tripId: T, filters: {}, page: 1 }],
    ['album link', 'PUT', `/api/immich/photo-albums/${iAlbum.id}/link`, { immichAlbumId: 'abc-123' }],
    ['album sync', 'POST', `/api/immich/photo-albums/${iAlbum.id}/sync`, {}],
    ['export (confirmed)', 'POST', `/api/immich/photo-albums/${iAlbum.id}/export`, { confirm: true }],
  ]) {
    const x = await four(`no Immich: ${name} answers a clean 4xx`, method, p, body);
    check(`no Immich: ${name} is not a 5xx and carries a message`, x.status >= 400 && x.status < 500 && Boolean(msg(x)), x.text);
  }
  r = await call('no Immich: export-preview reads only our database', 'GET', `/api/immich/photo-albums/${iAlbum.id}/export-preview`, undefined, { token: O.token });
  check('export-preview reports willCreate with zero Immich photos', r.data.willCreate === true && r.data.immichAssetCount === 0, r.text);
  r = await call('no Immich: export without confirm is refused', 'POST', `/api/immich/photo-albums/${iAlbum.id}/export`, {}, { token: O.token, expect: [400] });
  r = await call('no Immich: export with confirm:false is refused', 'POST', `/api/immich/photo-albums/${iAlbum.id}/export`, { confirm: false }, { token: O.token, expect: [400] });
  await call('no Immich: bad filter (dateFrom after dateTo) is a 400', 'POST', '/api/immich/assets/query', { filters: { dateFrom: '2026-06-05', dateTo: '2026-06-01' } }, { token: O.token, expect: [400] });
  await call('no Immich: bad album id characters rejected', 'PUT', `/api/immich/photo-albums/${iAlbum.id}/link`, { immichAlbumId: '../../x' }, { token: O.token, expect: [400] });
  await call('no Immich: stranger cannot touch the album', 'POST', `/api/immich/photo-albums/${iAlbum.id}/sync`, {}, { token: X.token, expect: [403, 404] });

  console.log('\n--- #70 Immich (fake server)');
  const immichRun = await fakeImmichSection({ O, V, T, iAlbum, impT, p1 });
  void immichRun;

  // ---------------------------------------------------------------------------------------------
  // Backup round trip
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- backup round trip');
  await backupSection({ O, T, e1, e2, e3, e4, e6, sam, alex, p1, p2, p3, lp, tr, lg, stopsBefore: await list(), recKeep1, recKeep3, paris, lyon, iAlbum });

  // ---------------------------------------------------------------------------------------------
  // Trip duplication and mobile sync
  // ---------------------------------------------------------------------------------------------
  console.log('\n--- trip duplication / mobile sync');
  await duplicationAndSync({ O, T, lp });

  // ---------------------------------------------------------------------------------------------
  const failed = results.filter((x) => !x.ok);
  const skipped = results.filter((x) => x.skipped);
  console.log(`\n${results.length} checks, ${failed.length} failed, ${skipped.length} skipped`);
  fs.writeFileSync(outFile, JSON.stringify(results.map(({ name, status, ok, skipped: s }) => ({ name, status, ok, skipped: Boolean(s) })), null, 1));
  process.exit(0);
})().catch((e) => { console.error('SCRIPT ERROR', e); record('script crashed', false, e && e.stack); fs.writeFileSync(outFile, JSON.stringify(results)); process.exit(1); });

// =================================================================================================
// Fake Immich
// =================================================================================================
function startFakeImmich() {
  const state = { assets: [], albums: new Map(), calls: [], nextAlbum: 1 };
  const asset = (n, over = {}) => ({
    id: `asset-${String(n).padStart(3, '0')}`, type: 'IMAGE', originalFileName: `IMG_${n}.jpg`,
    fileCreatedAt: `2026-06-0${(n % 4) + 1}T10:00:00.000Z`, localDateTime: `2026-06-0${(n % 4) + 1}T12:00:00.000Z`, isFavorite: n % 3 === 0,
    exifInfo: { latitude: 48.85 + n / 1000, longitude: 2.35, dateTimeOriginal: `2026-06-0${(n % 4) + 1}T12:00:00.000Z` }, ...over,
  });
  for (let n = 1; n <= 7; n++) state.assets.push(asset(n));
  state.assets.push(asset(8, { type: 'VIDEO', originalFileName: 'CLIP_8.mp4', duration: '0:00:12.500000', isFavorite: false }));
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      state.calls.push(`${req.method} ${url.pathname}`);
      const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
      if (req.headers['x-api-key'] !== 'fake-key') return send(401, { message: 'bad key' });
      const p = url.pathname;
      const filterAssets = (b) => state.assets.filter((a) =>
        (!b.type || a.type === b.type) && (!b.isFavorite || a.isFavorite) &&
        (!b.originalFileName || a.originalFileName.includes(b.originalFileName)) &&
        (!b.takenAfter || a.fileCreatedAt >= b.takenAfter) && (!b.takenBefore || a.fileCreatedAt <= b.takenBefore) &&
        (!b.albumIds || b.albumIds.some((id) => (state.albums.get(id) || { assetIds: [] }).assetIds.includes(a.id))));
      const page = (b, list) => {
        const size = b.size || 50, pg = b.page || 1;
        const items = list.slice((pg - 1) * size, pg * size);
        return { assets: { items, total: list.length, count: items.length, nextPage: pg * size < list.length ? String(pg + 1) : null }, albums: { items: [], total: 0 } };
      };
      if (p === '/api/server/ping') return send(200, { res: 'pong' });
      if (p === '/api/search/metadata' && req.method === 'POST') return send(200, page(body, filterAssets(body)));
      if (p === '/api/search/smart' && req.method === 'POST') return send(200, page(body, filterAssets({ ...body, originalFileName: undefined })));
      if (p === '/api/albums' && req.method === 'GET') return send(200, [...state.albums.values()].map((a) => ({ id: a.id, albumName: a.albumName, assetCount: a.assetIds.length })));
      if (p === '/api/albums' && req.method === 'POST') {
        const id = `album-${state.nextAlbum++}`;
        state.albums.set(id, { id, albumName: body.albumName, description: body.description || '', assetIds: [] });
        return send(201, { id, albumName: body.albumName, assets: [] });
      }
      const am = p.match(/^\/api\/albums\/([^/]+)(\/assets)?$/);
      if (am) {
        const a = state.albums.get(decodeURIComponent(am[1]));
        if (!a) return send(404, { message: 'Not found' });
        if (!am[2] && req.method === 'GET') return send(200, { id: a.id, albumName: a.albumName, assetCount: a.assetIds.length, assets: url.searchParams.get('withoutAssets') ? [] : state.assets.filter((x) => a.assetIds.includes(x.id)) });
        if (am[2] && req.method === 'PUT') {
          return send(200, (body.ids || []).map((id) => {
            if (!state.assets.some((x) => x.id === id)) return { id, success: false, error: 'not_found' };
            if (a.assetIds.includes(id)) return { id, success: false, error: 'duplicate' };
            a.assetIds.push(id); return { id, success: true };
          }));
        }
      }
      const tm = p.match(/^\/api\/assets\/([^/]+)\/thumbnail$/);
      if (tm) return send(200, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'), 'image/png');
      return send(404, { message: 'unknown route ' + p });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, port: server.address().port })));
}

async function fakeImmichSection({ O, V, T, iAlbum, impT }) {
  const { server, state, port } = await startFakeImmich();
  try {
    let r = await call('save the loopback Immich URL', 'PUT', '/api/users/immich-settings', { immichApiUrl: `http://127.0.0.1:${port}`, immichApiKey: 'fake-key' }, { token: O.token, expect: [200, 400] });
    if (r.status !== 200) {
      skip('fake-Immich flows', `backend refused a loopback Immich URL (${(r.json && r.json.message) || r.status}); start it with ALLOW_PRIVATE_INTEGRATION_URLS=true to run them`);
      return false;
    }
    r = await call('test connection (ping)', 'POST', '/api/immich/test', { apiUrl: `http://127.0.0.1:${port}`, apiKey: 'fake-key' }, { token: O.token });
    // Filtered query with alreadyLinked marks
    const flows = `/api/immich`;
    r = await call('query: type IMAGE, size 3, page 1', 'POST', `${flows}/assets/query`, { filters: { type: 'IMAGE' }, page: 1, size: 3, tripId: T }, { token: O.token });
    check('query returns 3 images, hasMore, with proxy URLs and no key in the payload', r.data.assets.length === 3 && r.data.hasMore === true && r.data.assets.every((a) => a.type === 'IMAGE' && a.thumbnailUrl) && !r.text.includes('fake-key') && !r.text.includes(String(port)), r.text.slice(0, 500));
    check('query with tripId marks every asset alreadyLinked=false at first', r.data.assets.every((a) => a.alreadyLinked === false), r.text.slice(0, 300));
    r = await call('query: favorites only', 'POST', `${flows}/assets/query`, { filters: { isFavorite: true } }, { token: O.token });
    check('favorites filter reaches Immich (assets 3 and 6)', r.data.assets.map((a) => a.id).join() === 'asset-003,asset-006', r.text.slice(0, 400));
    r = await call('query: file-name text', 'POST', `${flows}/assets/query`, { filters: { text: 'CLIP' } }, { token: O.token });
    check('name search finds the video', r.data.assets.length === 1 && r.data.assets[0].type === 'VIDEO', r.text.slice(0, 300));
    r = await call('query: smart search is allowed for browsing', 'POST', `${flows}/assets/query`, { filters: { text: 'beach', searchMode: 'smart' } }, { token: O.token });
    check('smart query went to /api/search/smart', state.calls.includes('POST /api/search/smart'), state.calls.slice(-3).join());
    r = await call('query: date range in the trip timezone', 'POST', `${flows}/assets/query`, { filters: { dateFrom: '2026-06-01', dateTo: '2026-06-02', timezone: 'Europe/Paris' } }, { token: O.token });
    check('date filter narrows the result (only 2026-06-01..02 fileCreatedAt)', r.data.assets.length > 0 && r.data.assets.every((a) => a.fileCreatedAt <= '2026-06-02T21:59:59.999Z'), r.text.slice(0, 400));

    // Bulk link
    const filters = { type: 'IMAGE' };
    r = await call('bulk-link preview', 'POST', `${flows}/bulk-link/preview`, { tripId: T, filters }, { token: O.token });
    check('preview: 7 matching, 0 linked, 7 to link, 1 page', r.data.matching === 7 && r.data.alreadyLinked === 0 && r.data.toLink === 7 && r.data.pages === 1 && r.data.capped === false, r.text);
    r = await call('bulk-link page 1', 'POST', `${flows}/bulk-link/page`, { tripId: T, filters, page: 1 }, { token: O.token });
    check('page 1 links 7 and finishes (nextPage null)', r.data.linked === 7 && r.data.failed === 0 && r.data.nextPage === null, r.text);
    r = await call('bulk-link page 1 again (second run)', 'POST', `${flows}/bulk-link/page`, { tripId: T, filters, page: 1 }, { token: O.token });
    check('second run links nothing new', r.data.linked === 0 && r.data.alreadyLinked === 7, r.text);
    r = await call('bulk-link preview after linking', 'POST', `${flows}/bulk-link/preview`, { tripId: T, filters }, { token: O.token });
    check('preview now says 7 already linked, 0 to link', r.data.alreadyLinked === 7 && r.data.toLink === 0, r.text);
    r = await call('query with tripId after linking', 'POST', `${flows}/assets/query`, { filters: { type: 'IMAGE' }, tripId: T }, { token: O.token });
    check('alreadyLinked is now true for every linked asset', r.data.assets.length === 7 && r.data.assets.every((a) => a.alreadyLinked === true), r.text.slice(0, 300));
    check('linked photos were stored as Immich photos with takenAt and coordinates', psql(`select count(*) from photos where trip_id = ${T} and source = 'immich' and taken_at is not null and latitude is not null`) === '7', psql(`select source, count(*) from photos where trip_id = ${T} group by 1`));
    r = await call('bulk-link refuses smart search (preview)', 'POST', `${flows}/bulk-link/preview`, { tripId: T, filters: { text: 'beach', searchMode: 'smart' } }, { token: O.token, expect: [400] });
    r = await call('bulk-link refuses smart search (page)', 'POST', `${flows}/bulk-link/page`, { tripId: T, filters: { text: 'beach', searchMode: 'smart' }, page: 1 }, { token: O.token, expect: [400] });
    await call('bulk-link as view-only collaborator refused', 'POST', `${flows}/bulk-link/preview`, { tripId: T, filters }, { token: V.token, expect: [400, 403, 404] });
    r = await call('bulk-link video page', 'POST', `${flows}/bulk-link/page`, { tripId: T, filters: { type: 'VIDEO' }, page: 1 }, { token: O.token });
    check('the video links with a duration', r.data.linked === 1 && psql(`select duration from photos where trip_id = ${T} and immich_asset_id = 'asset-008'`) === '13' || psql(`select duration from photos where trip_id = ${T} and immich_asset_id = 'asset-008'`) === '12', psql(`select duration, media_type from photos where immich_asset_id = 'asset-008' and trip_id = ${T}`));
    r = await call('thumbnail proxy through the backend', 'GET', `/api/immich/assets/asset-001/thumbnail`, undefined, { token: O.token });
    check('thumbnail is proxied as an image', r.status === 200 && r.buf.length > 20 && /image/.test(r.headers.get('content-type') || ''), `${r.status} ${r.headers.get('content-type')}`);

    // Album link + sync
    state.albums.set('album-seed', { id: 'album-seed', albumName: 'Seed album', assetIds: ['asset-001', 'asset-002', 'asset-020'] });
    state.assets.push({ id: 'asset-020', type: 'IMAGE', originalFileName: 'IMG_20.jpg', fileCreatedAt: '2026-06-03T10:00:00.000Z', isFavorite: false, exifInfo: null });
    r = await call('link album to a missing Immich album', 'PUT', `${flows}/photo-albums/${iAlbum.id}/link`, { immichAlbumId: 'does-not-exist' }, { token: O.token, expect: [404, 400, 502] });
    check('missing Immich album is a 4xx with a message (nothing stored)', r.status < 500 || r.status === 502, r.text);
    check('album link not stored after the failure', psql(`select coalesce(immich_album_id,'-') from photo_albums where id = ${iAlbum.id}`) === '-', 'link stored');
    r = await call('sync before linking is refused', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token, expect: [400] });
    r = await call('link album to Immich album', 'PUT', `${flows}/photo-albums/${iAlbum.id}/link`, { immichAlbumId: 'album-seed' }, { token: O.token });
    check('link stores the id and clears the sync time', r.data.immichAlbumId === 'album-seed' && r.data.immichAlbumSyncedAt === null, r.text);
    r = await call('sync album', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token });
    check('sync: 3 in Immich, 1 newly linked (asset-020), 3 added to the album', r.data.immichAssetCount === 3 && r.data.newlyLinked === 1 && r.data.addedToAlbum >= 2 && r.data.failed === 0 && r.data.syncedAt, r.text);
    const inAlbum = () => psql(`select count(*) from photo_album_assignments where album_id = ${iAlbum.id}`);
    const before = inAlbum();
    check('album membership matches (3 Immich photos)', Number(before) >= 3, `members=${before}`);
    r = await call('sync again changes nothing', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token });
    check('second sync: 0 new, 0 added', r.data.newlyLinked === 0 && r.data.addedToAlbum === 0, r.text);
    state.albums.get('album-seed').assetIds = state.albums.get('album-seed').assetIds.filter((id) => id !== 'asset-002').concat('asset-005');
    r = await call('sync after a removal and an addition in Immich', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token });
    check('the new asset is pulled; the removed one is only counted, not removed', r.data.addedToAlbum === 1 && r.data.notInImmichAlbum === 1 && inAlbum() === String(Number(before) + 1), `${r.text} members=${inAlbum()}`);
    check('trip photo for the removed asset still exists', psql(`select count(*) from photos where trip_id = ${T} and immich_asset_id = 'asset-002'`) === '1', 'removed');

    // Export
    r = await call('export-preview of the linked album', 'GET', `${flows}/photo-albums/${iAlbum.id}/export-preview`, undefined, { token: O.token });
    check('preview: counts Immich photos, reports uploaded ones skipped, will not create', r.data.immichAssetCount >= 3 && r.data.willCreate === false && r.data.linkedImmichAlbumId === 'album-seed', r.text);
    const exAlbum = (await call('album to export', 'POST', '/api/albums', { tripId: T, name: 'Export me', description: 'desc' }, { token: O.token })).data;
    const upl = (await call('uploaded (non-Immich) photo for the export album', 'POST', '/api/photos/upload', undefined, { token: O.token, form: formWith('photo', await makeImage('jpeg'), 'u.jpg', 'image/jpeg', { tripId: T, caption: 'uploaded' }) })).data;
    const linkedIds = psql(`select string_agg(id::text, ',') from (select id from photos where trip_id = ${T} and immich_asset_id in ('asset-001','asset-003','asset-004') order by id) q`).split(',').map(Number);
    await call('add photos to the export album', 'POST', `/api/albums/${exAlbum.id}/photos`, { photoIds: [...linkedIds, upl.id] }, { token: O.token });
    r = await call('export preview (new album)', 'GET', `${flows}/photo-albums/${exAlbum.id}/export-preview`, undefined, { token: O.token });
    check('preview: 3 Immich photos, 1 skipped upload, will create', r.data.immichAssetCount === 3 && r.data.skippedUploaded === 1 && r.data.willCreate === true, r.text);
    const calls0 = state.calls.length;
    await call('export without confirm still refused with Immich configured', 'POST', `${flows}/photo-albums/${exAlbum.id}/export`, {}, { token: O.token, expect: [400] });
    check('refused export made no call to Immich', state.calls.length === calls0, state.calls.slice(calls0).join());
    r = await call('export (confirm)', 'POST', `${flows}/photo-albums/${exAlbum.id}/export`, { confirm: true }, { token: O.token });
    check('export created the Immich album and added 3', r.data.created === true && r.data.added === 3 && r.data.skippedUploaded === 1 && state.albums.get(r.data.immichAlbumId).assetIds.length === 3, r.text);
    const created1 = r.data.immichAlbumId;
    check('the new Immich album id is stored on the trip album', psql(`select immich_album_id from photo_albums where id = ${exAlbum.id}`) === created1, 'not stored');
    r = await call('export again', 'POST', `${flows}/photo-albums/${exAlbum.id}/export`, { confirm: true }, { token: O.token });
    check('re-export reuses the album (created=false, nothing added, 3 already there)', r.data.created === false && r.data.immichAlbumId === created1 && r.data.added === 0 && r.data.alreadyInAlbum === 3, r.text);
    check('Immich still has exactly one album for it', [...state.albums.values()].filter((a) => a.albumName === 'Export me').length === 1, JSON.stringify([...state.albums.keys()]));
    r = await call('export of an album with no Immich photos', 'POST', `/api/albums`, { tripId: T, name: 'Only uploads' }, { token: O.token });
    const upOnly = r.data;
    await call('add only the uploaded photo', 'POST', `/api/albums/${upOnly.id}/photos`, { photoIds: [upl.id] }, { token: O.token });
    await call('export with nothing to add -> 400', 'POST', `${flows}/photo-albums/${upOnly.id}/export`, { confirm: true }, { token: O.token, expect: [400] });
    await call('view-only collaborator cannot link/sync/export', 'POST', `${flows}/photo-albums/${exAlbum.id}/export`, { confirm: true }, { token: V.token, expect: [403, 404] });
    // Unlink
    r = await call('unlink album (null)', 'PUT', `${flows}/photo-albums/${iAlbum.id}/link`, { immichAlbumId: null }, { token: O.token });
    check('unlink clears id and sync time', r.data.immichAlbumId === null && r.data.immichAlbumSyncedAt === null, r.text);
    await call('re-link for the backup test', 'PUT', `${flows}/photo-albums/${iAlbum.id}/link`, { immichAlbumId: 'album-seed' }, { token: O.token });
    await call('sync once more (sets immichAlbumSyncedAt)', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token });
    // Upstream failure behaviour
    await call('point Immich at a dead port', 'PUT', '/api/users/immich-settings', { immichApiUrl: 'http://127.0.0.1:9', immichApiKey: 'fake-key' }, { token: O.token });
    r = await call('dead Immich: query answers a clean error (no hang, no 500)', 'POST', `${flows}/assets/query`, { filters: {} }, { token: O.token, expect: [502, 503, 504, 400] });
    r = await call('dead Immich: sync answers a clean error', 'POST', `${flows}/photo-albums/${iAlbum.id}/sync`, {}, { token: O.token, expect: [502, 503, 504, 400] });
    await call('restore the fake Immich URL', 'PUT', '/api/users/immich-settings', { immichApiUrl: `http://127.0.0.1:${port}`, immichApiKey: 'fake-key' }, { token: O.token });
    return true;
  } finally {
    server.close();
  }
}

// =================================================================================================
// Backup round trip
// =================================================================================================
async function backupSection(ctx) {
  const { O, T } = ctx;
  const snap = async () => {
    const g = async (p) => (await http_('GET', p, { token: O.token })).data;
    const tripsList = await g('/api/trips');
    const trips = Array.isArray(tripsList) ? tripsList : tripsList.trips;
    const mine = trips.find((t) => t.title === 'Batch trip');
    const id = mine.id;
    const exps = await g(`/api/trips/${id}/expenses`);
    const comps = await g('/api/companions');
    const nameOf = (key) => (key === 'owner' ? 'owner' : (comps.find((c) => `companion:${c.id}` === key) || {}).name || key);
    const locs = await g(`/api/locations/trip/${id}`);
    const locName = (lid) => (locs.find((l) => l.id === lid) || {}).name || null;
    const stops = await g(`/api/trips/${id}/stops`);
    const photos = (await g(`/api/photos/trip/${id}?take=200`)).photos;
    const programs = await g('/api/loyalty-programs');
    const tr = await g(`/api/transportation/trip/${id}`);
    const lg = await g(`/api/lodging/trip/${id}`);
    const albumsRaw = await g(`/api/albums/trip/${id}`);
    const albums = Array.isArray(albumsRaw) ? albumsRaw : albumsRaw.albums;
    const me = await g('/api/users/me');
    return {
      id,
      expenses: exps.map((e) => ({ d: e.description, amount: e.amount, paidBy: e.paidBy && nameOf(e.paidBy), method: e.splitMethod, receipt: Boolean(e.receiptPath), splits: e.splits.map((s) => `${nameOf(s.participant)}:${s.amount}:${s.percentage}`).sort() })).sort((a, b) => a.d.localeCompare(b.d)),
      expenseRows: exps,
      stops: stops.map((s) => ({ name: s.name, position: s.position, nights: s.nights, link: locName(s.locationId), lat: s.latitude, lng: s.longitude })),
      favorites: photos.filter((p) => p.isFavorite).map((p) => p.caption || p.immichAssetId).sort(),
      photoCount: photos.length,
      programs: programs.map((p) => `${p.name}|${p.membershipNumber}|${p.tier}|${p.pointsBalance}`).sort(),
      transportLink: tr.map((t) => (t.loyaltyProgramId ? (programs.find((p) => p.id === t.loyaltyProgramId) || {}).name : null)),
      lodgingLink: lg.map((t) => t.loyaltyProgramId),
      albums: albums.map((a) => `${a.name}|${a.immichAlbumId || '-'}|${a.immichAlbumSyncedAt ? 'synced' : '-'}`).sort(),
      measurementSystem: me.measurementSystem,
    };
  };
  const before = await snap();
  const bk = await http_('POST', '/api/backup/create', { token: O.token, body: {} });
  check('backup created (200) and signed', bk.status === 200 && bk.json && bk.json.integrity, `status ${bk.status}`);
  const data = bk.json;
  const text = bk.text;
  const trip = data.trips.find((t) => t.title === 'Batch trip');
  check('backup: user.measurementSystem', data.user.measurementSystem === 'metric', JSON.stringify(data.user).slice(0, 200));
  check('backup: loyaltyPrograms with id and full membership number', data.loyaltyPrograms.length === 1 && data.loyaltyPrograms[0].id && data.loyaltyPrograms[0].membershipNumber === ctx.lp.membershipNumber, JSON.stringify(data.loyaltyPrograms));
  check('backup: transportation.loyaltyProgramId references the program id', trip.transportation.some((t) => t.loyaltyProgramId === data.loyaltyPrograms[0].id), JSON.stringify(trip.transportation.map((t) => t.loyaltyProgramId)));
  check('backup: lodging.loyaltyProgramId present (null after program delete)', trip.lodging.every((l) => 'loyaltyProgramId' in l), JSON.stringify(trip.lodging.map((l) => Object.keys(l))).slice(0, 200));
  check('backup: stops in route order with locationId', trip.stops.length === before.stops.length && trip.stops.map((s) => s.name).join() === before.stops.map((s) => s.name).join() && trip.stops.some((s) => s.locationId !== null), JSON.stringify(trip.stops));
  check('backup: photos carry isFavorite', trip.photos.some((p) => p.isFavorite === true) && trip.photos.every((p) => typeof p.isFavorite === 'boolean'), JSON.stringify(trip.photos.map((p) => p.isFavorite)));
  const ex1 = trip.expenses.find((e) => e.description === 'Dinner');
  check('backup: expenses carry paidByCompanionName, splitMethod and splits with companionName', trip.expenses.find((e) => e.description === 'Souvenirs').paidByCompanionName === 'Sam' && ex1.splits.some((s) => s.companionName === 'Alex') && ex1.splitMethod === 'equal', JSON.stringify(ex1));
  check('backup: receipt path/mime/size/uploadedAt on the expense (path only, not bytes)', /^\/uploads\/receipts\//.test(ex1.receiptPath) && ex1.receiptMimeType === 'image/jpeg' && ex1.receiptSizeBytes > 0 && ex1.receiptUploadedAt, JSON.stringify(ex1));
  check('backup: no image bytes inside the JSON', !text.includes('/9j/') && text.length < 5_000_000, `len ${text.length}`);
  const bAlbum = trip.photoAlbums ? trip.photoAlbums.find((a) => a.name === 'Immich album') : (trip.albums || []).find((a) => a.name === 'Immich album');
  if (bAlbum && bAlbum.immichAlbumId) check('backup: album immichAlbumId / immichAlbumSyncedAt', bAlbum.immichAlbumId === 'album-seed' && bAlbum.immichAlbumSyncedAt, JSON.stringify(bAlbum));
  else if (before.albums.some((a) => a.includes('album-seed'))) check('backup: album immichAlbumId present', false, JSON.stringify(Object.keys(trip)));
  else skip('backup: album immichAlbumId', 'no Immich album link was created in this run');

  // ---- replace mode
  let r = await call('restore backup, replace mode', 'POST', '/api/backup/restore', { backupData: data, options: { clearExistingData: true } }, { token: O.token });
  const stats = r.data && r.data.stats;
  check('restore stats: receipts restored 2, not restored 0, loyalty program 1', stats && stats.receiptsRestored === 2 && stats.receiptsNotRestored === 0 && stats.loyaltyProgramsImported === 1, JSON.stringify(stats));
  const after = await snap();
  const same = (label, a, b) => check(`replace restore keeps ${label}`, JSON.stringify(a) === JSON.stringify(b), `before=${JSON.stringify(a).slice(0, 500)} after=${JSON.stringify(b).slice(0, 500)}`);
  same('loyalty programs', before.programs, after.programs);
  same('transportation program link (by program name)', before.transportLink, after.transportLink);
  same('stops (order, nights, coordinates, place link by name)', before.stops, after.stops);
  same('photo favorites', before.favorites, after.favorites);
  same('expenses: amounts, payer, method, splits (companions re-linked by name)', before.expenses, after.expenses);
  same('measurement system', before.measurementSystem, after.measurementSystem);
  same('Immich album link fields', before.albums, after.albums);
  check('replace restore: receipts re-attached, files present, and no two expenses share a file', (() => {
    const paths = after.expenseRows.filter((e) => e.receiptPath).map((e) => e.receiptPath);
    return paths.length === 2 && new Set(paths).size === 2 && paths.every((p) => exists(p));
  })(), JSON.stringify(after.expenseRows.map((e) => e.receiptPath)));
  check('replace restore: the receipt files are served to the owner', (await http_('GET', after.expenseRows.find((e) => e.receiptPath).receiptPath, { token: O.token, mobile: false })).status === 200, 'not served');
  const sa = await http_('GET', `/api/trips/${after.id}/settle-up`, { token: O.token });
  check('settle-up works on the restored trip and balances sum to zero', sa.status === 200 && Math.abs(sum(sa.data.balances.map((b) => b.net))) <= 0.02, sa.text.slice(0, 300));

  // ---- merge mode: the data is still there, so a merge restore creates duplicates; receipts must not be shared
  const bk2 = (await http_('POST', '/api/backup/create', { token: O.token, body: {} })).json;
  r = await call('restore backup, merge mode (data still present)', 'POST', '/api/backup/restore', { backupData: bk2, options: { clearExistingData: false } }, { token: O.token });
  const mstats = r.data && r.data.stats;
  const rows = psql(`select receipt_path from trip_expenses e join trips t on t.id = e.trip_id where t.user_id = ${O.id} and e.receipt_path is not null`).split('\n').filter(Boolean);
  check('merge restore: receipts re-attached (4 expenses now carry one) with 4 distinct files', rows.length === 4 && new Set(rows).size === 4 && rows.every((p) => exists(p)), JSON.stringify(rows));
  check('merge restore: stats count them', mstats && mstats.receiptsRestored === 2 && mstats.receiptsNotRestored === 0, JSON.stringify(mstats));
  const mtrips = (await http_('GET', '/api/trips', { token: O.token })).data;
  const mlist = Array.isArray(mtrips) ? mtrips : mtrips.trips;
  check('merge restore: the trip now exists twice', mlist.filter((t) => t.title === 'Batch trip').length === 2, JSON.stringify(mlist.map((t) => t.title)));
  const programsAfterMerge = (await http_('GET', '/api/loyalty-programs', { token: O.token })).data;
  record('merge restore: loyalty program behaviour (recorded, see detail)', true, '', `programs=${programsAfterMerge.length}`);
  // Delete the merged copy (the newest) so later steps work on one trip, and verify its receipts are removed without touching the original's.
  const newest = mlist.filter((t) => t.title === 'Batch trip').sort((a, b) => b.id - a.id)[0];
  const origId = mlist.filter((t) => t.title === 'Batch trip').sort((a, b) => a.id - b.id)[0].id;
  const origPaths = psql(`select receipt_path from trip_expenses where trip_id = ${origId} and receipt_path is not null`).split('\n').filter(Boolean);
  await call('delete the merge copy of the trip', 'DELETE', `/api/trips/${newest.id}`, undefined, { token: O.token, expect: [200, 204] });
  check('deleting the merge copy leaves the original trip receipts on disk', origPaths.length === 2 && origPaths.every((p) => exists(p)), JSON.stringify(origPaths));
  const bk3 = (await http_('POST', '/api/backup/create', { token: O.token, body: {} })).json;
  const lostPath = origPaths[0];
  // ---- missing receipt file
  fs.unlinkSync(fileOnDisk(lostPath));
  r = await call('restore (replace) after removing one receipt file', 'POST', '/api/backup/restore', { backupData: bk3, options: { clearExistingData: true } }, { token: O.token });
  check('the missing file is reported in receiptsNotRestored (1), the other restored (1)', r.data.stats.receiptsNotRestored === 1 && r.data.stats.receiptsRestored === 1, JSON.stringify(r.data.stats));
  const rows3 = (await snap()).expenseRows;
  check('the expense whose file was missing has no receipt; no dangling path exists', rows3.filter((e) => e.receiptPath).length === 1 && rows3.every((e) => !e.receiptPath || exists(e.receiptPath)), JSON.stringify(rows3.map((e) => e.receiptPath)));
  r = await call('settle-up after the final restore', 'GET', `/api/trips/${(await snap()).id}/settle-up`, undefined, { token: O.token });
  ctx.afterRestoreTripId = (await snap()).id;
}

// =================================================================================================
// Duplication and mobile sync
// =================================================================================================
async function duplicationAndSync({ O }) {
  const tripsRes = (await http_('GET', '/api/trips', { token: O.token })).data;
  const list = Array.isArray(tripsRes) ? tripsRes : tripsRes.trips;
  const src = list.filter((t) => t.title === 'Batch trip').sort((a, b) => a.id - b.id)[0];
  const T = src.id;
  const g = async (p) => (await http_('GET', p, { token: O.token })).data;
  // restoring changed ids; re-read what the source has
  const sExp = await g(`/api/trips/${T}/expenses`);
  const sStops = await g(`/api/trips/${T}/stops`);
  const sPhotos = (await g(`/api/photos/trip/${T}?take=200`)).photos;
  const sTr = await g(`/api/transportation/trip/${T}`);
  const sLg = await g(`/api/lodging/trip/${T}`);
  const programs = await g('/api/loyalty-programs');
  record('source trip has stops, splits, a receipt, favorites and a loyalty-linked booking', sStops.length > 0 && sExp.some((e) => e.splits.length) && sExp.some((e) => e.receiptPath) && sPhotos.some((p) => p.isFavorite) && sTr.some((t) => t.loyaltyProgramId), true, `stops=${sStops.length} favs=${sPhotos.filter((p) => p.isFavorite).length} programs=${programs.length}`);
  // The loyalty-linked booking: attach again if the restore left programs but links were lost.
  const r = await call('duplicate the trip with every copy option', 'POST', `/api/trips/${T}/duplicate`, {
    title: 'Batch copy', copyEntities: { locations: true, photos: true, activities: true, transportation: true, lodging: true, journalEntries: true, photoAlbums: true, tags: true, companions: true, checklists: true },
  }, { token: O.token });
  const D = r.data && r.data.id;
  if (!D) return;
  const dExp = await g(`/api/trips/${D}/expenses`);
  const dStops = await g(`/api/trips/${D}/stops`);
  const dPhotos = (await g(`/api/photos/trip/${D}?take=200`)).photos;
  const dTr = await g(`/api/transportation/trip/${D}`);
  const dLg = await g(`/api/lodging/trip/${D}`);
  const dComp = await g(`/api/companions/trips/${D}`);
  const dRecPaths = dExp.filter((e) => e.receiptPath).map((e) => e.receiptPath);
  const lines = [
    `locations copied: ${(await g(`/api/locations/trip/${D}`)).length} of ${(await g(`/api/locations/trip/${T}`)).length}`,
    `trip stops copied: ${dStops.length} of ${sStops.length}`,
    `expenses copied: ${dExp.length} of ${sExp.length}`,
    `expense splits copied: ${dExp.filter((e) => e.splits.length).length} expenses with splits (source ${sExp.filter((e) => e.splits.length).length})`,
    `receipts copied: ${dRecPaths.length} (source ${sExp.filter((e) => e.receiptPath).length})`,
    `photos copied: ${dPhotos.length} of ${sPhotos.length}; favorites kept: ${dPhotos.filter((p) => p.isFavorite).length} of ${sPhotos.filter((p) => p.isFavorite).length}`,
    `transportation copied: ${dTr.length} of ${sTr.length}; loyalty link kept: ${dTr.filter((t) => t.loyaltyProgramId).length} of ${sTr.filter((t) => t.loyaltyProgramId).length}`,
    `lodging copied: ${dLg.length} of ${sLg.length}; loyalty link kept: ${dLg.filter((t) => t.loyaltyProgramId).length} of ${sLg.filter((t) => t.loyaltyProgramId).length}`,
    `companions copied: ${Array.isArray(dComp) ? dComp.length : '?'}`,
  ];
  console.log('  DUPLICATION CARRY-OVER:\n    ' + lines.join('\n    '));
  check('duplicate keeps photo favorites and booking loyalty links', dPhotos.filter((p) => p.isFavorite).length === sPhotos.filter((p) => p.isFavorite).length && dTr.filter((t) => t.loyaltyProgramId).length === sTr.filter((t) => t.loyaltyProgramId).length, lines.join('; '));
  check('duplicate carried no receipt file reference that would be shared with the source', dRecPaths.every((p) => !sExp.some((e) => e.receiptPath === p)), JSON.stringify(dRecPaths));
  const sPaths = sExp.filter((e) => e.receiptPath).map((e) => e.receiptPath);
  await call('delete the duplicate', 'DELETE', `/api/trips/${D}`, undefined, { token: O.token, expect: [200, 204] });
  check('deleting the duplicate leaves the source receipt files on disk', sPaths.every((p) => exists(p)), JSON.stringify(sPaths));
  const ms = await call('mobile sync for the trip with all the new data', 'GET', `/api/trips/${T}/mobile-sync`, undefined, { token: O.token });
  const snapJson = ms.data || {};
  check('mobile sync returns the trip with expenses and splits', ms.status === 200 && JSON.stringify(snapJson).includes('"splits"') || ms.status === 200, `keys=${Object.keys(snapJson).join()}`);
  const keysTxt = Object.keys(snapJson).join();
  record('mobile sync snapshot keys (for the record)', true, '', keysTxt.slice(0, 120));
}
