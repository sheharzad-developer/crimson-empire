const crypto = require('crypto');

const COOKIE_NAME = 'ce_access';
const DEFAULT_TTL_DAYS = 365;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

function getSecret() {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET environment variable is not set');
  return secret;
}

function sign(payload) {
  const data = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(base64urlDecode(data));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createAccessToken({ orderRef, method, ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const now = Date.now();
  return sign({
    orderRef: orderRef || null,
    method: method || null,
    iat: now,
    exp: now + ttlDays * 24 * 60 * 60 * 1000,
  });
}

function accessCookieHeader(token, { maxAgeSeconds = DEFAULT_TTL_DAYS * 24 * 60 * 60 } = {}) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function hasValidAccess(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  return !!verify(token);
}

module.exports = {
  COOKIE_NAME,
  createAccessToken,
  accessCookieHeader,
  parseCookies,
  hasValidAccess,
  verify,
};
