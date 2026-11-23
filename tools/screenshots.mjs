// Layout-Check mit Playwright: Screenshots in 390x844 und 360x640 plus automatische
// Prüfungen (kein Scrollen, nichts außerhalb des Bildschirms, keine Überlappungen
// zwischen Mittelpunkt-Elementen und Spielerinhalten, abgeschnittene Namen).
// Aufruf: npm run screenshots
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../js/logic.js';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
const PORT = 4177;
const URL = `http://localhost:${PORT}/stechen/`;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

/* ---------- Spielstände mit der echten Logik aufbauen ---------- */
function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const NAMES = ['Anna', 'Benedikt', 'Clara', 'David', 'Emilia', 'Fabian'];

/** completed = fertige Runden; bids = bestätigte Ansagen in der laufenden Runde; tricks = gesetzte Stiche. */
function build({ n = 4, dealer = 0, rounds = 10, completed = 0, bids = 0, tricks = null, settings = {} }) {
  const s = { ...L.DEFAULT_SETTINGS, players: n, rounds, ...settings };
  const rnd = lcg(7);
  let g = L.pickDealer(L.createGame({ names: NAMES.slice(0, n), settings: s, id: 'shot' }), dealer);
  const playBids = (count) => {
    for (let k = 0; k < count; k++) {
      const want = Math.min(L.cardsInRound(g.current), Math.floor(rnd() * 3) + (k % 2));
      let guard = 0;
      while (g.draft < want && guard++ < 30) g = L.stepDraft(g, +1);
      const next = L.confirmBid(g);
      g = next === g ? L.confirmBid(L.stepDraft(g, +1)) : next;
    }
  };
  for (let r = 0; r < completed; r++) {
    playBids(n);
    const cards = L.cardsInRound(g.current);
    const t = Array(n).fill(0);
    for (let c = 0; c < cards; c++) t[Math.floor(rnd() * n)]++;
    t.forEach((v, i) => (g = L.setTricks(g, i, v)));
    g = L.finishRound(g, { force: true });
  }
  if (g.phase === 'bid') playBids(bids);
  if (tricks && g.phase === 'result') tricks.forEach((v, i) => v !== null && (g = L.setTricks(g, i, v)));
  return { settings: s, names: NAMES.slice(0, n), game: g, history: [] };
}

/* ---------- Layout-Prüfungen im Browser ---------- */
const CHECK = () => {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  if (document.documentElement.scrollWidth > vw + 1) issues.push('horizontales Scrollen');
  const vis = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false;
    }
    return true;
  };
  const textRect = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  };
  const inter = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5;
  document.querySelectorAll('.board .cell').forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) issues.push(`Zelle ${c.dataset.i} außerhalb`);
  });
  document.querySelectorAll('.name').forEach((n) => {
    if (n.scrollWidth > n.clientWidth + 1) issues.push(`Name gekürzt: ${n.textContent}`);
  });
  const center = [...document.querySelectorAll('.dot, .c-info > *, .pill, .link')].filter(vis);
  const content = [];
  document.querySelectorAll('.board .cell').forEach((cell) => {
    cell.querySelectorAll('.name-row, .score, .val, .sub, .dealer').forEach((el) => {
      if (vis(el) && el.textContent) content.push([el, textRect(el)]);
    });
    cell.querySelectorAll('.btn').forEach((el) => {
      if (vis(el)) content.push([el, el.getBoundingClientRect()]);
    });
  });
  for (const cEl of center) {
    const cr = cEl.matches('.c-label,.c-caption,.c-hint') ? textRect(cEl) : cEl.getBoundingClientRect();
    for (const [el, r] of content) {
      if (inter(cr, r)) issues.push(`Überlappung: ${cEl.className || cEl.tagName} x ${el.className.split(' ')[0]} (${(el.textContent || '').trim().slice(0, 12)})`);
    }
  }
  const dot = document.querySelector('.dot');
  if (dot && !document.querySelector('.board.list')) {
    const r = dot.getBoundingClientRect();
    const b = document.querySelector('.board').getBoundingClientRect();
    if (Math.abs(r.left + r.width / 2 - vw / 2) > 2) issues.push('Mittelpunkt nicht mittig (x)');
    if (Math.abs(r.top + r.height / 2 - (b.top + b.height / 2)) > 2) issues.push('Mittelpunkt nicht mittig (y)');
  }
  const cells = [...document.querySelectorAll('.board.quad4 .cell')].map((c) => c.getBoundingClientRect());
  if (cells.length === 4 && cells.some((c) => Math.abs(c.width - cells[0].width) > 1 || Math.abs(c.height - cells[0].height) > 1)) {
    issues.push('Quadranten nicht gleich groß');
  }
  return issues;
};

let problems = 0;

async function withState(browser, vp, state, fn) {
  const ctx = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'de-DE',
    serviceWorkers: 'block',
  });
  if (state) {
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['stechen:v1', JSON.stringify(state)]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForSelector('.screen.active');
  await fn(page);
  if (errors.length) {
    problems += errors.length;
    console.log(`  ✖ Konsolenfehler: ${errors.join(' | ')}`);
  }
  await ctx.close();
}

