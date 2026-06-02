const memory = new Map();

function getKvUrl() {
  return (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
}

function getKvToken() {
  return process.env.KV_REST_API_TOKEN || '';
}

async function kvCommand(args) {
  const url = getKvUrl();
  const token = getKvToken();

  if (!url || !token) {
    const cmd = String(args[0] || '').toUpperCase();
    if (cmd === 'GET') return memory.has(args[1]) ? memory.get(args[1]) : null;
    if (cmd === 'SET') {
      memory.set(args[1], args[2]);
      return 'OK';
    }
    if (cmd === 'DEL') {
      memory.delete(args[1]);
      return 1;
    }
    return null;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }

  if (!response.ok) {
    throw new Error(`KV error ${response.status}: ${text}`);
  }

  if (json && Object.prototype.hasOwnProperty.call(json, 'result')) return json.result;
  return json;
}

export async function kvGet(key, fallback = null) {
  const value = await kvCommand(['GET', key]);
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

export async function kvSet(key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return kvCommand(['SET', key, serialized]);
}

export async function kvDel(key) {
  return kvCommand(['DEL', key]);
}
