/*
 * Stechen – Spiellogik
 * Reine Funktionen ohne DOM und ohne localStorage. Alle Zustandsänderungen
 * geben ein NEUES Spielobjekt zurück. Ist eine Aktion nicht erlaubt, kommt
 * dasselbe Objekt zurück (Identitätsvergleich genügt, um ein No-Op zu erkennen).
 *
 * Spielobjekt:
 * {
 *   id, n, players: [name…], firstDealer: idx|null,
 *   totalRounds, noExactFrom,
 *   phase: 'dealer' | 'bid' | 'result' | 'finished',
 *   current: Rundenindex (0-basiert), bidTurn: Position in der Ansagereihenfolge,
 *   draft: Zahl, die der aktive Spieler gerade einstellt (noch nicht bestätigt),
 *   rounds: [{ bids: [..|null], tricks: [..|null], done: bool }]
 * }
 */

export const LIMITS = Object.freeze({
  players: [2, 6],
  rounds: [1, 25],
  noExactFrom: [1, 26], // 26 = nie (mehr als die maximale Rundenzahl)
  hitBase: [0, 99],
  perBid: [0, 99],
  zeroBase: [0, 99],
  zeroPerCard: [0, 99],
  penalty: [0, 99],
});

export const DEFAULT_SETTINGS = Object.freeze({
  players: 4,
  rounds: 10,
  noExactFrom: 5,
  hitBase: 10,
  perBid: 2,
  zeroBase: 10,
  zeroPerCard: 1,
  penalty: 3,
  layout: 'quadrants', // 'quadrants' | 'list'
  vibrate: true,
});

const clampInt = (v, [lo, hi], fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/** Macht aus beliebigen (z. B. gespeicherten) Einstellungen gültige. */
export function normalizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    players: clampInt(r.players, LIMITS.players, d.players),
    rounds: clampInt(r.rounds, LIMITS.rounds, d.rounds),
    noExactFrom: clampInt(r.noExactFrom, LIMITS.noExactFrom, d.noExactFrom),
    hitBase: clampInt(r.hitBase, LIMITS.hitBase, d.hitBase),
    perBid: clampInt(r.perBid, LIMITS.perBid, d.perBid),
    zeroBase: clampInt(r.zeroBase, LIMITS.zeroBase, d.zeroBase),
    zeroPerCard: clampInt(r.zeroPerCard, LIMITS.zeroPerCard, d.zeroPerCard),
    penalty: clampInt(r.penalty, LIMITS.penalty, d.penalty),
    layout: r.layout === 'list' ? 'list' : 'quadrants',
    vibrate: r.vibrate !== false,
  };
}

/** Namen bereinigen: trimmen, leere durch „Spieler k“ ersetzen. */
export function sanitizeNames(names, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const raw = Array.isArray(names) && typeof names[i] === 'string' ? names[i].trim() : '';
    out.push(raw ? raw.slice(0, 16) : `Spieler ${i + 1}`);
  }
  return out;
}

const clone = (g) => JSON.parse(JSON.stringify(g));
const sum = (arr) => arr.reduce((a, b) => a + (b ?? 0), 0);
const newRound = (n) => ({ bids: Array(n).fill(null), tricks: Array(n).fill(null), done: false });

/* ------------------------------------------------------------------ */
/* Aufbau                                                              */
/* ------------------------------------------------------------------ */

export function createGame({ names, settings, id }) {
  const s = normalizeSettings(settings);
  const n = s.players;
  return {
    id: id ?? Date.now().toString(36),
    n,
    players: sanitizeNames(names, n),
    firstDealer: null,
    totalRounds: s.rounds,
    noExactFrom: s.noExactFrom,
    phase: 'dealer',
    current: 0,
    bidTurn: 0,
    draft: 0,
    rounds: [newRound(n)],
  };
}

export const cardsInRound = (roundIdx) => roundIdx + 1;
export const dealerOf = (game, roundIdx) => (game.firstDealer + roundIdx) % game.n;

/** Spielerindizes in Ansagereihenfolge: links vom Geber zuerst, Geber zuletzt. */
export function bidOrder(game, roundIdx = game.current) {
  const d = dealerOf(game, roundIdx);
  return Array.from({ length: game.n }, (_, k) => (d + 1 + k) % game.n);
}

/** Wer ist in der Ansagephase gerade dran? */
export function activeBidder(game) {
  if (game.phase !== 'bid') return null;
  return bidOrder(game)[game.bidTurn];
}