async function shot(page, vp, name, { check = true } = {}) {
  await page.waitForTimeout(450); // Animationen ausklingen lassen
  const dir = path.join(OUT, `${vp.width}x${vp.height}`);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  const issues = check ? await page.evaluate(CHECK) : [];
  console.log(`  ${issues.length ? '✖' : '✔'} ${name}${issues.length ? '  -> ' + issues.join('; ') : ''}`);
  problems += issues.length;
}

const server = await startServer(PORT);
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n${vp.width}x${vp.height}`);

    // 1) Echter Durchlauf über die Oberfläche: Start, Geber, erste Ansagen
    await withState(browser, vp, null, async (page) => {
      await shot(page, vp, '01-start', { check: false });
      const inputs = page.locator('.name-field input');
      const names = ['Anna', 'Ben', 'Clara', 'David'];
      for (let i = 0; i < 4; i++) await inputs.nth(i).fill(names[i]);
      await shot(page, vp, '02-start-namen', { check: false });
      await page.click('.cta');
      await page.waitForSelector('.board[data-phase=dealer]');
      await shot(page, vp, '03-geber-waehlen');
      await page.click('.pill.is-random');
      await page.waitForTimeout(500);
      await shot(page, vp, '04-lauflicht', { check: false });
      await page.waitForSelector('.board[data-phase=bid]', { timeout: 8000 });
      // zurück und selbst einen Spieler antippen
      await page.click('.dot');
      await page.click('.menu-item:has-text("Rückgängig")');
      await page.waitForSelector('.board[data-phase=dealer]');
      await page.click('.cell[data-i="1"]');
      await page.waitForSelector('.board[data-phase=bid]');
      await shot(page, vp, '05-ansage-runde1');
      await page.locator('.cell.is-active .btn.plus').click();
      await shot(page, vp, '06-ansage-plus');
      await page.locator('.cell.is-active .btn.ok').click();
      await page.waitForTimeout(300);
      await shot(page, vp, '07-ansage-naechster');
    });

    // 2) Runde 5: Ansageverbot beim Geber
    await withState(browser, vp, build({ completed: 4, bids: 3 }), async (page) => {
      await shot(page, vp, '08-ansageverbot-geber');
    });

    // 3) Ergebnisphase: teilweise, mit Vorschlag, falsch, richtig
    await withState(browser, vp, build({ completed: 6, bids: 4, tricks: [3, 2, null, null] }), async (page) => {
      await shot(page, vp, '09-ergebnis-teilweise');
    });
    await withState(browser, vp, build({ completed: 6, bids: 4, tricks: [3, 2, 1, null] }), async (page) => {
      await shot(page, vp, '10-ergebnis-vorschlag-ok');
    });
    await withState(browser, vp, build({ completed: 6, bids: 4, tricks: [4, 2, 1, 2] }), async (page) => {
      await shot(page, vp, '11-ergebnis-zu-viel');
    });
    await withState(browser, vp, build({ completed: 9, bids: 4, tricks: [4, 2, 1, 3] }), async (page) => {
      await shot(page, vp, '12-letzte-runde-zehn-karten');
    });

    // 4) Overlays
    await withState(browser, vp, build({ completed: 6, bids: 2 }), async (page) => {
      await page.click('.dot');
      await shot(page, vp, '13-menue', { check: false });
      await page.click('.menu-item:has-text("Punktetabelle")');
      await shot(page, vp, '14-punktetabelle', { check: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.click('.dot');
      await page.click('.menu-item:has-text("Einstellungen")');
      await shot(page, vp, '15-einstellungen', { check: false });
    });

    // 5) Endwertung
    await withState(browser, vp, build({ completed: 10 }), async (page) => {
      await page.waitForSelector('.final');
      await page.waitForTimeout(900);
      await shot(page, vp, '16-endwertung', { check: false });
    });

    // 6) Andere Spielerzahlen und Liste
    for (const n of [2, 3]) {
      await withState(browser, vp, build({ n, completed: 3, bids: 1 }), async (page) => {
        await shot(page, vp, `17-${n}-spieler-ansage`);
      });
    }
    await withState(browser, vp, build({ n: 3, completed: 3, bids: 3, tricks: [1, null, null] }), async (page) => {
      await shot(page, vp, '18-3-spieler-ergebnis');
    });
    await withState(browser, vp, build({ n: 2, completed: 4, bids: 2, tricks: [2, 4] }), async (page) => {
      await shot(page, vp, '19-2-spieler-zu-viel');
    });
    await withState(browser, vp, build({ n: 5, completed: 4, bids: 2 }), async (page) => {
      await shot(page, vp, '20-5-spieler-liste-ansage');
    });
    await withState(browser, vp, build({ n: 6, completed: 6, bids: 6, tricks: [1, 0, 2, 0, 1, null] }), async (page) => {
      await shot(page, vp, '21-6-spieler-liste-ergebnis');
    });
    await withState(browser, vp, build({ n: 4, completed: 4, bids: 3, settings: { layout: 'list' } }), async (page) => {
      await shot(page, vp, '22-4-spieler-liste-verbot');
    });
    await withState(browser, vp, build({ n: 4, completed: 2, bids: 0 }), async (page) => {
      await shot(page, vp, '23-ansage-runde3');
    });
  }
} finally {
  await browser.close();
  server.close();
}
console.log(problems ? `\n${problems} Auffälligkeit(en)` : '\nAlles in Ordnung');
process.exitCode = problems ? 1 : 0;
