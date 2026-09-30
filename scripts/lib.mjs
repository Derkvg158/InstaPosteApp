// Gedeelde hulpfuncties voor de Instagram-scripts.

export const API_VERSION = process.env.IG_API_VERSION || 'v26.0';
export const API_BASE = `https://graph.instagram.com/${API_VERSION}`;

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

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Omgevingsvariabele ${name} ontbreekt (zet hem als GitHub-secret).`);
  }
  return value;
}

/** Aanroep naar de Supabase REST API met de secret key (omzeilt RLS). */
export async function sbRequest(method, path, { body, prefer } = {}) {
  const base = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requireEnv('SUPABASE_SECRET_KEY');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Oude service_role-sleutels (JWT) moeten ook als Bearer mee.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} mislukt (HTTP ${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
