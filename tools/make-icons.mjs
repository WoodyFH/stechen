// Erzeugt die App-Icons (SVG + PNG) mit Playwright. Einmalig ausführen: npm run icons
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
await mkdir(OUT, { recursive: true });

// scale < 1 lässt Rand für maskierbare Icons (Safe Zone).
const svg = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b0d10"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="62" y="62" width="188" height="188" rx="44" fill="#e8b04a"/>
    <rect x="262" y="62" width="188" height="188" rx="44" fill="#4fc3b0"/>
    <rect x="262" y="262" width="188" height="188" rx="44" fill="#ef7a6b"/>
    <rect x="62" y="262" width="188" height="188" rx="44" fill="#9b8cf0"/>
    <circle cx="256" cy="256" r="74" fill="#0b0d10"/>
    <circle cx="256" cy="256" r="56" fill="none" stroke="#eceff4" stroke-width="10"/>
    <circle cx="256" cy="256" r="16" fill="#eceff4"/>
  </g>
</svg>`;

await writeFile(path.join(OUT, 'icon.svg'), svg(1));

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(name, size, scale) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:#0b0d10}svg{display:block;width:${size}px;height:${size}px}</style>${svg(scale)}`,
  );
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('✔', name);
}
await png('icon-192.png', 192, 1);
await png('icon-512.png', 512, 1);
await png('icon-maskable-512.png', 512, 0.68);
await png('apple-touch-icon.png', 180, 1);
await browser.close();
