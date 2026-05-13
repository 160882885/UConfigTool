const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  const expected = Buffer.from([137,80,78,71,13,10,26,10]);
  if (!signature.equals(expected)) throw new Error('Invalid PNG signature');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const data = buffer.subarray(offset, offset + len); offset += len;
    offset += 4;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  const stride = width * 4;
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const rowData = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const outRow = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? out[outRow + x - 4] : 0;
      const up = y > 0 ? out[outRow - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? out[outRow - stride + x - 4] : 0;
      let val = rowData[x];

      if (filter === 1) val = (val + left) & 0xff;
      else if (filter === 2) val = (val + up) & 0xff;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) val = (val + paeth(left, up, upLeft)) & 0xff;

      out[outRow + x] = val;
    }
  }

  return { width, height, rgba: out };
}

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

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

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
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function blendPixel(buf, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const dstA = buf[i + 3] / 255;
  const srcA = a / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  buf[i] = Math.round((r * srcA + buf[i] * dstA * (1 - srcA)) / outA);
  buf[i + 1] = Math.round((g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA);
  buf[i + 2] = Math.round((b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

function fillRoundRect(buf, size, x, y, w, h, r, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      let dx = 0;
      let dy = 0;
      if (xx < x + r) dx = x + r - xx;
      else if (xx > x + w - r - 1) dx = xx - (x + w - r - 1);
      if (yy < y + r) dy = y + r - yy;
      else if (yy > y + h - r - 1) dy = yy - (y + h - r - 1);
      if (dx * dx + dy * dy <= r * r + 1) {
        setPixel(buf, size, xx, yy, color[0], color[1], color[2], color[3]);
      }
    }
  }
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
        blendPixel(buf, size, x, y, color[0], color[1], color[2], color[3]);
      }
    }
  }
}

function paintCenterToolbox(buf, size) {
  const cx = size / 2;
  const boxW = size * 0.33;
  const boxH = size * 0.20;
  const boxX = Math.round(cx - boxW / 2);
  const boxY = Math.round(size * 0.45);
  const lidH = Math.max(3, Math.round(boxH * 0.36));

  // erase center icon area softly by overlaying tinted layer
  fillCircle(buf, size, cx, size * 0.53, size * 0.24, [28, 42, 68, 210]);

  fillRoundRect(buf, size, boxX, boxY, Math.round(boxW), Math.round(boxH), Math.max(2, Math.round(size * 0.03)), [83, 164, 238, 245]);
  fillRoundRect(buf, size, boxX, boxY, Math.round(boxW), lidH, Math.max(2, Math.round(size * 0.025)), [120, 204, 255, 250]);

  const handleW = Math.max(4, Math.round(boxW * 0.30));
  const handleH = Math.max(3, Math.round(boxH * 0.20));
  fillRoundRect(
    buf,
    size,
    Math.round(cx - handleW / 2),
    Math.round(boxY - handleH * 0.85),
    handleW,
    handleH,
    Math.max(1, Math.round(size * 0.013)),
    [202, 239, 255, 255]
  );

  fillRoundRect(
    buf,
    size,
    Math.round(cx - boxW * 0.06),
    Math.round(boxY + boxH * 0.52),
    Math.max(2, Math.round(boxW * 0.12)),
    Math.max(2, Math.round(boxH * 0.22)),
    Math.max(1, Math.round(size * 0.01)),
    [216, 244, 255, 255]
  );
}

function nearestSample(srcRgba, srcW, srcH, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y += 1) {
    for (let x = 0; x < dstSize; x += 1) {
      const sx = Math.min(srcW - 1, Math.floor((x / dstSize) * srcW));
      const sy = Math.min(srcH - 1, Math.floor((y / dstSize) * srcH));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstSize + x) * 4;
      dst[di] = srcRgba[si];
      dst[di + 1] = srcRgba[si + 1];
      dst[di + 2] = srcRgba[si + 2];
      dst[di + 3] = srcRgba[si + 3];
    }
  }
  return dst;
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

  const ico = Buffer.concat([header, ...dirEntries, ...pngBuffers.map((x) => x.data)]);
  fs.writeFileSync(outPath, ico);
}

const basePath = path.join('build', 'base-icon', 'electron-base.png');
const basePng = fs.readFileSync(basePath);
const decoded = decodePng(basePng);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = [];

for (const size of sizes) {
  const rgba = nearestSample(decoded.rgba, decoded.width, decoded.height, size);
  paintCenterToolbox(rgba, size);
  const png = encodePng(size, size, rgba);
  const outPng = path.join('build', 'icons', `icon-${size}.png`);
  fs.writeFileSync(outPng, png);
  pngBuffers.push({ size, data: png });
}

fs.copyFileSync(path.join('build', 'icons', 'icon-256.png'), path.join('build', 'icon.png'));
writeIco(pngBuffers, path.join('build', 'icon.ico'));

console.log('Generated icon from Electron base, replacing center with app.');
