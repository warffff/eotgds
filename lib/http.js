export function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error('Invalid JSON body');
    e.statusCode = 400;
    throw e;
  }
}

export function getHeader(req, name) {
  return req.headers[String(name).toLowerCase()] || req.headers[name] || '';
}
