import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes the built asset list into dist/sw.js so the service worker precaches
 * the whole app shell (JS, CSS, font) at install time, and derives the cache
 * version from the build so every deploy gets a fresh cache automatically.
 * Only the core Latin font subset is precached; others (latin-ext, cyrillic…) load on demand.
 */
function swPrecache(): Plugin {
  return {
    name: 'sw-precache',
    apply: 'build',
    writeBundle(options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/'))
        .filter((f) => !f.endsWith('.woff2') || /-latin-wght-normal/.test(f))
        .sort()
        .map((f) => `/${f}`);
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const swPath = join(options.dir!, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(files)};`);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), swPrecache()],
  server: { port: 5173 },
});
