import { sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvSet } from '../lib/kv.js';

const KEY_MESSAGE = 'eotg:discord-status:message-id';

function getUrl(req) {
  return new URL(req.url, 'https://local');
}

function getQuerySecret(req) {
  try { return getUrl(req).searchParams.get('secret') || ''; } catch { return ''; }
}

function getQueryMessageId(req) {
  try { return getUrl(req).searchParams.get('message_id') || getUrl(req).searchParams.get('id') || ''; } catch { return ''; }
}

export default async function handler(req, res) {
  try {
    const secret = String(getHeader(req, 'x-setup-secret') || getQuerySecret(req) || '');
    if (!secret || secret !== CONFIG.setupSecret()) {
      return sendJson(res, 401, { ok: false, error: 'bad setup secret' });
    }

    const messageId = String(getQueryMessageId(req) || '').trim();
    if (!/^\d{15,25}$/.test(messageId)) {
      return sendJson(res, 400, { ok: false, error: 'Передай id сообщения: /api/set-message?secret=STATUS_SETUP_SECRET&id=1511500786105057371' });
    }

    await kvSet(KEY_MESSAGE, messageId);
    return sendJson(res, 200, {
      ok: true,
      message_id: messageId,
      hint: 'message_id сохранён в Redis. Для максимальной надёжности также добавь DISCORD_STATUS_MESSAGE_ID с этим же id в Vercel env и сделай Redeploy.',
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || err.status || 500, { ok: false, error: err.message || 'Internal error' });
  }
}
