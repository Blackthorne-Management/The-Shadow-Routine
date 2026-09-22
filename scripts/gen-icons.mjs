// Renders public/icons/icon.svg into the PNG sizes iOS/Android need.
// Run: npm run icons
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../public/icons/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir));
// iOS and maskable icons get a full-bleed square (the OS applies its own rounding)
const square = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'));

const out = (name) => fileURLToPath(new URL(name, dir));
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(square).resize(512, 512).png().toFile(out('icon-maskable-512.png'));
await sharp(square).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
console.log('icons written');
