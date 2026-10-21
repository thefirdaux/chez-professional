/*
 * Admin requests must come through Cloudflare Access, which adds a signed token
 * (Cf-Access-Jwt-Assertion). We check that token here as well, so the order data
 * stays private even if the Access rule is ever misconfigured.
 *
 * Settings (Cloudflare Pages → Settings → Variables):
 *   ACCESS_TEAM_DOMAIN  e.g. chezprofessional.cloudflareaccess.com
 *   ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"
 *   ADMIN_EMAILS        comma-separated emails allowed into the admin page
 */
let certs = { team: '', at: 0, keys: [] };

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function signingKeys(team) {
  if (certs.team !== team || Date.now() - certs.at > 60 * 60 * 1000) {
    const res = await fetch('https://' + team + '/cdn-cgi/access/certs');
    if (!res.ok) throw new Error('Access certs failed: ' + res.status);
    certs = { team, at: Date.now(), keys: (await res.json()).keys || [] };
  }
  return certs.keys;
}

/** Returns { email } for an allowed admin, or { status, error } to send back. */
export async function requireAdmin(request, env) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  const allowed = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!team || !audience || allowed.length === 0) return { status: 503, error: 'Admin access is not set up yet.' };

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const parts = token.split('.');
  if (parts.length !== 3) return { status: 401, error: 'Please sign in.' };

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  } catch (e) {
    return { status: 401, error: 'Please sign in.' };
  }
  if (header.alg !== 'RS256') return { status: 401, error: 'Please sign in.' };

  const jwk = (await signingKeys(team)).filter((k) => k.kid === header.kid)[0];
  if (!jwk) return { status: 401, error: 'Please sign in.' };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, base64UrlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!valid) return { status: 401, error: 'Please sign in.' };

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const now = Date.now() / 1000;
  if (!audiences.includes(audience) || !(payload.exp > now) || payload.iss !== 'https://' + team) {
    return { status: 401, error: 'Please sign in.' };
  }

  const email = String(payload.email || '').toLowerCase();
  if (!allowed.includes(email)) return { status: 403, error: 'This account is not allowed.' };
  return { email };
}
