// Zet een hele batch posts in één keer klaar in Supabase (verschijnen daarna in de planner).
//
//   node scripts/inplannen.mjs <map>            -> controleren, niets opslaan
//   node scripts/inplannen.mjs <map> --echt     -> foto's uploaden en posts inplannen
//
// <map> bevat de foto's en een planning.json:
//   [{ "foto": "locatie.jpg", "datum": "2026-10-05", "tijd": "19:00", "tekst": "Caption #trouwen" }]
// Datum/tijd zijn Nederlandse tijd. Sleutels komen uit .env (SUPABASE_URL, SUPABASE_SECRET_KEY).
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { requireEnv, sbRequest } from './lib.mjs';

const BUCKET = 'ig-images';
const TZ = 'Europe/Amsterdam';

function loadDotEnv() {
  const file = resolve(import.meta.dirname, '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function amsOffsetMinutes(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
}

function amsToDate(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(asUtc - amsOffsetMinutes(new Date(asUtc)) * 60000);
  guess = new Date(asUtc - amsOffsetMinutes(guess) * 60000);
  return guess;
}

const formatWhen = (date) => new Intl.DateTimeFormat('nl-NL', {
  timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(date);

/** JPEG, max 1080 breed, verhouding tussen 4:5 en 1.91:1 (midden bijsnijden). */
async function prepareImage(path) {
  const img = sharp(path).rotate(); // EXIF-oriëntatie toepassen
  const meta = await img.metadata();
  let w = meta.width, h = meta.height;
  if (meta.orientation >= 5) [w, h] = [h, w];
  let crop = null;
  const ratio = w / h;
  if (ratio < 0.8) { const ch = Math.round(w / 0.8); crop = { left: 0, top: Math.round((h - ch) / 2), width: w, height: ch }; }
  else if (ratio > 1.91) { const cw = Math.round(h * 1.91); crop = { left: Math.round((w - cw) / 2), top: 0, width: cw, height: h }; }
  let pipeline = img;
  if (crop) pipeline = pipeline.extract(crop);
  const buffer = await pipeline
    .resize({ width: 1080, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: buffer.data, width: buffer.info.width, height: buffer.info.height, cropped: !!crop };
}

async function upload(path, buffer) {
  const base = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requireEnv('SUPABASE_SECRET_KEY');
  const headers = { apikey: key, 'Content-Type': 'image/jpeg' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers, body: buffer });
  if (!res.ok) throw new Error(`upload mislukt (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function main() {
  loadDotEnv();
  const dir = process.argv[2];
  const real = process.argv.includes('--echt');
  if (!dir) throw new Error('Gebruik: node scripts/inplannen.mjs <map> [--echt]');

  const plan = JSON.parse(await readFile(join(dir, 'planning.json'), 'utf8'));
  if (!Array.isArray(plan) || !plan.length) throw new Error('planning.json moet een niet-lege lijst zijn.');

  // Eerst alles controleren; bij één fout wordt niets opgeslagen.
  const errors = [];
  const items = [];
  for (const [i, p] of plan.entries()) {
    const where = `#${i + 1} (${p.foto ?? '?'})`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datum ?? '')) errors.push(`${where}: datum moet JJJJ-MM-DD zijn`);
    if (!/^\d{2}:\d{2}$/.test(p.tijd ?? '')) errors.push(`${where}: tijd moet UU:MM zijn`);
    const tekst = (p.tekst ?? '').trim();
    if (tekst.length > 2200) errors.push(`${where}: tekst langer dan 2200 tekens`);
    const tags = tekst.match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > 30) errors.push(`${where}: meer dan 30 hashtags`);
    const fotoPath = join(dir, p.foto ?? '');
    if (!p.foto || !existsSync(fotoPath)) { errors.push(`${where}: foto niet gevonden`); continue; }
    let img;
    try { img = await prepareImage(fotoPath); } catch (e) { errors.push(`${where}: foto niet leesbaar (${e.message}); exporteer hem als JPG`); continue; }
    const when = p.datum && p.tijd ? amsToDate(p.datum, p.tijd) : null;
    if (when && when.getTime() < Date.now()) errors.push(`${where}: ${formatWhen(when)} ligt in het verleden`);
    items.push({ ...p, tekst, img, when });
  }
  if (errors.length) {
    errors.forEach((e) => console.log(`FOUT ${e}`));
    throw new Error(`${errors.length} fout(en); er is niets ingepland.`);
  }

  // Waarschuwen voor posts op exact hetzelfde tijdstip als een bestaande geplande post.
  const hasKey = !!process.env.SUPABASE_SECRET_KEY;
  if (!hasKey && real) requireEnv('SUPABASE_SECRET_KEY');
  const existing = hasKey ? await sbRequest('GET', 'ig_posts?status=in.(gepland,bezig)&select=publish_at') : [];
  const taken = new Set(existing.map((r) => Date.parse(r.publish_at)));

  for (const it of items) {
    const clash = taken.has(it.when.getTime()) ? '  ⚠ er staat al een post op dit tijdstip' : '';
    console.log(`${formatWhen(it.when)}  ${it.foto}  ${it.img.width}×${it.img.height}${it.img.cropped ? ' (bijgesneden)' : ''}${clash}`);
    console.log(`    ${it.tekst.replace(/\s+/g, ' ').slice(0, 90)}${it.tekst.length > 90 ? '…' : ''}`);
  }

  if (!real) {
    console.log(`\nControle klaar: ${items.length} post(s) in orde. Voeg --echt toe om ze in te plannen.`);
    return;
  }

  for (const it of items) {
    const path = `${randomUUID()}.jpg`;
    const url = await upload(path, it.img.buffer);
    await sbRequest('POST', 'ig_posts', {
      body: { publish_at: it.when.toISOString(), image_path: path, image_url: url, caption: it.tekst, status: 'gepland' },
    });
    console.log(`Ingepland: ${formatWhen(it.when)}  ${it.foto}`);
  }
  console.log(`\n${items.length} post(s) ingepland. Ze staan nu in de planner.`);
}

main().catch((err) => {
  console.log(`FOUT: ${err.message}`);
  process.exitCode = 1;
});
