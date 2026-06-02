import { sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvGet, kvSet, kvDel } from '../lib/kv.js';
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

    // Prefer Redis message id over env. This prevents a stale DISCORD_STATUS_MESSAGE_ID
    // from causing duplicate messages forever after the first auto-recreate.
    const kvMessageId = await kvGet(KEY_MESSAGE, '');
    const envMessageId = CONFIG.discordMessageId();
    const messageId = kvMessageId || envMessageId;

    let message;
    let created = false;
    let recreated = false;

    if (messageId) {
      try {
        message = await editStatusMessage(messageId, payload, chartPng);
      } catch (err) {
        // 404 Unknown Message means the saved message id points to a deleted message
        // or to a message from another channel. 403 can happen if the bot lost access.
        // In both cases, create a new status message and save its id.
        if (err.status !== 404 && err.status !== 403) throw err;
        await kvDel(KEY_MESSAGE);
        message = await createAndSaveMessage(payload, chartPng);
        created = true;
        recreated = true;
      }
    } else {
      message = await createAndSaveMessage(payload, chartPng);
      created = true;
    }

    return sendJson(res, 200, {
      ok: true,
      created,
      recreated,
      message_id: message?.id || null,
      hint: recreated
        ? 'Старый message_id был недействительным, создал новое сообщение и сохранил его в Redis. Если DISCORD_STATUS_MESSAGE_ID задан в Vercel env, удали его или замени на новый message_id.'
        : (created ? 'Сохранил message_id в Redis. Можно не заполнять DISCORD_STATUS_MESSAGE_ID.' : 'Существующее сообщение отредактировано.'),
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || err.status || 500, { ok: false, error: err.message || 'Internal error' });
  }
}
