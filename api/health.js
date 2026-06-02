import { sendJson } from '../lib/http.js';
import { kvGet } from '../lib/kv.js';

export default async function handler(req, res) {
  const last = await kvGet('eotg:discord-status:last', null);
  const messageId = await kvGet('eotg:discord-status:message-id', null);
  return sendJson(res, 200, {
    ok: true,
    last,
    message_id: messageId,
    now: Date.now(),
  });
}
