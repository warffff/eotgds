import { CONFIG } from './env.js';

function cleanText(value, max = 2000) {
  return String(value ?? '')
    .replace(/[`*_~|<>@]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function formatTodayTime(date = new Date()) {
  const tz = process.env.STATUS_TIMEZONE || 'Europe/Moscow';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function playersText(players) {
  const list = Array.isArray(players) ? players : [];
  if (list.length === 0) return '—';
  const names = list.map((p) => cleanText(typeof p === 'string' ? p : p.name, 48)).filter(Boolean);
  let out = '';
  let hidden = 0;
  for (const name of names) {
    const line = `• **${name}**\n`;
    if ((out + line).length > 930) {
      hidden++;
      continue;
    }
    out += line;
  }
  if (hidden > 0) out += `• ...и ещё **${hidden}**\n`;
  return out || '—';
}

export function buildDiscordPayload(status, history) {
  const online = Number(status.online || 0);
  const maxPlayers = Number(status.maxplayers || status.max || 100);
  const map = cleanText(status.map || 'unknown', 64);
  const ip = cleanText(status.ip || CONFIG.serverIp(), 64);
  const isStale = Date.now() - Number(status.t || status.timestamp || Date.now()) > 120_000;
  const currentStatus = isStale ? 'Нет ответа' : cleanText(status.status || 'Работает', 32);
  const max24 = Math.max(online, ...((Array.isArray(history) ? history : []).map((p) => Number(p.online || 0))));

  const payload = {
    content: '',
    embeds: [
      {
        title: `<:warf:1503885263934460136> ${CONFIG.serverName()}`,
        color: isStale ? 0x7d8590 : 0x4d6edb,
        fields: [
          {
            name: '<:r2d2:1223481153386713119> Онлайн',
            value: `**${online}/${maxPlayers}**`,
            inline: true,
          },
          {
            name: '<:r2d2:1223481153386713119> Карта',
            value: map || '—',
            inline: true,
          },
          {
            name: '<:r2d2:1223481153386713119> Статус',
            value: currentStatus,
            inline: true,
          },
          {
            name: '🔗 IP',
            value: `\`${ip}\``,
            inline: false,
          },
          {
            name: 'Игроки на сервере',
            value: playersText(status.players),
            inline: false,
          },
          {
            name: '<:slightsmile:1230533291912990740> Макс. онлайн за 24ч',
            value: `**${max24}**`,
            inline: false,
          },
        ],
        image: {
          url: 'attachment://online-chart.png',
        },
        footer: {
          text: `Автообновление каждую минуту • Сегодня, в ${formatTodayTime()}`,
        },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: 'Подключиться к серверу',
            url: CONFIG.joinUrl(),
          },
          {
            type: 2,
            style: 5,
            label: 'Контент сервера',
            url: CONFIG.contentUrl(),
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  return payload;
}