/* ------------------------------------------------------------------ */
/* Ansagen                                                             */
/* ------------------------------------------------------------------ */

/**
 * Die Zahl, die der Geber NICHT ansagen darf (ab Runde noExactFrom),
 * sonst null. Gilt nur für den letzten Ansager.
 */
export function forbiddenBid(game, roundIdx = game.current, bidTurn = game.bidTurn) {
  if (roundIdx + 1 < game.noExactFrom) return null;
  if (bidTurn !== game.n - 1) return null;
  const cards = cardsInRound(roundIdx);
  const f = cards - sum(game.rounds[roundIdx].bids);
  return f >= 0 && f <= cards ? f : null;
}

/** Ein Schritt im Wertebereich 0..max, der gesperrte Wert wird übersprungen. */
export function stepValue(value, dir, max, forbidden = null) {
  let v = value + dir;
  if (v === forbidden) v += dir;
  if (v < 0 || v > max) return value;
  return v;
}

/** Startwert für den Entwurf des nächsten Ansagers (0, außer 0 ist gesperrt). */
function initialDraft(game, roundIdx, bidTurn) {
  return forbiddenBid(game, roundIdx, bidTurn) === 0 ? 1 : 0;
}

export function pickDealer(game, idx) {
  if (game.phase !== 'dealer') return game;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.n) return game;
  const g = clone(game);
  g.firstDealer = idx;
  g.phase = 'bid';
  g.current = 0;
  g.bidTurn = 0;
  g.draft = initialDraft(g, 0, 0);
  return g;
}

export function stepDraft(game, dir) {
  if (game.phase !== 'bid') return game;
  const max = cardsInRound(game.current);
  const next = stepValue(game.draft, dir, max, forbiddenBid(game));
  if (next === game.draft) return game;
  const g = clone(game);
  g.draft = next;
  return g;
}

export function canStepDraft(game, dir) {
  return game.phase === 'bid' && stepDraft(game, dir) !== game;
}

/** Ansage des aktiven Spielers bestätigen. Verbotene Zahl wird abgelehnt. */
export function confirmBid(game) {
  if (game.phase !== 'bid') return game;
  const cards = cardsInRound(game.current);
  if (!Number.isInteger(game.draft) || game.draft < 0 || game.draft > cards) return game;
  if (game.draft === forbiddenBid(game)) return game;
  const g = clone(game);
  const p = bidOrder(g)[g.bidTurn];
  g.rounds[g.current].bids[p] = g.draft;
  g.bidTurn += 1;
  if (g.bidTurn >= g.n) {
    g.phase = 'result';
    g.bidTurn = 0;
    g.draft = 0;
  } else {
    g.draft = initialDraft(g, g.current, g.bidTurn);
  }
  return g;
}

/** Verbleibende Stiche in der Ansagephase (inkl. aktuellem Entwurf). */
export function bidRemaining(game) {
  const cards = cardsInRound(game.current);
  const confirmed = sum(game.rounds[game.current].bids);
  return cards - confirmed - (game.phase === 'bid' ? game.draft : 0);
}

/* ------------------------------------------------------------------ */
/* Ergebnis (Stiche)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Stiche der Runde. Fehlt genau einer, wird er als Vorschlag vorausgefüllt
 * (Kartenzahl minus Rest), sofern der Wert zwischen 0 und Kartenzahl liegt.
 * values enthält die wirksamen Werte (null = noch nichts eingetragen),
 * suggested ist der Index des vorausgefüllten Spielers oder null.
 */
export function effectiveTricks(game, roundIdx = game.current) {
  const round = game.rounds[roundIdx];
  const cards = cardsInRound(roundIdx);
  const values = round.tricks.slice();
  let suggested = null;
  const missing = values.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  if (!round.done && missing.length === 1 && game.n > 1) {
    const rest = cards - sum(values);
    if (rest >= 0 && rest <= cards) {
      values[missing[0]] = rest;
      suggested = missing[0];
    }
  }
  return { values, suggested };
}

/** Direkt einen Wert setzen (0..Kartenzahl). */
export function setTricks(game, player, value) {
  if (game.phase !== 'result') return game;
  if (!Number.isInteger(player) || player < 0 || player >= game.n) return game;
  const cards = cardsInRound(game.current);
  if (!Number.isInteger(value) || value < 0 || value > cards) return game;
  if (game.rounds[game.current].tricks[player] === value) return game;
  const g = clone(game);
  g.rounds[g.current].tricks[player] = value;
  return g;
}

