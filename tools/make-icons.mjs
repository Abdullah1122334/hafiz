// Renders the PNG app icons from the SVG logo using Playwright's Chromium.
// Usage: npx playwright@1 --version >/dev/null && node tools/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets/icons/favicon.svg'), 'utf8');
// Full-bleed variant for "maskable" icons: Android crops it to a circle/squircle.
const maskable = svg.replace('rx="16"', 'rx="0"').replace('<path', '<g transform="translate(32 32) scale(.72) translate(-32 -32)"><path').replace('</svg>', '</g></svg>');

const jobs = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['apple-touch-icon.png', maskable, 180],
  ['maskable-512.png', maskable, 512],
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, source, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, 'assets/icons', name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
