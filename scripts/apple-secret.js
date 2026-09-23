// Generate the Apple Sign-In client secret (ES256 JWT) from a .p8 key.
// Usage: node apple-secret.js <TEAM_ID>
const crypto = require('crypto');
const fs = require('fs');

const TEAM_ID = process.argv[2];
const KEY_ID = 'A624MKPQ9Q';
const CLIENT_ID = 'com.investigationsdifferently.eventinsight.auth';
const P8_PATH = 'C:/Dev/InvDiff/Keys/AuthKey_A624MKPQ9Q.p8';

if (!TEAM_ID || !/^[A-Z0-9]{10}$/i.test(TEAM_ID)) {
  console.error('Pass the 10-character Team ID as the argument.');
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: KEY_ID };
// Apple caps validity at 15777000s (~6 months); use slightly under.
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 15770000,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const key = crypto.createPrivateKey(fs.readFileSync(P8_PATH, 'utf8'));
const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key,
  dsaEncoding: 'ieee-p1363', // raw r||s as JWT ES256 requires
});

console.log(`${signingInput}.${b64url(signature)}`);
console.log(
  `\nExpires: ${new Date((now + 15770000) * 1000).toDateString()} — regenerate before then.`,
);
