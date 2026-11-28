/*
 * Meta Pixel ID for Facebook and Instagram ads tracking. The admin sets it on the Settings page;
 * it is kept in D1 (table settings) and read by every page through /api/site-config.
 */
import { ensureSchema } from './orders.js';

const KEY = 'meta_pixel_id';

/** A Meta Pixel (dataset) ID is 15 or 16 digits. */
export function validPixelId(value) {
  return typeof value === 'string' && /^\d{15,16}$/.test(value);
}

export async function getPixelId(env) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
    const id = row ? JSON.parse(row.value) : null;
    return validPixelId(id) ? id : null;
  } catch (error) {
    return null; // no settings table yet
  }
}

export async function setPixelId(env, id) {
  await ensureSchema(env.DB);
  if (!id) return env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(KEY).run();
  return env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(KEY, JSON.stringify(id), new Date().toISOString())
    .run();
}
