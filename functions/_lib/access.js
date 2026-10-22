/*
 * Admin sign-in with a single password.
 *
 * Setting (Cloudflare Pages → Settings → Variables and secrets, type Secret):
 *   ADMIN_PASSWORD  at least 12 characters
 *
 * Signing in sets a session cookie signed with the password, so changing the
 * password signs every device out. Failed attempts are counted in D1 to slow
 * down anyone trying to guess it.
 */
const COOKIE = 'chez_admin';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 12;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_TOTAL = 100;

const encoder = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings without stopping at the first difference. */
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function passwordReady(env) {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= MIN_PASSWORD_LENGTH;
}

/** Blocks form posts from other websites (the cookie is also SameSite=Strict). */
function sameOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  return request.headers.get('Origin') === new URL(request.url).origin;
}

function readCookie(request) {
  const match = (request.headers.get('Cookie') || '').split(/;\s*/).find((part) => part.startsWith(COOKIE + '='));
  return match ? match.slice(COOKIE.length + 1) : '';
}

function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

/** Returns { ok: true } for a signed-in admin, or { status, error } to send back. */
export async function requireAdmin(request, env) {
  if (!passwordReady(env)) return { status: 503, error: 'The admin password is not set up yet.' };
  if (!sameOrigin(request)) return { status: 403, error: 'Request blocked.' };

  const [expires, signature] = readCookie(request).split('.');
  if (!expires || !signature || !(Number(expires) > Date.now() / 1000)) return { status: 401, error: 'Please sign in.' };
  const expected = await hmac(env.ADMIN_PASSWORD, 'admin-session:' + expires);
  if (!sameString(signature, expected)) return { status: 401, error: 'Please sign in.' };
  return { ok: true };
}

/** Checks the password. Returns { cookie } to set on success, or { status, error }. Needs env.DB. */
export async function signIn(request, env) {
  if (!passwordReady(env)) return { status: 503, error: 'The admin password is not set up yet.' };
  if (!sameOrigin(request)) return { status: 403, error: 'Request blocked.' };

  let password = '';
  try {
    password = String((await request.json()).password || '');
  } catch (e) { /* treated as a wrong password */ }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const counts = await env.DB.prepare(
    'SELECT COUNT(*) AS total, SUM(ip = ?) AS mine FROM login_failures WHERE at > ?'
  ).bind(ip, now - WINDOW_MS).first();
  if ((counts && counts.mine) >= MAX_FAILS_PER_IP || (counts && counts.total) >= MAX_FAILS_TOTAL) {
    return { status: 429, error: 'Too many attempts. Please wait 15 minutes and try again.' };
  }

  // Compare fixed-length digests so the check takes the same time whatever was typed
  const correct = sameString(await hmac('admin-password', password), await hmac('admin-password', env.ADMIN_PASSWORD));
  if (!correct) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)').bind(ip, now),
      env.DB.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - 24 * 60 * 60 * 1000)
    ]);
    return { status: 401, error: 'Wrong password.' };
  }

  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const signature = await hmac(env.ADMIN_PASSWORD, 'admin-session:' + expires);
  return { cookie: sessionCookie(expires + '.' + signature, SESSION_SECONDS) };
}

export function signOutCookie() {
  return sessionCookie('', 0);
}

export function blockedOrigin(request) {
  return !sameOrigin(request);
}
