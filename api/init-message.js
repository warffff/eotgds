import { sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvGet, kvSet, kvDel } from '../lib/kv.js';
import { buildDiscordPayload } from '../lib/embed.js';
import { generateChartPng } from '../lib/chart.js';
import { createStatusMessage, editStatusMessage } from '../lib/discord.js';

const KEY_LAST = 'eotg:discord-status:last';
const KEY_HISTORY = 'eotg:discord-status:history';
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

async function createAndSaveMessage(payload, chartPng) {
  const message = await createStatusMessage(payload, chartPng);
  if (message?.id) await kvSet(KEY_MESSAGE, message.id);
  return message;
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

    // Priority: query id > env DISCORD_STATUS_MESSAGE_ID > Redis.
    // If env/query id is set, edit exactly that message and do not create a duplicate if it fails.
    const queryMessageId = getQueryMessageId(req).trim();
    const envMessageId = CONFIG.discordMessageId();
    const kvMessageId = await kvGet(KEY_MESSAGE, '');
    const messageId = queryMessageId || envMessageId || kvMessageId;
    const fixed = Boolean(queryMessageId || envMessageId);

    let message;
    let created = false;

    if (messageId) {
      try {
        message = await editStatusMessage(messageId, payload, chartPng);
        await kvSet(KEY_MESSAGE, messageId);
      } catch (err) {
        if (fixed) {
          err.message = `Не удалось отредактировать указанное сообщение ${messageId}. Проверь DISCORD_STATUS_CHANNEL_ID, права бота и что сообщение находится именно в этом канале. Original: ${err.message}`;
          throw err;
        }

        if (err.status !== 404 && err.status !== 403) throw err;
        await kvDel(KEY_MESSAGE);
        message = await createAndSaveMessage(payload, chartPng);
        created = true;
      }
    } else {
      message = await createAndSaveMessage(payload, chartPng);
      created = true;
    }

    return sendJson(res, 200, {
      ok: true,
      created,
      edited: !created,
      fixed_message: fixed,
      message_id: message?.id || messageId || null,
      hint: fixed
        ? 'Зафиксировал это сообщение. Дальше /api/status будет редактировать DISCORD_STATUS_MESSAGE_ID или message_id из Redis.'
        : (created ? 'Создал первое сообщение и сохранил message_id в Redis.' : 'Существующее сообщение отредактировано.'),
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || err.status || 500, { ok: false, error: err.message || 'Internal error' });
  }
}
