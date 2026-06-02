import { readJson, sendJson, getHeader } from '../lib/http.js';
import { CONFIG } from '../lib/env.js';
import { kvGet, kvSet, kvDel } from '../lib/kv.js';
import { buildDiscordPayload } from '../lib/embed.js';
import { generateChartPng } from '../lib/chart.js';
import { createStatusMessage, editStatusMessage } from '../lib/discord.js';

const KEY_LAST = 'eotg:discord-status:last';
const KEY_HISTORY = 'eotg:discord-status:history';
const KEY_MESSAGE = 'eotg:discord-status:message-id';
const DAY = 24 * 60 * 60 * 1000;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeStatus(body) {
  const players = Array.isArray(body.players) ? body.players : [];
  const cleanPlayers = players
    .map((p) => {
      if (typeof p === 'string') return { name: p.slice(0, 64) };
      return { name: String(p.name || '').slice(0, 64), steamid: String(p.steamid || '').slice(0, 32) };
    })
    .filter((p) => p.name);

  const online = clampNumber(body.online ?? cleanPlayers.length, 0, 256, cleanPlayers.length);
  const maxplayers = clampNumber(body.maxplayers ?? body.max ?? 100, 1, 256, 100);

  return {
    t: Date.now(),
    online,
    maxplayers,
    map: String(body.map || 'unknown').slice(0, 80),
    ip: String(body.ip || CONFIG.serverIp()).slice(0, 80),
    status: String(body.status || 'Работает').slice(0, 80),
    players: cleanPlayers,
  };
}

async function updateHistory(status) {
  const now = Date.now();
  let history = await kvGet(KEY_HISTORY, []);
  if (!Array.isArray(history)) history = [];

  history = history
    .map((p) => ({ t: Number(p.t), online: Number(p.online) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.online) && p.t >= now - DAY);

  const last = history[history.length - 1];
  if (!last || now - last.t >= 10_000 || last.online !== status.online) {
    history.push({ t: now, online: status.online });
  }

  // Keep at most 24h at 15 sec interval + small reserve.
  if (history.length > 6200) history = history.slice(history.length - 6200);
  await kvSet(KEY_HISTORY, history);
  return history;
}

async function getMessageId() {
  // Prefer Redis id so a stale DISCORD_STATUS_MESSAGE_ID does not force duplicate messages forever.
  return await kvGet(KEY_MESSAGE, '') || CONFIG.discordMessageId();
}

async function upsertDiscordMessage(payload, chartPng) {
  let messageId = await getMessageId();

  if (messageId) {
    try {
      const edited = await editStatusMessage(messageId, payload, chartPng);
      return { message: edited, created: false };
    } catch (err) {
      if (err.status !== 404 && err.status !== 403) throw err;
      await kvDel(KEY_MESSAGE);
    }
  }

  const created = await createStatusMessage(payload, chartPng);
  if (created?.id) await kvSet(KEY_MESSAGE, created.id);
  return { message: created, created: true };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'POST only' });
    }

    const body = await readJson(req);
    const secret = String(getHeader(req, 'x-eotg-secret') || body.secret || '');
    if (!secret || secret !== CONFIG.gmodSecret()) {
      return sendJson(res, 401, { ok: false, error: 'bad secret' });
    }

    const status = normalizeStatus(body);
    const history = await updateHistory(status);
    await kvSet(KEY_LAST, status);

    const payload = buildDiscordPayload(status, history);
    const chartPng = generateChartPng(history, status.maxplayers);
    const result = await upsertDiscordMessage(payload, chartPng);

    return sendJson(res, 200, {
      ok: true,
      edited: !result.created,
      message_id: result.message?.id || null,
      online: status.online,
      maxplayers: status.maxplayers,
      players: status.players.length,
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || err.status || 500, {
      ok: false,
      error: err.message || 'Internal error',
    });
  }
}
