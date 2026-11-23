// Spieldurchlauf über die Oberfläche (2 Runden): Ansagen, Ergebnis, Meldung bei falscher Summe,
// "Trotzdem speichern", Endwertung, mehrstufiges Rückgängig. Aufruf: npm run e2e
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/stechen/`;
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✖'} ${m}`);
  if (!c) fails++;
};

const server = await startServer(PORT);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('seeded', '1');
      localStorage.setItem('stechen:v1', JSON.stringify({ settings: { players: 4, rounds: 2 }, names: ['A', 'B', 'C', 'D'], game: null, history: [] }));
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  const text = (sel) => page.locator(sel).first().innerText();

  await page.click('.cta');
  await page.click('.cell[data-i="0"]'); // A gibt, B sagt zuerst an
  await page.waitForSelector('.board[data-phase=bid]');
  ok((await text('.c-label')).includes('Runde 1 von 2'), 'Runde 1 von 2');
  ok(await page.locator('.c-hint').isVisible(), 'Hinweis „Karten an die Stirn“ in Runde 1');
  ok((await page.locator('.cell.is-active').getAttribute('data-i')) === '1', 'B ist zuerst dran');
  ok(await page.locator('.cell.is-active .btn.minus').isDisabled(), 'Minus bei 0 deaktiviert');
  await page.locator('.cell.is-active .btn.plus').click();
  ok(await page.locator('.cell.is-active .btn.plus').isDisabled(), 'Plus bei Kartenzahl deaktiviert');
  ok((await text('.dot-n')) === '0', 'Mittelpunkt zeigt 0 Rest');
  for (let i = 0; i < 4; i++) await page.locator('.cell.is-active .btn.ok').click();
  await page.waitForSelector('.board[data-phase=result]');
  ok(await page.locator('.cell.is-active').count() === 4, 'Ergebnisphase: alle Quadranten aktiv');

  // Falsche Summe: alle 1 -> 4 statt 1 Stich
  for (let i = 0; i < 4; i++) await page.locator(`.cell[data-i="${i}"] .btn.plus`).click();
  ok((await text('.pill')).includes('3 zu viel'), 'Meldung „3 zu viel“');
  ok(await page.locator('.pill').isDisabled(), 'Abschließen gesperrt bei falscher Summe');
  // korrigieren: drei Mal Minus -> 0
  for (let i = 1; i < 4; i++) await page.locator(`.cell[data-i="${i}"] .btn.minus`).click();
  ok((await text('.pill')).includes('Runde abschließen'), 'Summe passt -> Runde abschließen');
  await page.click('.pill.is-go');
  await page.waitForSelector('.board[data-phase=bid]');
  ok((await text('.c-label')).includes('Runde 2 von 2'), 'Runde 2: Geber wandert weiter, Zähler steht bei 2 Karten');
  ok((await page.locator('.cell.is-active').getAttribute('data-i')) === '2', 'C sagt in Runde 2 zuerst an');

  for (let i = 0; i < 4; i++) await page.locator('.cell.is-active .btn.ok').click();
  await page.waitForSelector('.board[data-phase=result]');
  await page.locator('.cell[data-i="0"] .btn.plus').click(); // nur einer: Summe 1 von 2
  await page.locator('.cell[data-i="1"] .val').click(); // Tipp auf „–“ setzt 0
  await page.locator('.cell[data-i="2"] .val').click();
  await page.locator('.cell[data-i="3"] .btn.minus').click();
  ok((await text('.pill')).includes('1 fehlt'), 'Meldung „1 fehlt“');
  await page.click('.link');
  await page.click('.btn-solid');
  await page.waitForSelector('.final');
  ok(true, 'Trotzdem speichern -> Endwertung');
  ok((await page.locator('.f-row').count()) === 4, 'Rangliste mit 4 Zeilen');

  // Rückgängig über Rundenende hinweg
  let steps = 0;
  await page.click('.final-sub .btn-text:has-text("Rückgängig")');
  await page.waitForSelector('.board[data-phase=result]');
  ok(true, 'Rückgängig aus der Endwertung zurück in die Ergebnisphase');
  for (; steps < 60; steps++) {
    await page.click('.dot');
    const undo = page.locator('.menu-item:has-text("Rückgängig")');
    if (await undo.isDisabled()) {
      await page.keyboard.press('Escape');
      break;
    }
    await undo.click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
  ok((await page.locator('.board').getAttribute('data-phase')) === 'dealer', `Alles zurückgenommen (${steps + 1} Schritte) -> Geberwahl`);

  // Neu laden: Zustand bleibt erhalten
  await page.reload();
  await page.waitForSelector('.board[data-phase=dealer]');
  ok(true, 'Nach Neuladen weiterspielen');
  ok(errors.length === 0, `Keine Seitenfehler ${errors.join('|')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} Fehler` : '\nE2E in Ordnung');
process.exitCode = fails ? 1 : 0;
