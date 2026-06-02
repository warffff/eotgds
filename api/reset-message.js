import { sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvDel } from '../lib/kv.js';

const KEY_MESSAGE = 'eotg:discord-status:message-id';

function getQuerySecret(req) {
  try {
    const u = new URL(req.url, 'https://local');
    return u.searchParams.get('secret') || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  try {
    const secret = String(getHeader(req, 'x-setup-secret') || getQuerySecret(req) || '');
    if (!secret || secret !== CONFIG.setupSecret()) {
      return sendJson(res, 401, { ok: false, error: 'bad setup secret' });
    }

    await kvDel(KEY_MESSAGE);
    return sendJson(res, 200, {
      ok: true,
      hint: 'message_id очищен из Redis. Теперь открой /api/init-message?secret=STATUS_SETUP_SECRET, чтобы создать новое сообщение.',
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || err.status || 500, { ok: false, error: err.message || 'Internal error' });
  }
}
