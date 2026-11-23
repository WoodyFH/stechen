/* Steuerung: Zustand, Persistenz, Ereignisse, Wake Lock, Service Worker. */
import * as L from './logic.js';
import { load, save } from './store.js';
import { Board } from './board.js';
import { haptics } from './dom.js';
import { openMenu, openTable, openSettings, confirmDialog } from './overlays.js';
import { renderSetup, renderFinal } from './screens.js';

const VERSION = globalThis.STECHEN_VERSION ?? '?';
const $ = (id) => document.getElementById(id);

let S = load();
haptics.enabled = S.settings.vibrate;
let screen = null;
let deferredInstall = null;

const persist = () => save(S);

/* ------------------------------------------------------------------ */
/* Zustandsänderungen                                                  */
/* ------------------------------------------------------------------ */

/** Wendet eine reine Logikfunktion auf das Spiel an und merkt sich den Vorzustand für „Rückgängig“. */
function commit(fn) {
  const g = S.game;
  if (!g) return false;
  const next = fn(g);
  if (next === g) return false;
  S.history = L.pushHistory(S.history, g);
  S.game = next;
  persist();
  render();
  return true;
}

function undo() {
  if (!S.game) return;
  const r = L.undo(S.game, S.history);
  if (!r) return;
  S.game = r.game;
  S.history = r.history;
  persist();
  render();
  haptics.buzz(14);
}

function startGame() {
  document.activeElement?.blur?.();
  S.game = L.createGame({ names: S.names, settings: S.settings });
  S.history = [];
  persist();
  render();
}

async function newGame() {
  const g = S.game;
  if (g && g.phase !== 'finished') {
    const ok = await confirmDialog({
      title: 'Neues Spiel starten?',
      text: 'Das laufende Spiel wird verworfen.',
      confirmLabel: 'Neues Spiel',
      danger: true,
    });
    if (!ok) return;
  }
  if (g && g.n === S.settings.players) {
    S.game = L.createGame({ names: g.players, settings: S.settings });
  } else {
    S.game = null;
  }
  S.history = [];
  persist();
  render();
}

function discardGame() {
  S.game = null;
  S.history = [];
  persist();
  render();
}

