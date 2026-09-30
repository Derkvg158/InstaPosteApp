// Gedeelde hulpfuncties voor de Instagram-scripts.
import { readFile, writeFile } from 'node:fs/promises';

export const API_VERSION = process.env.IG_API_VERSION || 'v26.0';
export const API_BASE = `https://graph.instagram.com/${API_VERSION}`;

export const STATUS = { GEPLAND: 'gepland', GEPLAATST: 'geplaatst', MISLUKT: 'mislukt' };

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Omgevingsvariabele ${name} ontbreekt (zet hem als GitHub-secret).`);
  }
  return value;
}

export async function readPosts(path) {
  const raw = await readFile(path, 'utf8');
  const posts = JSON.parse(raw);
  if (!Array.isArray(posts)) throw new Error(`${path} moet een JSON-array zijn.`);
  return posts;
}

export async function writePosts(path, posts) {
  await writeFile(path, JSON.stringify(posts, null, 2) + '\n', 'utf8');
}

// Tijdstip met expliciete offset (bijv. +02:00 zomertijd, +01:00 wintertijd) of Z.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Geeft een lijst foutmeldingen terug; leeg = geldig. */
export function validatePosts(posts) {
  const errors = [];
  const ids = new Set();
  posts.forEach((p, i) => {
    const where = `post #${i + 1}${p?.id ? ` (${p.id})` : ''}`;
    if (!p || typeof p !== 'object') return errors.push(`${where}: geen object`);
    if (!p.id) errors.push(`${where}: "id" ontbreekt`);
    else if (ids.has(p.id)) errors.push(`${where}: dubbel id`);
    else ids.add(p.id);

    if (!ISO_WITH_OFFSET.test(p.publish_at ?? '')) {
      errors.push(`${where}: "publish_at" moet ISO-tijd met offset zijn, bijv. 2026-10-05T19:00:00+02:00`);
    } else {
      const warn = amsterdamOffsetWarning(p.publish_at);
      if (warn) errors.push(`${where}: ${warn}`);
    }

    if (!/^https:\/\/.+\.jpe?g$/i.test(p.image_url ?? '')) {
      errors.push(`${where}: "image_url" moet een publieke https-URL naar een .jpg zijn`);
    }
    if (typeof p.caption !== 'string') errors.push(`${where}: "caption" ontbreekt`);
    else {
      if (p.caption.length > 2200) errors.push(`${where}: caption is langer dan 2200 tekens`);
      const tags = p.caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
      if (tags.length > 30) errors.push(`${where}: meer dan 30 hashtags (${tags.length})`);
    }
    if (!Object.values(STATUS).includes(p.status)) {
      errors.push(`${where}: "status" moet gepland, geplaatst of mislukt zijn`);
    }
  });
  return errors;
}

/**
 * Controleert of de offset in publish_at klopt met Nederlandse tijd op die datum
 * (zomertijd +02:00, wintertijd +01:00). Voorkomt dat een post een uur te vroeg/laat gaat.
 */
function amsterdamOffsetWarning(publishAt) {
  const m = publishAt.match(/(Z|[+-]\d{2}:\d{2})$/);
  if (!m || m[1] === 'Z') return null;
  const date = new Date(publishAt);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((x) => x.type === 'timeZoneName')?.value; // bijv. "GMT+02:00"
  const expected = part?.replace('GMT', '') || '+00:00';
  if (expected !== m[1]) {
    return `offset ${m[1]} klopt niet met Nederlandse tijd op die datum (verwacht ${expected})`;
  }
  return null;
}

/** Roept de Instagram API aan en gooit een duidelijke fout bij een API-fout. */
export async function igRequest(method, path, { token, params = {} } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  const init = { method, headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(`Netwerkfout bij ${method} ${url.pathname}: ${err.message}`);
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok || body.error) {
    const e = body.error || {};
    const detail = [
      e.message || body.raw || `HTTP ${res.status}`,
      e.type && `type=${e.type}`,
      e.code != null && `code=${e.code}`,
      e.error_subcode != null && `subcode=${e.error_subcode}`,
      e.error_user_msg && `uitleg="${e.error_user_msg}"`,
      e.fbtrace_id && `fbtrace_id=${e.fbtrace_id}`,
    ].filter(Boolean).join(', ');
    throw new Error(`${method} ${url.pathname} mislukt (HTTP ${res.status}): ${detail}`);
  }
  return body;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
