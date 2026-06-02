import zlib from 'node:zlib';

const W = 800;
const H = 260;
const PAD_L = 42;
const PAD_R = 22;
const PAD_T = 22;
const PAD_B = 34;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rgbaToInt(r, g, b, a = 255) {
  return [r & 255, g & 255, b & 255, a & 255];
}

function put(buf, x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const a = clamp(alpha, 0, 1) * (color[3] / 255);
  const inv = 1 - a;
  buf[i] = Math.round(color[0] * a + buf[i] * inv);
  buf[i + 1] = Math.round(color[1] * a + buf[i + 1] * inv);
  buf[i + 2] = Math.round(color[2] * a + buf[i + 2] * inv);
  buf[i + 3] = 255;
}

function rect(buf, x, y, w, h, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) put(buf, xx, yy, color, alpha);
  }
}

function line(buf, x0, y0, x1, y1, color, alpha = 1, width = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    const r = Math.max(0, Math.floor(width / 2));
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) put(buf, x + ox, y + oy, color, alpha);
    }
  }
}

const font = {
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'], '9':['111','101','111','001','111'],
  ':':['0','1','0','1','0'], 'h':['101','101','111','101','101'],
  'O':['111','101','101','101','111'], 'n':['110','101','101','101','101'],
  'l':['1','1','1','1','1'], 'i':['1','0','1','1','1'], 'e':['111','100','111','100','111'],
  ' ':['0','0','0','0','0'], '/':['001','001','010','100','100'], '-':['000','000','111','000','000'],
};

function text(buf, str, x, y, color, scale = 2, alpha = 1) {
  let cx = x;
  for (const ch of String(str)) {
    const glyph = font[ch] || font[' '];
    const gw = glyph[0].length;
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        rect(buf, cx + gx * scale, y + gy * scale, scale, scale, color, alpha);
      }
    }
    cx += (gw + 1) * scale;
  }
}

function crc32(buffer) {
  let c = ~0;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function pngEncode(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // rgba
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);
}

function normalizeHistory(history, maxPlayers) {
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const items = Array.isArray(history) ? history : [];
  const valid = items
    .map((p) => ({ t: Number(p.t || 0), online: Number(p.online || 0) }))
    .filter((p) => p.t >= start && p.t <= now && Number.isFinite(p.online));

  if (valid.length === 0) return [{ t: start, online: 0 }, { t: now, online: 0 }];
  if (valid[0].t > start) valid.unshift({ t: start, online: valid[0].online });
  if (valid[valid.length - 1].t < now) valid.push({ t: now, online: valid[valid.length - 1].online });
  return valid.map((p) => ({ ...p, online: clamp(p.online, 0, Math.max(1, maxPlayers)) }));
}

export function generateChartPng(history, maxPlayers = 100) {
  const bg = rgbaToInt(17, 21, 28, 255);
  const grid = rgbaToInt(51, 63, 82, 255);
  const axis = rgbaToInt(83, 100, 130, 255);
  const area = rgbaToInt(70, 100, 170, 255);
  const stroke = rgbaToInt(116, 143, 230, 255);
  const txt = rgbaToInt(164, 176, 204, 255);
  const buf = Buffer.alloc(W * H * 4);

  rect(buf, 0, 0, W, H, bg, 1);
  rect(buf, 0, 0, W, H, rgbaToInt(10, 14, 20, 255), 0.28);

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const points = normalizeHistory(history, maxPlayers);
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  const maxY = Math.max(5, maxPlayers, ...points.map((p) => p.online));

  for (let i = 0; i <= 5; i++) {
    const y = PAD_T + (chartH / 5) * i;
    line(buf, PAD_L, y, PAD_L + chartW, y, grid, i === 5 ? 0.8 : 0.35, 1);
    const label = String(Math.round(maxY - (maxY / 5) * i));
    text(buf, label, 8, y - 5, txt, 2, 0.75);
  }
  for (let i = 0; i <= 6; i++) {
    const x = PAD_L + (chartW / 6) * i;
    line(buf, x, PAD_T, x, PAD_T + chartH, grid, 0.25, 1);
  }

  line(buf, PAD_L, PAD_T, PAD_L, PAD_T + chartH, axis, 0.8, 1);
  line(buf, PAD_L, PAD_T + chartH, PAD_L + chartW, PAD_T + chartH, axis, 0.8, 1);

  const xy = points.map((p) => {
    const x = PAD_L + ((p.t - start) / (now - start)) * chartW;
    const y = PAD_T + chartH - (p.online / maxY) * chartH;
    return { x: clamp(x, PAD_L, PAD_L + chartW), y: clamp(y, PAD_T, PAD_T + chartH), online: p.online };
  });

  // Filled area under line.
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const x0 = Math.floor(Math.min(a.x, b.x));
    const x1 = Math.ceil(Math.max(a.x, b.x));
    for (let x = x0; x <= x1; x++) {
      const t = (x - a.x) / ((b.x - a.x) || 1);
      const y = a.y + (b.y - a.y) * clamp(t, 0, 1);
      line(buf, x, y, x, PAD_T + chartH, area, 0.34, 1);
    }
  }

  for (let i = 0; i < xy.length - 1; i++) {
    line(buf, xy[i].x, xy[i].y, xy[i + 1].x, xy[i + 1].y, stroke, 0.95, 3);
  }

  // X-axis labels: 0h, 6h, 12h, 18h, 24h.
  const labels = ['0h', '6h', '12h', '18h', '24h'];
  for (let i = 0; i < labels.length; i++) {
    const x = PAD_L + (chartW / 4) * i - 8;
    text(buf, labels[i], x, PAD_T + chartH + 12, txt, 2, 0.72);
  }

  // Legend.
  rect(buf, W / 2 - 38, 8, 26, 4, stroke, 0.9);
  text(buf, 'Online', W / 2 - 6, 4, txt, 2, 0.8);

  return pngEncode(buf, W, H);
}
