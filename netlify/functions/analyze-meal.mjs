/* analyze-meal — estimate what is in a meal, from a photo or a short description.
 *
 * The one place the app talks to an AI model, and only for the "Log a meal"
 * window. The prompt is fixed here on the server: a caller can send a photo or
 * a description of food and nothing else, so the key cannot be used as a
 * general-purpose chatbot.
 *
 * Settings (Netlify → Site configuration → Environment variables):
 *   GEMINI_API_KEY   required. Never put it in the site's code.
 *   GEMINI_MODEL     optional, defaults to DEFAULT_MODEL below.
 *   AI_DAILY_LIMIT   optional, analyses per account per day (default 30).
 *
 * Who may call it: only someone signed in to BodyKaLogic. Their Supabase token
 * is checked, and each successful analysis is recorded in public.ai_usage
 * (see supabase/schema.sql) to enforce the daily limit.
 */

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

// The project URL and its publishable key are public by design (they also ship
// in src/config.js); row-level security is what protects the data.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dptouuhjswganghwvmfe.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_V6VYO2rptAW7s05rxeSZ1w_yQ9UO46y';

const MAX_TEXT = 500;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const INSTRUCTIONS = [
  'You are a nutrition assistant inside a fitness app. Identify the foods in the meal and estimate each one.',
  'Rules:',
  '- Only describe food and drink. If the input is not a meal (or is a request for anything else), return an empty items list and explain briefly in "note".',
  '- One item per distinct food. Use everyday names, e.g. "Chicken biryani", "Roti", "Dal tadka", "Boiled egg".',
  '- quantity + unit: use "piece" for countable things (rotis, eggs, idlis, slices), "ml" for drinks, otherwise "g".',
  '- kcal, protein_g, carbs_g, fat_g are totals for that quantity, not per 100 g.',
  '- Estimate typical home or restaurant portions when amounts are not stated. Account for visible oil, ghee and sauces.',
  '- meal_name: a short name for the whole meal.',
  '- confidence: "low" if the photo is unclear or portions are hard to judge.'
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    meal_name: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    note: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string', enum: ['g', 'ml', 'piece'] },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' }
        },
        required: ['name', 'quantity', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g']
      }
    }
  },
  required: ['meal_name', 'items']
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function env(name) {
  if (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get) return Netlify.env.get(name);
  return process.env[name];
}

async function supabase(path, token, init = {}) {
  return fetch(SUPABASE_URL + path, {
    ...init,
    headers: { apikey: SUPABASE_ANON, authorization: 'Bearer ' + token,
               'content-type': 'application/json', ...(init.headers || {}) }
  });
}

/* The answer text, wherever this API version puts it. The Interactions API is
 * read through SDK accessors in Google's docs, so the wire shape is checked in
 * every form it has been seen in, then by searching for the JSON itself. */
export function extractJson(body) {
  const tryParse = (s) => {
    if (typeof s !== 'string') return null;
    const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    try { const v = JSON.parse(t); return v && Array.isArray(v.items) ? v : null; } catch { return null; }
  };
  const direct = [
    body && body.output_text,
    body && body.outputText,
    body && body.candidates && body.candidates[0] && body.candidates[0].content &&
      body.candidates[0].content.parts && body.candidates[0].content.parts.map((p) => p.text || '').join('')
  ];
  for (const s of direct) { const v = tryParse(s); if (v) return v; }
  if (body && Array.isArray(body.items)) return body;

  // Anything else: walk the response and take the first string that is our JSON.
  const seen = new Set();
  const stack = [body];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const v of Object.values(node)) {
      if (typeof v === 'string') { const parsed = tryParse(v); if (parsed) return parsed; }
      else if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

function clean(result) {
  const num = (v, max) => Math.min(max, Math.max(0, Math.round((Number(v) || 0) * 10) / 10));
  const items = (Array.isArray(result.items) ? result.items : []).slice(0, 15).map((it) => ({
    name: String(it.name || 'Food').slice(0, 60),
    quantity: num(it.quantity, 5000),
    unit: ['g', 'ml', 'piece'].includes(it.unit) ? it.unit : 'g',
    kcal: num(it.kcal, 5000),
    protein_g: num(it.protein_g, 500),
    carbs_g: num(it.carbs_g, 1000),
    fat_g: num(it.fat_g, 500)
  })).filter((it) => it.quantity > 0);
  return {
    meal_name: String(result.meal_name || '').slice(0, 60),
    confidence: ['low', 'medium', 'high'].includes(result.confidence) ? result.confidence : 'medium',
    note: String(result.note || '').slice(0, 240),
    items
  };
}

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const key = env('GEMINI_API_KEY');
  if (!key) return json(503, { error: 'not_configured' });

  // ---- who is asking
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'signed_out' });
  const who = await supabase('/auth/v1/user', token).catch(() => null);
  if (!who || !who.ok) return json(401, { error: 'signed_out' });

  // ---- what they sent
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_request' }); }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!text === !image) return json(400, { error: 'bad_request' });
  if (text.length > MAX_TEXT) return json(400, { error: 'too_long' });
  let mime = null, data = null;
  if (image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!m) return json(400, { error: 'bad_image' });
    mime = m[1]; data = m[2];
    if (data.length * 0.75 > MAX_IMAGE_BYTES) return json(413, { error: 'image_too_large' });
  }

  // ---- daily limit
  const limit = Number(env('AI_DAILY_LIMIT')) || 30;
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const counted = await supabase('/rest/v1/ai_usage?select=id&created_at=gte.' + since.toISOString(), token, {
    headers: { prefer: 'count=exact', range: '0-0' }
  }).catch(() => null);
  if (!counted || !counted.ok) return json(500, { error: 'usage_unavailable' });
  const used = Number(((counted.headers.get('content-range') || '').split('/')[1]) || 0);
  if (used >= limit) return json(429, { error: 'daily_limit', limit });

  // ---- ask the model
  const input = [{ type: 'text', text: INSTRUCTIONS + '\n\n' +
    (text ? 'The user described their meal as: """' + text + '"""' : 'Analyse the meal in this photo.') }];
  if (data) input.push({ type: 'image', data, mime_type: mime });

  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json', 'api-revision': API_REVISION },
      body: JSON.stringify({
        model: env('GEMINI_MODEL') || DEFAULT_MODEL,
        input,
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA }
      })
    });
  } catch {
    return json(502, { error: 'ai_unreachable' });
  }
  if (res.status === 429) return json(503, { error: 'ai_busy' });
  const reply = await res.json().catch(() => null);
  if (!res.ok) {
    // Logged for the site owner (Netlify → Logs → Functions); never includes the key.
    console.error('Gemini error', res.status, JSON.stringify(reply && reply.error ? reply.error : reply).slice(0, 500));
    return json(502, { error: 'ai_failed', status: res.status });
  }
  const found = reply && extractJson(reply);
  if (!found) {
    console.error('Gemini reply had no usable JSON', JSON.stringify(reply).slice(0, 500));
    return json(502, { error: 'ai_unreadable' });
  }

  // Count it only once it has worked.
  await supabase('/rest/v1/ai_usage', token, { method: 'POST', body: '{}', headers: { prefer: 'return=minimal' } })
    .catch(() => null);

  return json(200, { ...clean(found), remaining: Math.max(0, limit - used - 1), limit });
}

export const config = { path: '/api/analyze-meal' };
