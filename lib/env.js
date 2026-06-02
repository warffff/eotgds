export function env(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

export function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

export const CONFIG = {
  discordToken: () => requireEnv('DISCORD_BOT_TOKEN'),
  discordChannelId: () => requireEnv('DISCORD_STATUS_CHANNEL_ID'),
  discordMessageId: () => env('DISCORD_STATUS_MESSAGE_ID'),
  gmodSecret: () => requireEnv('GMOD_STATUS_SECRET'),
  setupSecret: () => requireEnv('STATUS_SETUP_SECRET'),
  serverName: () => env('SERVER_NAME', 'Edge of the Galaxy'),
  serverIp: () => env('SERVER_CONNECT_IP', '46.174.52.149:27015'),
  publicBaseUrl: () => {
    const explicit = env('PUBLIC_BASE_URL');
    if (explicit) return explicit.replace(/\/$/, '');
    const vercelUrl = env('VERCEL_URL');
    if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, '');
    return '';
  },
  steamJoinUrl: () => env('SERVER_STEAM_JOIN_URL', `steam://connect/${env('SERVER_CONNECT_IP', '46.174.52.149:27015')}`),
  joinUrl: () => {
    const explicit = env('SERVER_JOIN_BUTTON_URL');
    if (explicit) return explicit;
    const base = CONFIG.publicBaseUrl();
    if (base) return `${base}/api/join`;
    return 'https://store.steampowered.com/about/';
  },
  contentUrl: () => env('SERVER_CONTENT_URL', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3696450773'),
};
