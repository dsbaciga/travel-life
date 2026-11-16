// For each existing user: take a backup, restore it over their data, take a second
// backup, and check nothing was lost or changed. Runs against a copy of the data.
// Usage: node backup-roundtrip.cjs <base> <jwtSecret> <backend node_modules> <users json>
const [base, secret, nm, usersJson] = process.argv.slice(2);
const jwt = require(nm + '/jsonwebtoken');
const users = JSON.parse(usersJson);

// Ids and timestamps are reassigned by a restore; everything else must survive.
const DROP = new Set(['id', 'tripId', 'userId', 'parentId', 'createdAt', 'updatedAt', 'exportDate', 'integrity', 'locationId', 'categoryId',
  'startLocationId', 'endLocationId', 'coverPhotoId', 'bannerPhotoId', 'sourceId', 'targetId', 'entityId', 'activityId', 'albumId', 'photoId',
  'seriesId', 'checklistId', 'typeId', 'companionId', 'tagId', 'lodgingId', 'transportationId', 'paidById', 'loyaltyProgramId']);
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!DROP.has(k)) o[k] = strip(v[k]);
    return o;
  }
  // "12.50" and 12.5 are the same stored Decimal.
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};
const count = (v, acc = {}) => {
  if (Array.isArray(v)) v.forEach((x) => count(x, acc));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (Array.isArray(x)) acc[k] = (acc[k] || 0) + x.length; count(x, acc); }
  return acc;
};
const firstDiff = (a, b, path = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  }
  return `${path}: before=${JSON.stringify(a)?.slice(0, 100)} after=${JSON.stringify(b)?.slice(0, 100)}`;
};

(async () => {
  for (const user of users) {
    const token = jwt.sign({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion }, secret, { expiresIn: 3600 });
    const h = { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'mobile', 'Content-Type': 'application/json' };
    const backup = async () => {
      const r = await fetch(base + '/api/backup/create', { method: 'POST', headers: h, body: '{}' });
      const j = await r.json();
      return { status: r.status, data: j && j.status && j.data !== undefined ? j.data : j };
    };
    const before = await backup();
    const restore = await fetch(base + '/api/backup/restore', { method: 'POST', headers: h, body: JSON.stringify({ backupData: before.data, options: { clearExistingData: true } }) });
    const restoreText = await restore.text();
    const after = await backup();
    const c1 = count(before.data), c2 = count(after.data);
    const diff = firstDiff(strip(before.data), strip(after.data));
    console.log(`user ${user.id}: backup ${before.status}, restore ${restore.status}, backup ${after.status}`);
    console.log(`   rows before: ${JSON.stringify(c1)}`);
    if (JSON.stringify(c1) !== JSON.stringify(c2)) console.log(`   rows after:  ${JSON.stringify(c2)}   <-- COUNT CHANGED`);
    if (restore.status >= 300) console.log(`   restore said: ${restoreText.slice(0, 600)}`);
    console.log(diff ? `   CONTENT DIFFERS at ${diff}` : '   content identical after restore');
  }
})();
