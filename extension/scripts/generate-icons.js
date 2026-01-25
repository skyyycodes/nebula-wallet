/**
 * Generate placeholder icons for the extension
 * Run with: node scripts/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create simple PNG icons using Canvas-like approach
// These are minimal valid PNG files with a simple design

function createPNG(size) {
  // PNG header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData.writeUInt8(8, 8);        // bit depth
  ihdrData.writeUInt8(6, 9);        // color type (RGBA)
  ihdrData.writeUInt8(0, 10);       // compression
  ihdrData.writeUInt8(0, 11);       // filter
  ihdrData.writeUInt8(0, 12);       // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // Create image data (simple gradient with quantum symbol)
  const rawData = [];

  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = size / 2;

      // Create circular gradient background
      const t = Math.min(dist / maxDist, 1);
      const r = Math.round(102 + (118 - 102) * t);  // #667eea to #764ba2
      const g = Math.round(126 + (75 - 126) * t);
      const b = Math.round(234 + (162 - 234) * t);

      // Add atom-like symbol in center
      const innerRadius = size * 0.15;
      const orbitRadius = size * 0.3;
      const lineWidth = size * 0.08;

      let alpha = 255;

      // Central dot
      if (dist < innerRadius) {
        rawData.push(255, 255, 255, 255); // White center
        continue;
      }

      // Orbit rings (simplified)
      const ring1Dist = Math.abs(dist - orbitRadius);
      const ring2Dist = Math.abs(dist - orbitRadius * 0.7);

      if (ring1Dist < lineWidth / 2 || ring2Dist < lineWidth / 2) {
        const ringAlpha = Math.max(0, 1 - Math.min(ring1Dist, ring2Dist) / (lineWidth / 2));
        const blendR = Math.round(r * (1 - ringAlpha) + 255 * ringAlpha);
        const blendG = Math.round(g * (1 - ringAlpha) + 255 * ringAlpha);
        const blendB = Math.round(b * (1 - ringAlpha) + 255 * ringAlpha);
        rawData.push(blendR, blendG, blendB, 255);
        continue;
      }

      // Circular mask
      if (dist > maxDist) {
        alpha = 0;
      }

      rawData.push(r, g, b, alpha);
    }
  }

  // Compress with zlib (using simple deflate)
  const { deflateSync } = await import('zlib');
  const compressed = deflateSync(Buffer.from(rawData));

  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = makeCrcTable();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

// Generate icons
console.log('Generating extension icons...');

// For simplicity, create placeholder files that indicate icons should be created
const sizes = [16, 48, 128];

for (const size of sizes) {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
  </defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="url(#grad)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.15}" fill="white"/>
  <ellipse cx="${size/2}" cy="${size/2}" rx="${size*0.35}" ry="${size*0.15}" fill="none" stroke="white" stroke-width="${size*0.05}" transform="rotate(45 ${size/2} ${size/2})"/>
  <ellipse cx="${size/2}" cy="${size/2}" rx="${size*0.35}" ry="${size*0.15}" fill="none" stroke="white" stroke-width="${size*0.05}" transform="rotate(-45 ${size/2} ${size/2})"/>
</svg>`;

  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svgContent);
  console.log(`Created icon${size}.svg`);
}

console.log('\nNote: Convert SVG to PNG using a tool like Inkscape or online converter.');
console.log('For quick testing, you can use SVG icons directly in manifest.json');
