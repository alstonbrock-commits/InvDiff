// One-off: empty the consent-signatures bucket.
//
// Postgres blocks DML on storage.objects, so migration 0013 can't remove the
// files — they go through the Storage API instead. Run BEFORE 0013, because
// 0013 drops the policy that grants delete rights.
//
//   node scripts/purge-consent-storage.js <admin-email> <password>
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '';
const URL = get('EXPO_PUBLIC_SUPABASE_URL').trim();
const ANON = get('EXPO_PUBLIC_SUPABASE_ANON_KEY').trim();
const BUCKET = 'consent-signatures';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/purge-consent-storage.js <admin-email> <password>');
  process.exit(1);
}

(async () => {
  const auth = await (
    await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json();
  if (!auth.access_token) {
    console.error('Sign-in failed:', auth.error_description || auth.msg || auth);
    process.exit(1);
  }
  const H = {
    apikey: ANON,
    Authorization: `Bearer ${auth.access_token}`,
    'Content-Type': 'application/json',
  };

  // Storage list is per-prefix; walk the tree collecting file paths.
  const files = [];
  async function walk(prefix) {
    const res = await fetch(`${URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    const items = await res.json();
    if (!Array.isArray(items)) {
      console.error('List failed:', items);
      return;
    }
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) await walk(full); // folder
      else files.push(full);
    }
  }
  await walk('');

  console.log(`Found ${files.length} file(s) in ${BUCKET}`);
  if (files.length === 0) return;

  const del = await fetch(`${URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: H,
    body: JSON.stringify({ prefixes: files }),
  });
  console.log(del.ok ? `Deleted ${files.length} file(s).` : `Delete failed: ${await del.text()}`);
})();
