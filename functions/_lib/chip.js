/*
 * CHIP Collect API (https://docs.chip-in.asia). Test or live mode is decided by which
 * secret key is stored in Cloudflare; the API address is the same for both.
 */
const API = 'https://gate.chip-in.asia/api/v1';

function headers(env) {
  return {
    Authorization: 'Bearer ' + env.CHIP_SECRET_KEY,
    'Content-Type': 'application/json'
  };
}

export async function createPurchase(env, body) {
  const res = await fetch(API + '/purchases/', {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id || !data.checkout_url) {
    throw new Error('CHIP create purchase failed: ' + res.status + ' ' + JSON.stringify(data).slice(0, 500));
  }
  return data;
}

export async function getPurchase(env, id) {
  const res = await fetch(API + '/purchases/' + encodeURIComponent(id) + '/', { headers: headers(env) });
  if (!res.ok) throw new Error('CHIP get purchase failed: ' + res.status);
  return res.json();
}

// The public key rarely changes, so keep it for the life of this worker instance.
let publicKeyPromise = null;

async function getPublicKey(env) {
  if (!publicKeyPromise) {
    publicKeyPromise = (async () => {
      const res = await fetch(API + '/public_key/', { headers: headers(env) });
      if (!res.ok) throw new Error('CHIP public key failed: ' + res.status);
      // The body is a JSON-encoded PEM string ("-----BEGIN PUBLIC KEY-----...")
      const pem = await res.json();
      const base64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
      const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    })().catch((error) => {
      publicKeyPromise = null;
      throw error;
    });
  }
  return publicKeyPromise;
}

/*
 * X-Signature is a base64 RSA PKCS#1 v1.5 signature of the SHA-256 digest of the raw request body.
 * `key` can be passed in for tests; normally it is fetched from CHIP.
 */
export async function verifySignature(env, rawBody, signatureBase64, key) {
  if (!signatureBase64) return false;
  let signature;
  try {
    signature = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
  } catch (e) {
    return false;
  }
  const publicKey = key || (await getPublicKey(env));
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, rawBody);
}
