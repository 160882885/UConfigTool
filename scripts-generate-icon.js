const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function setPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function blendPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  const i = (y * size + x) * 4;
  const dstA = buf[i + 3] / 255;
  const srcA = a / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return;
  }

  const outR = (r * srcA + buf[i] * dstA * (1 - srcA)) / outA;
  const outG = (g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA;
  const outB = (b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA;

  buf[i] = Math.round(outR);
  buf[i + 1] = Math.round(outG);
  buf[i + 2] = Math.round(outB);
  buf[i + 3] = Math.round(outA * 255);
}

function fillCircle(buf, size, cx, cy, radius, color) {
  const r2 = radius * radius;
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(buf, size, x, y, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function strokeCircle(buf, size, cx, cy, radius, thickness, color) {
  const outer = radius;
  const inner = Math.max(0, radius - thickness);
  const outer2 = outer * outer;
  const inner2 = inner * inner;
  const minX = Math.floor(cx - outer);
  const maxX = Math.ceil(cx + outer);
  const minY = Math.floor(cy - outer);
  const maxY = Math.ceil(cy + outer);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= outer2 && d2 >= inner2) {
        setPixel(buf, size, x, y, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function fillRoundedRect(buf, size, x, y, w, h, radius, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      let dx = 0;
      let dy = 0;
      if (xx < x + radius) dx = x + radius - xx;
      else if (xx > x + w - radius - 1) dx = xx - (x + w - radius - 1);
      if (yy < y + radius) dy = y + radius - yy;
      else if (yy > y + h - radius - 1) dy = yy - (y + h - radius - 1);
      if (dx * dx + dy * dy <= radius * radius + 1) {
        setPixel(buf, size, xx, yy, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function drawLine(buf, size, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) {
    fillCircle(buf, size, x0, y0, thickness / 2, color);
    return;
  }

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    fillCircle(buf, size, x, y, thickness / 2, color);
  }
}

function applyRadialGlow(buf, size, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) {
        continue;
      }
      const a = Math.max(0, 1 - d / radius);
      blendPixel(buf, size, x, y, color[0], color[1], color[2], Math.round(color[3] * a));
    }
  }
}

function drawModernToolboxIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0);

  const cx = size / 2;
  const cy = size / 2;
  const baseR = size * 0.43;

  fillCircle(buf, size, cx, cy, baseR, [20, 39, 66, 255]);
  applyRadialGlow(buf, size, cx - size * 0.14, cy - size * 0.14, size * 0.55, [85, 194, 255, 140]);
  applyRadialGlow(buf, size, cx + size * 0.16, cy + size * 0.18, size * 0.42, [28, 111, 255, 130]);
  strokeCircle(buf, size, cx, cy, baseR, Math.max(2, size * 0.028), [120, 225, 255, 220]);

  const boxW = size * 0.44;
  const boxH = size * 0.24;
  const boxX = cx - boxW / 2;
  const boxY = cy - boxH * 0.10;
  const lidH = boxH * 0.32;

  fillRoundedRect(buf, size, Math.round(boxX), Math.round(boxY), Math.round(boxW), Math.round(boxH), Math.max(2, size * 0.05), [46, 87, 138, 255]);
  fillRoundedRect(buf, size, Math.round(boxX), Math.round(boxY), Math.round(boxW), Math.round(lidH), Math.max(2, size * 0.04), [78, 146, 218, 255]);

  const handleW = boxW * 0.26;
  const handleH = boxH * 0.20;
  fillRoundedRect(
    buf,
    size,
    Math.round(cx - handleW / 2),
    Math.round(boxY - handleH * 0.75),
    Math.round(handleW),
    Math.round(handleH),
    Math.max(1, size * 0.025),
    [171, 238, 255, 245]
  );

  const lockW = boxW * 0.12;
  const lockH = boxH * 0.22;
  fillRoundedRect(
    buf,
    size,
    Math.round(cx - lockW / 2),
    Math.round(boxY + boxH * 0.52),
    Math.round(lockW),
    Math.round(lockH),
    Math.max(1, size * 0.02),
    [178, 230, 255, 250]
  );

  const orbitR = size * 0.31;
  const p1x = cx - orbitR * 0.92;
  const p1y = cy + orbitR * 0.05;
  const p2x = cx + orbitR * 0.94;
  const p2y = cy + orbitR * 0.18;
  const p3x = cx - orbitR * 0.08;
  const p3y = cy - orbitR * 1.02;

  drawLine(buf, size, p1x, p1y, p2x, p2y, Math.max(2, size * 0.03), [137, 237, 255, 210]);
  drawLine(buf, size, p1x, p1y, p3x, p3y, Math.max(2, size * 0.028), [116, 215, 255, 190]);
  drawLine(buf, size, p3x, p3y, p2x, p2y, Math.max(2, size * 0.028), [99, 194, 255, 175]);

  fillCircle(buf, size, p1x, p1y, Math.max(1.3, size * 0.045), [187, 245, 255, 255]);
  fillCircle(buf, size, p2x, p2y, Math.max(1.3, size * 0.04), [159, 236, 255, 245]);
  fillCircle(buf, size, p3x, p3y, Math.max(1.2, size * 0.036), [139, 230, 255, 240]);

  return buf;
}

function writeIco(pngBuffers, outPath) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = item.size === 256 ? 0 : item.size;
    entry[1] = item.size === 256 ? 0 : item.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += item.data.length;
    dirEntries.push(entry);
  }

  const file = Buffer.concat([header, ...dirEntries, ...pngBuffers.map((x) => x.data)]);
  fs.writeFileSync(outPath, file);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = [];

for (const size of sizes) {
  const rgba = drawModernToolboxIcon(size);
  const png = writePng(size, size, rgba);
  const out = path.join('build', 'icons', `icon-${size}.png`);
  fs.writeFileSync(out, png);
  pngBuffers.push({ size, data: png });
}

fs.copyFileSync(path.join('build', 'icons', 'icon-256.png'), path.join('build', 'icon.png'));
writeIco(pngBuffers, path.join('build', 'icon.ico'));
console.log('Generated modern icon: build/icon.ico and PNG variants in build/icons');
