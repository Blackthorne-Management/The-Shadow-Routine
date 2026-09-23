// Cuts the round emblems out of the source art in /Emblems (JPEGs with a
// baked-in checkerboard) into transparent 512px WebPs in public/emblems/.
// Finds each emblem's red ring, crops to it and masks outside the circle.
// Run: node scripts/cut-emblems.mjs
import sharp from 'sharp';
import { readdirSync } from 'node:fs';

const SRC = 'Emblems', OUT = 'public/emblems', SIZE = 512;

for (const f of readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
  const img = sharp(`${SRC}/${f}`);
  const { data, info } = await img.clone().raw().removeAlpha().toBuffer({ resolveWithObject: true });
  // Bounding box of strongly red pixels (the ring + its glow)
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y += 2) {
    for (let x = 0; x < info.width; x += 2) {
      const i = (y * info.width + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 140 && r > g * 2 && r > b * 1.8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const r = Math.min(Math.max(x1 - x0, y1 - y0) / 2, cx, cy, info.width - cx, info.height - cy);
  const left = Math.round(cx - r), top = Math.round(cy - r), side = Math.round(r * 2);
  const mask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 1}" fill="#fff"/></svg>`);
  const name = f.replace(/\.[^.]+$/, '').toLowerCase();
  await img.extract({ left, top, width: side, height: side }).resize(SIZE, SIZE)
    .composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 82, alphaQuality: 90 })
    .toFile(`${OUT}/${name}.webp`);
  console.log(`${name}: circle r=${Math.round(r)} at ${Math.round(cx)},${Math.round(cy)}`);
}
