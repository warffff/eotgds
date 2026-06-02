import { CONFIG } from '../lib/env.js';

export default async function handler(req, res) {
  const target = CONFIG.steamJoinUrl();
  res.statusCode = 302;
  res.setHeader('location', target);
  res.setHeader('cache-control', 'no-store');
  res.end(`Redirecting to ${target}`);
}