async function deleteGame() {
  const ok = await confirmDialog({
    title: 'Spiel löschen?',
    text: 'Alle Ansagen und Punkte gehen verloren. Das lässt sich nicht rückgängig machen.',
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (ok) discardGame();
}

function changeSetting(key, value) {
  S.settings = L.normalizeSettings({ ...S.settings, [key]: value });
  haptics.enabled = S.settings.vibrate;
  if (key === 'rounds' && S.game) S.game = L.setTotalRounds(S.game, S.settings.rounds);
  persist();
  render();
  return S.settings;
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

const showTable = () => S.game && openTable({ game: S.game, settings: S.settings });

function showSettings() {
  openSettings({
    settings: S.settings,
    game: S.game,
    version: VERSION,
    canInstall: !!deferredInstall,
    onChange: changeSetting,
    onInstall: installApp,
    onNewGame: newGame,
    onDeleteGame: deleteGame,
    onClose: () => {
      if (screen === 'setup') showScreen('setup', true);
    },
  });
}

function showMenu() {
  openMenu({
    canUndo: S.history.length > 0,
    onUndo: undo,
    onTable: showTable,
    onSettings: showSettings,
    onNew: newGame,
  });
}

async function installApp() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try {
    await deferredInstall.userChoice;
  } catch {
    /* egal */
  }
  deferredInstall = null;
}

/* ------------------------------------------------------------------ */
/* Spielfeld-Ereignisse                                                */
/* ------------------------------------------------------------------ */

const board = new Board($('screen-board'), (act, i) => {
  const g = S.game;
  if (!g) return;
  switch (act) {
    case 'plus':
    case 'minus': {
      const dir = act === 'plus' ? 1 : -1;
      const before = g.draft;
      let changed = false;
      if (g.phase === 'bid' && i === L.activeBidder(g)) changed = commit((x) => L.stepDraft(x, dir));
      else if (g.phase === 'result') changed = commit((x) => L.stepTricks(x, i, dir));
      if (changed) {
        haptics.buzz(8);
        if (g.phase === 'bid' && Math.abs(S.game.draft - before) === 2) board.nudgeForbidden();
      }
      break;
    }
    case 'ok':
      if (g.phase === 'bid' && i === L.activeBidder(g) && commit(L.confirmBid)) haptics.buzz(18);
      else haptics.buzz([30, 40, 30]);
      break;
    case 'zero':
      if (commit((x) => L.setTricks(x, i, 0))) haptics.buzz(8);
      break;
    case 'pick':
      if (commit((x) => L.pickDealer(x, i))) haptics.buzz(18);
      break;
    case 'random':
      runRandom();
      break;
    case 'finish':
      if (commit((x) => L.finishRound(x))) haptics.buzz([18, 50, 18]);
      break;
    case 'force':
      confirmDialog({
        title: 'Trotzdem speichern?',
        text: `${L.roundCheck(g).message}. Die Summe der Stiche passt nicht zur Kartenzahl (falsch ausgeteilt?).`,
        confirmLabel: 'Speichern',
      }).then((ok) => {
        if (ok && commit((x) => L.finishRound(x, { force: true }))) haptics.buzz([18, 50, 18]);
      });
      break;
    case 'menu':
      haptics.buzz(8);
      showMenu();
      break;
    default:
  }
});

async function runRandom() {
  const g = S.game;
  if (!g || g.phase !== 'dealer') return;
  const { target, steps } = L.randomSweep(g.n);
  haptics.buzz(10);
  await board.sweep(steps);
  haptics.buzz([20, 40, 20]);
  commit((x) => L.pickDealer(x, target));
}

/* ------------------------------------------------------------------ */
/* Rendern                                                             */
/* ------------------------------------------------------------------ */

function showScreen(name, rebuild = false) {
  if (name !== screen || rebuild) {
    if (name === 'setup') {
      renderSetup($('screen-setup'), {
        settings: S.settings,
        names: S.names,
        onNames: (names) => {
          S.names = names;
          persist();
        },
        onCount: (n) => changeSetting('players', n),
        onSettings: showSettings,
        onStart: startGame,
      });
    }
    for (const id of ['setup', 'board', 'final']) $(`screen-${id}`).classList.toggle('active', id === name);
    screen = name;
  }
}

function render() {
  const g = S.game;
  const name = !g ? 'setup' : g.phase === 'finished' ? 'final' : 'board';
  showScreen(name);
  if (name === 'board') board.update({ game: g, settings: S.settings });
  if (name === 'final') {
    renderFinal($('screen-final'), {
      game: g,
      settings: S.settings,
      onTable: showTable,
      onUndo: undo,
      onNew: newGame,
      onChangePlayers: discardGame,
    });
  }
  syncWakeLock();
}

/* ------------------------------------------------------------------ */
/* Bildschirm wachhalten                                               */
/* ------------------------------------------------------------------ */

let wake = null;
let wakePending = false;

async function syncWakeLock() {
  if (!('wakeLock' in navigator) || wakePending) return;
  const want = !!S.game && S.game.phase !== 'finished' && document.visibilityState === 'visible';
  try {
    if (want && !wake) {
      wakePending = true;
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => {
        wake = null;
      });
    } else if (!want && wake) {
      wakePending = true;
      await wake.release();
      wake = null;
    }
  } catch {
    wake = null;
  } finally {
    wakePending = false;
  }
}
document.addEventListener('visibilitychange', syncWakeLock);

/* ------------------------------------------------------------------ */
/* Touch-Feinheiten                                                    */
/* ------------------------------------------------------------------ */

// Pinch-Zoom (iOS) und Doppeltipp-Zoom unterbinden, Kontextmenü beim langen Drücken.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

/* ------------------------------------------------------------------ */
/* Service Worker (Updates übernehmen sofort)                          */
/* ------------------------------------------------------------------ */

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // Erstinstallation: kein Reload nötig
    reloading = true;
    location.reload(); // Spielstand liegt im localStorage und bleibt erhalten
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

render();