/**
 * Plus/Minus in der Ergebnisphase. Noch nichts eingetragen: Plus ergibt 1,
 * Minus ergibt 0 (so ist die 0 mit einem Tipp erreichbar).
 */
export function stepTricks(game, player, dir) {
  if (game.phase !== 'result') return game;
  const cards = cardsInRound(game.current);
  const cur = effectiveTricks(game).values[player];
  if (cur === null) return setTricks(game, player, dir > 0 ? 1 : 0);
  const next = cur + dir;
  if (next < 0 || next > cards) return game;
  // Wirksamer Vorschlag wird durch die Änderung zum festen Wert.
  const g = clone(game);
  g.rounds[g.current].tricks[player] = next;
  return g;
}

export function canStepTricks(game, player, dir) {
  if (game.phase !== 'result') return false;
  const cards = cardsInRound(game.current);
  const cur = effectiveTricks(game).values[player];
  if (cur === null) return true;
  const next = cur + dir;
  return next >= 0 && next <= cards;
}

/** Verbleibende Stiche in der Ergebnisphase (Kartenzahl minus eingetragene). */
export function resultRemaining(game) {
  const cards = cardsInRound(game.current);
  return cards - sum(effectiveTricks(game).values);
}

export function describeDiff(diff) {
  if (diff > 0) return `${diff} zu viel`;
  if (diff < 0) return diff === -1 ? '1 fehlt' : `${-diff} fehlen`;
  return 'passt';
}

/**
 * Zustand der Rundenkontrolle.
 * status: 'incomplete' | 'ok' | 'over' | 'under'
 */
export function roundCheck(game, roundIdx = game.current) {
  const { values } = effectiveTricks(game, roundIdx);
  const cards = cardsInRound(roundIdx);
  const complete = values.every((v) => v !== null);
  const total = sum(values);
  const diff = total - cards;
  let status = 'incomplete';
  if (complete) status = diff === 0 ? 'ok' : diff > 0 ? 'over' : 'under';
  return { complete, sum: total, cards, diff, status, message: complete ? describeDiff(diff) : '' };
}

/** Runde abschließen. Ohne force nur, wenn die Summe genau der Kartenzahl entspricht. */
export function finishRound(game, { force = false } = {}) {
  if (game.phase !== 'result') return game;
  const check = roundCheck(game);
  if (!check.complete) return game;
  if (check.status !== 'ok' && !force) return game;
  const g = clone(game);
  const round = g.rounds[g.current];
  round.tricks = effectiveTricks(game).values;
  round.done = true;
  if (g.current + 1 >= g.totalRounds) {
    g.phase = 'finished';
  } else {
    g.current += 1;
    g.rounds.push(newRound(g.n));
    g.phase = 'bid';
    g.bidTurn = 0;
    g.draft = initialDraft(g, g.current, 0);
  }
  return g;
}

/** Rundenzahl während des Spiels ändern (nie unter die laufende Runde). */
export function setTotalRounds(game, total) {
  if (game.phase === 'finished') return game;
  const t = Math.max(game.current + 1, Math.min(LIMITS.rounds[1], Math.max(LIMITS.rounds[0], total)));
  if (t === game.totalRounds) return game;
  const g = clone(game);
  g.totalRounds = t;
  return g;
}

/* ------------------------------------------------------------------ */
/* Punkte (immer live aus den gespeicherten Werten)                    */
/* ------------------------------------------------------------------ */

export function scoreRound(bid, tricks, cards, s) {
  const diff = Math.abs(bid - tricks);
  if (diff === 0) {
    return bid === 0 ? s.zeroBase + s.zeroPerCard * cards : s.hitBase + s.perBid * bid;
  }
  return -s.penalty * diff;
}

/** Punkte je Spieler für eine abgeschlossene Runde, sonst null. */
export function roundScores(game, roundIdx, settings) {
  const round = game.rounds[roundIdx];
  if (!round || !round.done) return null;
  const s = normalizeSettings(settings);
  const cards = cardsInRound(roundIdx);
  return round.bids.map((b, i) => scoreRound(b, round.tricks[i], cards, s));
}

export function totals(game, settings) {
  const t = Array(game.n).fill(0);
  game.rounds.forEach((_, r) => {
    const sc = roundScores(game, r, settings);
    if (sc) sc.forEach((p, i) => (t[i] += p));
  });
  return t;
}

