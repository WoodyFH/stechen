// PWA-Check: Manifest, Service Worker, Offline-Start unter /stechen/ und Update-Verhalten
// (neue Versionsnummer -> neuer Cache, alter wird gelöscht, Spielstand bleibt).
// Aufruf: npm run check-pwa
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = path.join(ROOT, 'version.js');
const PORT = 4178;
const BASE = `http://localhost:${PORT}/stechen/`;
let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✔' : '✖'} ${msg}`);
  if (!cond) fails++;
};

const original = await readFile(VERSION_FILE, 'utf8');
const server = await startServer(PORT);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(async () => {
    await page.reload();
  });
  const v1 = await page.evaluate(() => globalThis.STECHEN_VERSION);
  let keys = await page.evaluate(() => caches.keys());
  ok(keys.includes(`stechen-v${v1}`), `Cache stechen-v${v1} angelegt (${keys.join(', ')})`);

  // Manifest
  const mf = await (await page.request.get(BASE + 'manifest.webmanifest')).json();
  ok(mf.display === 'standalone' && mf.orientation === 'portrait', 'Manifest: standalone + Hochformat');
  ok(mf.start_url === './' && mf.scope === './', 'Manifest: relative start_url/scope');
  for (const icon of mf.icons) {
    const res = await page.request.get(new URL(icon.src, BASE).href);
    ok(res.ok(), `Icon erreichbar: ${icon.src}`);
  }
  const apple = await page.evaluate(() => document.querySelector('link[rel=apple-touch-icon]')?.href);
  ok(apple && (await page.request.get(apple)).ok(), 'apple-touch-icon erreichbar');

  // Spiel starten, Zustand liegt im localStorage
  await page.locator('.name-field input').first().fill('Anna');
  await page.click('.cta');
  await page.waitForSelector('.board[data-phase=dealer]');
  await page.click('.cell[data-i="0"]');
  await page.waitForSelector('.board[data-phase=bid]');

  // Offline neu laden: App und Spielstand müssen da sein
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.board[data-phase=bid]', { timeout: 8000 });
  ok(true, 'Offline: App startet und Spielstand ist wieder da');
  const nav = await page.evaluate(async () => (await fetch('./js/logic.js')).ok);
  ok(nav, 'Offline: Module kommen aus dem Cache');
  await ctx.setOffline(false);

  // Update: Versionsnummer hochzählen, Seite öffnen -> automatischer Reload, alter Cache weg
  const next = Number(v1) + 1;
  await writeFile(VERSION_FILE, original.replace(/STECHEN_VERSION = \d+/, `STECHEN_VERSION = ${next}`));
  const navigated = page.waitForEvent('load', { timeout: 15000 }).catch(() => null);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await navigated;
  await page.waitForFunction((n) => globalThis.STECHEN_VERSION === n, next, { timeout: 15000 }).catch(() => {});
  const v2 = await page.evaluate(() => globalThis.STECHEN_VERSION);
  ok(v2 === next, `Update übernommen (Version ${v1} -> ${v2})`);
  keys = await page.evaluate(() => caches.keys());
  ok(keys.length === 1 && keys[0] === `stechen-v${next}`, `Alter Cache gelöscht (${keys.join(', ')})`);
  await page.waitForSelector('.board[data-phase=bid]');
  ok(true, 'Spielstand nach Update erhalten');
  ok(errors.length === 0, `Keine Seitenfehler ${errors.join('|')}`);
} finally {
  await writeFile(VERSION_FILE, original);
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} Fehler` : '\nPWA in Ordnung');
process.exitCode = fails ? 1 : 0;
