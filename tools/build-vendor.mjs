// Rebuilds vendor/firebase.js and copies the IBM Plex Sans Arabic font files.
// Usage: npm install && npm run vendor
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fbVersion = JSON.parse(readFileSync(join(root, 'node_modules/firebase/package.json'), 'utf8')).version;

await build({
  entryPoints: [join(root, 'tools/firebase-entry.js')],
  outfile: join(root, 'vendor/firebase.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'none',
  banner: { js: `/* Firebase JS SDK v${fbVersion} (Apache-2.0) - bundled for Hafiz */` },
});

const fontDir = join(root, 'node_modules/@fontsource/ibm-plex-sans-arabic/files');
mkdirSync(join(root, 'assets/fonts'), { recursive: true });
for (const subset of ['arabic', 'latin']) {
  for (const weight of [400, 500, 600, 700]) {
    const name = `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`;
    copyFileSync(join(fontDir, name), join(root, 'assets/fonts', name));
  }
}
console.log(`vendor/firebase.js built from firebase@${fbVersion}; fonts copied.`);