/** Indizes der Führenden (nur wenn mindestens eine Runde gewertet wurde). */
export function leaders(game, settings) {
  if (!game.rounds.some((r) => r.done)) return [];
  const t = totals(game, settings);
  const max = Math.max(...t);
  return t.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
}

/** Rangliste, absteigend. Gleichstand teilt den Rang (1, 1, 3). */
export function ranking(game, settings) {
  const t = totals(game, settings);
  const rows = t.map((total, player) => ({ player, name: game.players[player], total }));
  rows.sort((a, b) => b.total - a.total || a.player - b.player);
  let rank = 0;
  rows.forEach((row, i) => {
    if (i === 0 || row.total !== rows[i - 1].total) rank = i + 1;
    row.rank = rank;
  });
  return rows;
}

/** Daten für die Punktetabelle: eine Zeile pro begonnener Runde. */
export function tableRows(game, settings) {
  return game.rounds.map((round, r) => {
    const scores = roundScores(game, r, settings);
    const cards = cardsInRound(r);
    return {
      round: r + 1,
      cards,
      dealer: game.firstDealer === null ? null : dealerOf(game, r),
      done: round.done,
      cells: round.bids.map((bid, i) => ({
        bid,
        tricks: round.done ? round.tricks[i] : null,
        points: scores ? scores[i] : null,
      })),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Rückgängig                                                          */
/* ------------------------------------------------------------------ */

export const HISTORY_CAP = 250;

export function pushHistory(history, game, cap = HISTORY_CAP) {
  const h = history.concat([clone(game)]);
  return h.length > cap ? h.slice(h.length - cap) : h;
}

/**
 * Letzten Schnappschuss wiederherstellen. Die inzwischen geänderte Rundenzahl
 * bleibt erhalten (sie ist eine Einstellung, keine Eingabe).
 */
export function undo(game, history) {
  if (!history.length) return null;
  const snap = clone(history[history.length - 1]);
  snap.totalRounds = Math.max(game.totalRounds, snap.current + 1);
  return { game: snap, history: history.slice(0, -1) };
}

/* ------------------------------------------------------------------ */
/* Layout & Zufall                                                     */
/* ------------------------------------------------------------------ */

/** 'list' | 'quad2' | 'quad3' | 'quad4' */
export function layoutFor(n, pref) {
  if (n >= 5 || pref === 'list') return 'list';
  return n === 4 ? 'quad4' : n === 3 ? 'quad3' : 'quad2';
}

/** Zufälliger erster Geber samt Lauflicht-Folge (endet beim Gewählten). */
export function randomSweep(n, rng = Math.random) {
  const target = Math.min(n - 1, Math.floor(rng() * n));
  const steps = [];
  for (let i = 0; i <= 2 * n + target; i++) steps.push(i % n);
  return { target, steps };
}

/* ------------------------------------------------------------------ */
/* Plausibilitätsprüfung gespeicherter Daten                           */
/* ------------------------------------------------------------------ */

export function validateGame(g) {
  try {
    if (!g || typeof g !== 'object') return false;
    if (!Number.isInteger(g.n) || g.n < LIMITS.players[0] || g.n > LIMITS.players[1]) return false;
    if (!Array.isArray(g.players) || g.players.length !== g.n) return false;
    if (!g.players.every((p) => typeof p === 'string')) return false;
    if (!['dealer', 'bid', 'result', 'finished'].includes(g.phase)) return false;
    if (!Number.isInteger(g.totalRounds) || g.totalRounds < 1 || g.totalRounds > LIMITS.rounds[1]) return false;
    if (!Number.isInteger(g.noExactFrom) || g.noExactFrom < 1) return false;
    if (!Number.isInteger(g.current) || g.current < 0 || g.current >= g.totalRounds) return false;
    if (g.phase !== 'dealer') {
      if (!Number.isInteger(g.firstDealer) || g.firstDealer < 0 || g.firstDealer >= g.n) return false;
    }
    if (!Number.isInteger(g.bidTurn) || g.bidTurn < 0 || g.bidTurn >= g.n) return false;
    if (!Number.isInteger(g.draft) || g.draft < 0) return false;
    if (!Array.isArray(g.rounds) || g.rounds.length !== g.current + 1) return false;
    return g.rounds.every((round, r) => {
      const cards = cardsInRound(r);
      const okArr = (a) =>
        Array.isArray(a) && a.length === g.n && a.every((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= cards));
      return round && okArr(round.bids) && okArr(round.tricks) && typeof round.done === 'boolean';
    });
  } catch {
    return false;
  }
}
