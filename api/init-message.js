import { sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvGet, kvSet } from '../lib/kv.js';
import { buildDiscordPayload } from '../lib/embed.js';
import { generateChartPng } from '../lib/chart.js';
import { createStatusMessage, editStatusMessage } from '../lib/discord.js';

const KEY_LAST = 'eotg:discord-status:last';
const KEY_HISTORY = 'eotg:discord-status:history';
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

    const now = Date.now();
    const status = await kvGet(KEY_LAST, {
      t: now,
      online: 0,
      maxplayers: 100,
      map: 'ожидание данных',
      ip: CONFIG.serverIp(),
      status: 'Ожидание данных от сервера',
      players: [],
    });

    let history = await kvGet(KEY_HISTORY, []);
    if (!Array.isArray(history) || history.length === 0) {
      history = [{ t: now - 24 * 60 * 60 * 1000, online: 0 }, { t: now, online: status.online || 0 }];
      await kvSet(KEY_HISTORY, history);
    }

    const payload = buildDiscordPayload(status, history);
    const chartPng = generateChartPng(history, status.maxplayers || 100);

    const envMessageId = CONFIG.discordMessageId();
    const kvMessageId = await kvGet(KEY_MESSAGE, '');
    const messageId = envMessageId || kvMessageId;

    let message;
    let created = false;
    if (messageId) {
      message = await editStatusMessage(messageId, payload, chartPng);
    } else {
      message = await createStatusMessage(payload, chartPng);
      created = true;
      if (message?.id) await kvSet(KEY_MESSAGE, message.id);
    }

    return sendJson(res, 200, {
      ok: true,
      created,
      message_id: message?.id || null,
      hint: created ? 'Сохранил message_id в Redis. Можно не заполнять DISCORD_STATUS_MESSAGE_ID.' : 'Существующее сообщение отредактировано.',
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { ok: false, error: err.message || 'Internal error' });
  }
}
