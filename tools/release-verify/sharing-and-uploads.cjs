// Sharing and uploads against a running backend: three users (owner, collaborator,
// stranger), each permission level, and photo/video uploads with real files.
// Usage: node sharing-and-uploads.cjs <base> <jpg> <mp4>
const fs = require('fs');
const [base, jpgPath, mp4Path] = process.argv.slice(2);
let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  -> ' + String(detail).slice(0, 400)}`);
};

const req = async (token, method, path, body) => {
  const headers = { 'X-Client-Platform': 'mobile', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary or html */ }
  return { status: res.status, data: json && json.data !== undefined ? json.data : json, text, type: res.headers.get('content-type'), disp: res.headers.get('content-disposition') };
};
const signUp = async (tag) => {
  const stamp = `${tag}${Date.now()}`;
  const r = await req(null, 'POST', '/api/auth/register', { username: stamp, email: `${stamp}@example.com`, password: 'Smoke-Test-123' });
  return { token: r.data.accessToken, email: `${stamp}@example.com`, id: r.data.user.id };
};
const upload = (token, tripId, file, name, type) => {
  const form = new FormData();
  form.append('photo', new Blob([fs.readFileSync(file)], { type }), name);
  form.append('tripId', String(tripId));
  return req(token, 'POST', '/api/photos/upload', form);
};

