import { CONFIG } from './env.js';

const API = 'https://discord.com/api/v10';

function discordHeaders() {
  return {
    authorization: `Bot ${CONFIG.discordToken()}`,
  };
}

async function discordFetch(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...discordHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!response.ok) {
    const err = new Error(`Discord API ${response.status}: ${text}`);
    err.status = response.status;
    err.discord = json;
    throw err;
  }

  return json;
}

function buildMultipart(payload, chartPng) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([chartPng], { type: 'image/png' }), 'online-chart.png');
  return form;
}

export async function createStatusMessage(payload, chartPng) {
  const channelId = CONFIG.discordChannelId();
  const form = buildMultipart(payload, chartPng);
  return discordFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: form,
  });
}

export async function editStatusMessage(messageId, payload, chartPng) {
  const channelId = CONFIG.discordChannelId();
  const form = buildMultipart(payload, chartPng);
  return discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: form,
  });
}