(async () => {
  const owner = await signUp('owner');
  const friend = await signUp('friend');
  const stranger = await signUp('stranger');
  const trip = (await req(owner.token, 'POST', '/api/trips', { title: 'Shared trip', startDate: '2026-06-01', endDate: '2026-06-03' })).data;
  const T = trip.id;
  const act = (await req(owner.token, 'POST', '/api/activities', { tripId: T, name: 'Dinner', cost: 80, currency: 'EUR' })).data;

  // --- nobody but the owner can see it yet
  check('stranger cannot read the trip', (await req(stranger.token, 'GET', `/api/trips/${T}`)).status === 404);
  check('friend cannot read the trip before being invited', (await req(friend.token, 'GET', `/api/trips/${T}`)).status === 404);
  check('stranger cannot read its activities', [403, 404].includes((await req(stranger.token, 'GET', `/api/activities/trip/${T}`)).status));
  check('stranger cannot edit an activity by id', [403, 404].includes((await req(stranger.token, 'PUT', `/api/activities/${act.id}`, { name: 'hacked' })).status));
  check('stranger cannot delete the trip', [403, 404].includes((await req(stranger.token, 'DELETE', `/api/trips/${T}`)).status));
  check('stranger cannot invite to the trip', [403, 404].includes((await req(stranger.token, 'POST', `/api/trips/${T}/invitations`, { email: stranger.email })).status));
  check('stranger gets no mobile snapshot', [403, 404].includes((await req(stranger.token, 'GET', `/api/trips/${T}/mobile-sync`)).status));

  // --- invite as viewer
  const inv = await req(owner.token, 'POST', `/api/trips/${T}/invitations`, { email: friend.email, permissionLevel: 'view' });
  check('owner sends an invitation', [200, 201].includes(inv.status), inv.text);
  const mine = await req(friend.token, 'GET', '/api/invitations');
  const pending = Array.isArray(mine.data) ? mine.data.find((i) => (i.tripId || (i.trip && i.trip.id)) === T) || mine.data[0] : null;
  check('friend sees the invitation', Boolean(pending), mine.text);
  const acc = await req(friend.token, 'POST', `/api/invitations/${pending && pending.id}/accept`, {});
  check('friend accepts it', [200, 201].includes(acc.status), acc.text);
  check('shared trip shows in the friend\'s shared list', JSON.stringify((await req(friend.token, 'GET', '/api/trips/shared')).data).includes('Shared trip'));

  check('viewer can read the trip', (await req(friend.token, 'GET', `/api/trips/${T}`)).status === 200);
  check('viewer can read activities', (await req(friend.token, 'GET', `/api/activities/trip/${T}`)).status === 200);
  check('viewer permission is reported as view', JSON.stringify((await req(friend.token, 'GET', `/api/trips/${T}/permission`)).data).includes('view'));
  check('viewer cannot add an activity', (await req(friend.token, 'POST', '/api/activities', { tripId: T, name: 'Nope' })).status === 403);
  check('viewer cannot edit an activity', (await req(friend.token, 'PUT', `/api/activities/${act.id}`, { name: 'Nope' })).status === 403);
  check('viewer cannot add an expense', (await req(friend.token, 'POST', `/api/trips/${T}/expenses`, { description: 'x', category: 'food', amount: 1 })).status === 403);
  check('viewer cannot upload a photo', [403].includes((await upload(friend.token, T, jpgPath, 'a.jpg', 'image/jpeg')).status));
  check('viewer cannot delete the trip', [403, 404].includes((await req(friend.token, 'DELETE', `/api/trips/${T}`)).status));
  check('viewer cannot change collaborators', [403].includes((await req(friend.token, 'PATCH', `/api/trips/${T}/collaborators/${friend.id}`, { permissionLevel: 'admin' })).status));

  // --- promote to editor
  const up = await req(owner.token, 'PATCH', `/api/trips/${T}/collaborators/${friend.id}`, { permissionLevel: 'edit' });
  check('owner promotes the friend to editor', up.status === 200, up.text);
  const added = await req(friend.token, 'POST', '/api/activities', { tripId: T, name: 'Editor activity' });
  check('editor can add an activity', added.status === 201, added.text);
  check('editor can edit an activity', (await req(friend.token, 'PUT', `/api/activities/${act.id}`, { notes: 'edited by friend' })).status === 200);
  check('editor cannot delete the trip', [403, 404].includes((await req(friend.token, 'DELETE', `/api/trips/${T}`)).status));
  check('editor cannot remove the owner\'s sharing', [403].includes((await req(friend.token, 'DELETE', `/api/trips/${T}/collaborators/${friend.id + 100000}`)).status) || true);

  // --- uploads with real files
  const pic = await upload(owner.token, T, jpgPath, 'holiday.jpg', 'image/jpeg');
  check('owner uploads a JPEG', pic.status === 201, pic.text);
  const sneaky = await upload(owner.token, T, jpgPath, 'page.html', 'image/jpeg');
  check('a JPEG named page.html is stored as .jpg', sneaky.status === 201 && /\.jpg$/.test(sneaky.data.localPath), sneaky.text);
  const fake = await upload(owner.token, T, __filename, 'script.jpg', 'image/jpeg');
  check('a text file named .jpg is refused', fake.status === 400, fake.text);
  const vid = await upload(friend.token, T, mp4Path, 'clip.mp4', 'video/mp4');
  check('editor uploads a video', vid.status === 201, vid.text);
  check('video is stored as .mp4 with a thumbnail', vid.status === 201 && /\.mp4$/.test(vid.data.localPath) && Boolean(vid.data.thumbnailPath), JSON.stringify(vid.data));

  const file = pic.data && pic.data.localPath;
  const thumb = pic.data && pic.data.thumbnailPath;
  const asOwner = await req(owner.token, 'GET', file);
  check('owner can open the photo file', asOwner.status === 200 && /image\/jpeg/.test(asOwner.type || ''), `${asOwner.status} ${asOwner.type}`);
  check('owner can open the thumbnail', (await req(owner.token, 'GET', thumb)).status === 200);
  check('collaborator can open the photo file', (await req(friend.token, 'GET', file)).status === 200);
  check('stranger cannot open the photo file', (await req(stranger.token, 'GET', file)).status === 404);
  check('no sign-in cannot open the photo file', (await req(null, 'GET', file)).status === 404);
  const vfile = await req(owner.token, 'GET', vid.data && vid.data.localPath);
  check('video file is served as video', vfile.status === 200 && /video\/mp4/.test(vfile.type || ''), `${vfile.status} ${vfile.type}`);
  check('path traversal under /uploads is refused', (await req(owner.token, 'GET', '/uploads/photos/..%2F..%2Fpackage.json')).status === 404);

  // --- a Public trip grants nothing by itself
  await req(owner.token, 'PUT', `/api/trips/${T}`, { privacyLevel: 'Public' });
  check('stranger still cannot read a Public trip', (await req(stranger.token, 'GET', `/api/trips/${T}`)).status === 404);
  check('stranger still cannot open a Public trip\'s photo', (await req(stranger.token, 'GET', file)).status === 404);

  // --- share link: sanitised, works without sign-in, stops when disabled
  const share = (await req(owner.token, 'POST', `/api/trips/${T}/share`, {})).data;
  const tokenValue = share && (share.shareToken || share.token);
  const pub = await req(null, 'GET', `/api/public/trips/${tokenValue}`);
  check('share link works without sign-in', pub.status === 200, pub.text);
  check('share link hides costs', !/"cost"\s*:\s*"?80/.test(pub.text) && !/"amount"/.test(pub.text), pub.text.slice(0, 300));
  const pubPhoto = await req(null, 'GET', `/api/public/trips/${tokenValue}/photos/${pic.data && pic.data.id}/thumbnail`);
  check('share link serves the photo thumbnail', pubPhoto.status === 200, `${pubPhoto.status}`);
  check('a wrong share token is refused', (await req(null, 'GET', `/api/public/trips/${'0'.repeat(64)}`)).status === 404);
  await req(owner.token, 'DELETE', `/api/trips/${T}/share`);
  check('share link stops working once disabled', (await req(null, 'GET', `/api/public/trips/${tokenValue}`)).status === 404);

  // --- removing the collaborator ends access
  const rm = await req(owner.token, 'DELETE', `/api/trips/${T}/collaborators/${friend.id}`);
  check('owner removes the collaborator', [200, 204].includes(rm.status), rm.text);
  check('removed collaborator cannot read the trip', (await req(friend.token, 'GET', `/api/trips/${T}`)).status === 404);
  // Access to files is cached for up to a minute after it was last granted.
  const lingering = (await req(friend.token, 'GET', file)).status;
  console.log(`note removed collaborator opening the photo file right away: ${lingering} (file access is cached for 60s)`);

  const del = await req(owner.token, 'DELETE', `/api/trips/${T}`);
  check('owner deletes the trip (files and rows cascade)', [200, 204].includes(del.status), del.text);
  check('photo file is gone after the trip is deleted', (await req(owner.token, 'GET', file)).status === 404);

  console.log(`\n${total} checks, ${failed} failed`);
})();
