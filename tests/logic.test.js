import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const S = L.DEFAULT_SETTINGS;

/** Spiel mit gewähltem ersten Geber, bereit zur Ansage in Runde 1. */
function started({ n = 4, dealer = 0, settings = {} } = {}) {
  const s = { ...S, players: n, ...settings };
  const g = L.createGame({ names: ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n), settings: s, id: 't' });
  return L.pickDealer(g, dealer);
}

/** Bestätigt für alle Spieler der Reihe nach die übergebenen Ansagen (in Ansagereihenfolge). */
function bidAll(game, values) {
  let g = game;
  for (const v of values) {
    let guard = 0;
    while (g.draft < v && guard++ < 50) g = L.stepDraft(g, +1);
    const before = g;
    g = L.confirmBid(g);
    assert.notEqual(g, before, `Ansage ${v} wurde abgelehnt`);
  }
  return g;
}

/** Trägt Stiche je Spieler (Index = Spieler, nicht Reihenfolge) ein. */
function enterTricks(game, values) {
  let g = game;
  values.forEach((v, i) => {
    g = L.setTricks(g, i, v);
  });
  return g;
}

test('Punkte: Treffer = 10 + 2 pro angesagtem Stich', () => {
  assert.equal(L.scoreRound(3, 3, 5, S), 16);
  assert.equal(L.scoreRound(1, 1, 1, S), 12);
});

test('Punkte: gelungene 0 = 10 + 1 pro Karte der Runde', () => {
  assert.equal(L.scoreRound(0, 0, 1, S), 11);
  assert.equal(L.scoreRound(0, 0, 8, S), 18);
});

test('Punkte: -3 pro Stich Abweichung, egal ob zu viel oder zu wenig', () => {
  assert.equal(L.scoreRound(2, 4, 6, S), -6);
  assert.equal(L.scoreRound(4, 1, 6, S), -9);
  assert.equal(L.scoreRound(0, 2, 6, S), -6);
});

test('Geberwechsel und Ansagereihenfolge: links vom Geber zuerst, Geber zuletzt', () => {
  const g = started({ n: 4, dealer: 2 });
  assert.equal(L.dealerOf(g, 0), 2);
  assert.equal(L.dealerOf(g, 1), 3);
  assert.equal(L.dealerOf(g, 2), 0);
  assert.equal(L.dealerOf(g, 5), 3);
  assert.deepEqual(L.bidOrder(g, 0), [3, 0, 1, 2]);
  assert.deepEqual(L.bidOrder(g, 1), [0, 1, 2, 3]);
  assert.equal(L.activeBidder(g), 3);
});

test('Runde n hat n Karten', () => {
  assert.equal(L.cardsInRound(0), 1);
  assert.equal(L.cardsInRound(9), 10);
});

test('Kein Ansageverbot bis Runde 4: Summe darf aufgehen', () => {
  const g = started({ dealer: 0 }); // Runde 1, eine Karte
  assert.equal(L.forbiddenBid(g), null);
  // Alle bis auf den Geber sagen 0, der Geber darf 1 sagen (Summe = Kartenzahl).
  let x = bidAll(g, [0, 0, 0]);
  assert.equal(L.forbiddenBid(x), null);
  x = bidAll(x, [1]);
  assert.equal(x.phase, 'result');
});

/** Spielt Runden mit gültigen Ergebnissen bis zur gewünschten Runde (Index). */
function playUntilRound(game, targetRound) {
  let g = game;
  while (g.current < targetRound) {
    const cards = L.cardsInRound(g.current);
    g = bidAll(g, [0, 0, 0, 0]);
    g = enterTricks(g, [cards, 0, 0, 0]);
    g = L.finishRound(g, { force: true });
  }
  return g;
}

test('Ansageverbot ab Runde 5: Geber darf die Summe nicht auf die Kartenzahl bringen', () => {
  let g = playUntilRound(started({ dealer: 0 }), 4); // Runde 5 mit 5 Karten
  assert.equal(g.current, 4);
  assert.equal(L.cardsInRound(g.current), 5);
  // Erste drei Ansager: 1 + 2 + 0 = 3, Geber darf nicht 2 sagen.
  g = bidAll(g, [1, 2, 0]);
  assert.equal(L.forbiddenBid(g), 2);
  assert.equal(L.activeBidder(g), L.dealerOf(g, 4), 'der Geber ist zuletzt dran');
});

test('Ansageverbot wird technisch erzwungen (confirmBid und Schritt über die Sperre)', () => {
  let g = playUntilRound(started({ dealer: 0 }), 4);
  g = bidAll(g, [1, 2, 0]);
  // Entwurf steht bei 0; Schritte überspringen die gesperrte 2.
  assert.equal(g.draft, 0);
  g = L.stepDraft(g, +1);
  assert.equal(g.draft, 1);
  g = L.stepDraft(g, +1);
  assert.equal(g.draft, 3, 'die gesperrte 2 wird übersprungen');
  g = L.stepDraft(g, -1);
  assert.equal(g.draft, 1);
  // Selbst ein manipulierter Entwurf auf die verbotene Zahl wird abgelehnt.
  const hacked = { ...g, draft: 2 };
  assert.equal(L.confirmBid(hacked), hacked);
});

test('Gesperrte Zahl außerhalb des Bereichs: keine Sperre', () => {
  let g = playUntilRound(started({ dealer: 0 }), 4); // 5 Karten
  g = bidAll(g, [5, 5, 5]); // Rest = -10, nichts ist verboten
  assert.equal(L.forbiddenBid(g), null);
});

test('Ist 0 gesperrt, startet der Entwurf des Gebers bei 1', () => {
  let g = playUntilRound(started({ dealer: 0 }), 4); // 5 Karten
  g = bidAll(g, [2, 2, 1]); // Summe = 5, gesperrt ist 0
  assert.equal(L.forbiddenBid(g), 0);
  assert.equal(g.draft, 1);
  assert.equal(L.canStepDraft(g, -1), false, 'Minus führt nicht auf die gesperrte 0');
});

test('Ansageverbot-Startrunde ist einstellbar', () => {
  const g = started({ settings: { noExactFrom: 2 } });
  let x = bidAll(g, [0, 0, 0, 0]);
  x = enterTricks(x, [1, 0, 0, 0]);
  x = L.finishRound(x);
  assert.equal(x.current, 1);
  x = bidAll(x, [1, 0, 0]);
  assert.equal(L.forbiddenBid(x), 1, 'Runde 2: Summe 1 von 2 Karten, gesperrt ist 1');
});

test('Plus/Minus bei Ansagen: Grenzen 0 und Kartenzahl', () => {
  let g = started();
  assert.equal(L.canStepDraft(g, -1), false);
  assert.equal(L.canStepDraft(g, +1), true);
  g = L.stepDraft(g, +1);
  assert.equal(g.draft, 1);
  assert.equal(L.canStepDraft(g, +1), false, 'Plus bei Kartenzahl gesperrt');
  assert.equal(L.stepDraft(g, +1), g);
});

test('Nach dem Geber wechselt die App in die Ergebnisphase', () => {
  let g = started({ dealer: 1 });
  assert.equal(L.activeBidder(g), 2);
  g = L.confirmBid(g);
  assert.equal(L.activeBidder(g), 3);
  g = L.confirmBid(g);
  g = L.confirmBid(g);
  assert.equal(L.activeBidder(g), 1, 'der Geber ist zuletzt dran');
  g = L.confirmBid(g);
  assert.equal(g.phase, 'result');
});

test('Restzähler in der Ansagephase: Kartenzahl minus bisherige Ansagen', () => {
  let g = playUntilRound(started(), 2); // Runde 3 mit 3 Karten
  assert.equal(L.bidRemaining(g), 3);
  g = L.stepDraft(g, +1);
  assert.equal(L.bidRemaining(g), 2);
  g = L.confirmBid(g);
  assert.equal(L.bidRemaining(g), 2);
});

test('Stiche: nie über Kartenzahl, nie unter 0, erstes Minus ergibt 0', () => {
  let g = bidAll(started(), [0, 0, 0, 1]);
  assert.equal(L.setTricks(g, 0, 2), g, 'mehr als die Kartenzahl wird abgelehnt');
  assert.equal(L.setTricks(g, 0, -1), g);
  assert.equal(L.canStepTricks(g, 0, +1), true);
  const m = L.stepTricks(g, 0, -1);
  assert.equal(m.rounds[0].tricks[0], 0);
  assert.equal(L.canStepTricks(m, 0, -1), false);
  const p = L.stepTricks(m, 0, +1);
  assert.equal(p.rounds[0].tricks[0], 1);
  assert.equal(L.canStepTricks(p, 0, +1), false);
});

test('Sind alle bis auf einen eingetragen, wird der letzte vorausgefüllt', () => {
  let g = playUntilRound(started(), 3); // 4 Karten
  g = bidAll(g, [1, 1, 1, 1]);
  g = enterTricks(g, [1, 2]);
  assert.equal(L.effectiveTricks(g).suggested, null);
  g = enterTricks(g, [1, 2, 1]);
  const eff = L.effectiveTricks(g);
  assert.equal(eff.suggested, 3);
  assert.equal(eff.values[3], 0, '4 Karten − (1+2+1) = 0');
  assert.equal(L.roundCheck(g).status, 'ok');
  // Der Vorschlag ist änderbar und wird dann zum festen Wert.
  const edited = L.stepTricks(g, 3, +1);
  assert.equal(edited.rounds[3].tricks[3], 1);
  assert.equal(L.roundCheck(edited).status, 'over');
  assert.equal(L.roundCheck(edited).message, '1 zu viel');
});

test('Vorschlag fällt weg, wenn der Rest nicht in 0..Kartenzahl liegt', () => {
  let g = playUntilRound(started(), 1); // 2 Karten
  g = bidAll(g, [0, 0, 0, 0]);
  g = enterTricks(g, [2, 2, 2]);
  assert.equal(L.effectiveTricks(g).suggested, null);
  assert.equal(L.roundCheck(g).status, 'incomplete');
});

test('Runde abschließen nur bei exakter Summe, sonst Meldung und „Trotzdem speichern“', () => {
  let g = playUntilRound(started(), 2); // 3 Karten
  g = bidAll(g, [1, 1, 1, 0]);
  g = enterTricks(g, [1, 1, 0, 0]);
  assert.equal(L.roundCheck(g).message, '1 fehlt');
  assert.equal(L.finishRound(g), g, 'unvollständig/falsch → nicht abschließen');
  g = enterTricks(g, [1, 1, 0, 0]);
  const under = L.roundCheck(g);
  assert.equal(under.status, 'under');
  assert.equal(L.finishRound(g), g);
  const forced = L.finishRound(g, { force: true });
  assert.notEqual(forced, g);
  assert.equal(forced.current, 3);

  let o = enterTricks(g, [3, 1, 1, 1]);
  assert.equal(L.roundCheck(o).message, '3 zu viel');
  assert.equal(L.roundCheck({ ...g, rounds: g.rounds }).diff, -1);
  assert.equal(L.describeDiff(-2), '2 fehlen');
});

test('Punkte werden live aus gespeicherten Werten berechnet (rückwirkend neu bei geänderten Einstellungen)', () => {
  let g = started();
  g = bidAll(g, [0, 0, 0, 1]);
  g = enterTricks(g, [1, 0, 0, 0]); // Spieler 0: bid 0, tricks 1; Geber 0 sagt zuletzt
  g = L.finishRound(g, { force: true });
  const before = L.totals(g, S);
  assert.deepEqual(before, [12, 11, 11, 11]);
  const changed = { ...S, penalty: 5, zeroBase: 20, hitBase: 0, perBid: 10 };
  const after = L.totals(g, changed);
  assert.notDeepEqual(before, after);
  assert.equal(after[0], 10, 'Treffer mit Ansage 1: 0 + 10');
  assert.equal(after[1], 21, 'gelungene 0 in Runde 1: 20 + 1');
});

test('Punkte der Runde 1 stimmen für alle Spieler', () => {
  let g = started({ dealer: 0 });
  // Reihenfolge: B, C, D, A(Geber). B sagt 1, C 0, D 0, A 0.
  g = L.stepDraft(g, +1);
  g = L.confirmBid(g);
  g = bidAll(g, [0, 0, 0]);
  g = enterTricks(g, [0, 1, 0, 0]);
  g = L.finishRound(g);
  assert.equal(g.phase, 'bid');
  // A: 0/0 → 10+1, B: 1/1 → 12, C: 0/0 → 11, D: 0/0 → 11
  assert.deepEqual(L.totals(g, S), [11, 12, 11, 11]);
});

test('Letzte Runde führt zur Endwertung, Rangliste teilt Plätze bei Gleichstand', () => {
  let g = started({ settings: { rounds: 2 } });
  g = bidAll(g, [0, 0, 0, 0]);
  g = enterTricks(g, [1, 0, 0, 0]);
  g = L.finishRound(g, { force: true });
  assert.equal(g.phase, 'bid');
  g = bidAll(g, [0, 0, 0, 0]);
  g = enterTricks(g, [0, 0, 0, 2]);
  g = L.finishRound(g, { force: true });
  assert.equal(g.phase, 'finished');
  const rank = L.ranking(g, S);
  assert.equal(rank.length, 4);
  assert.equal(rank[0].total >= rank[1].total, true);
  const t = L.totals(g, S);
  assert.deepEqual(rank.map((r) => r.total), [...t].sort((a, b) => b - a));
  // Gleichstand
  const tie = L.ranking(
    { n: 3, players: ['X', 'Y', 'Z'], rounds: [{ bids: [1, 1, 0], tricks: [1, 1, 1], done: true }] },
    S,
  );
  assert.deepEqual(tie.map((r) => r.rank), [1, 1, 3]);
});

test('Führende werden erst nach der ersten gewerteten Runde markiert', () => {
  let g = started();
  assert.deepEqual(L.leaders(g, S), []);
  g = bidAll(g, [0, 0, 0, 0]);
  g = enterTricks(g, [1, 0, 0, 0]);
  g = L.finishRound(g, { force: true });
  assert.deepEqual(L.leaders(g, S).sort(), [1, 2, 3]);
});

test('Mehrstufiges Rückgängig über Eingaben und abgeschlossene Runden hinweg', () => {
  let g = started({ settings: { rounds: 3 } });
  const states = [g];
  let history = [];
  const act = (fn) => {
    const next = fn(g);
    if (next !== g) {
      history = L.pushHistory(history, g);
      g = next;
      states.push(g);
    }
  };
  // Runde 1
  act((x) => L.stepDraft(x, +1));
  act(L.confirmBid);
  act(L.confirmBid);
  act(L.confirmBid);
  act(L.confirmBid);
  act((x) => L.setTricks(x, 0, 1));
  act((x) => L.setTricks(x, 1, 0));
  act((x) => L.setTricks(x, 2, 0));
  act((x) => L.setTricks(x, 3, 0));
  act((x) => L.finishRound(x, { force: true }));
  assert.equal(g.current, 1);
  act(L.confirmBid);
  assert.equal(g.rounds[1].bids.filter((b) => b !== null).length, 1);

  // alles Schritt für Schritt zurück
  let guard = 0;
  while (history.length && guard++ < 100) {
    const r = L.undo(g, history);
    states.pop();
    assert.deepEqual(r.game, states[states.length - 1]);
    g = r.game;
    history = r.history;
  }
  assert.equal(history.length, 0);
  assert.equal(g.phase, 'bid');
  assert.equal(g.current, 0);
  assert.deepEqual(g.rounds[0].bids, [null, null, null, null]);
  assert.equal(L.undo(g, history), null);
});

test('Rückgängig behält eine zwischenzeitlich geänderte Rundenzahl', () => {
  let g = started({ settings: { rounds: 4 } });
  let history = L.pushHistory([], g);
  g = L.confirmBid(g);
  g = L.setTotalRounds(g, 7);
  assert.equal(g.totalRounds, 7);
  const r = L.undo(g, history);
  assert.equal(r.game.totalRounds, 7);
});

test('Rundenzahl lässt sich nicht unter die laufende Runde senken', () => {
  let g = playUntilRound(started(), 3);
  assert.equal(L.setTotalRounds(g, 2).totalRounds, 4);
  assert.equal(L.setTotalRounds(g, 40).totalRounds, 25);
});

test('Verlauf ist begrenzt', () => {
  let h = [];
  const g = started();
  for (let i = 0; i < 400; i++) h = L.pushHistory(h, g, 50);
  assert.equal(h.length, 50);
});

test('2 und 3 Spieler: Reihenfolge und Layout', () => {
  const g2 = started({ n: 2, dealer: 0 });
  assert.deepEqual(L.bidOrder(g2, 0), [1, 0]);
  const g3 = started({ n: 3, dealer: 2 });
  assert.deepEqual(L.bidOrder(g3, 0), [0, 1, 2]);
  assert.equal(L.layoutFor(2, 'quadrants'), 'quad2');
  assert.equal(L.layoutFor(3, 'quadrants'), 'quad3');
  assert.equal(L.layoutFor(4, 'quadrants'), 'quad4');
  assert.equal(L.layoutFor(4, 'list'), 'list');
  assert.equal(L.layoutFor(5, 'quadrants'), 'list');
  assert.equal(L.layoutFor(6, 'quadrants'), 'list');
});

test('Zufallsgeber: Lauflicht endet beim Gewählten', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    for (const r of [0, 0.3, 0.99]) {
      const { target, steps } = L.randomSweep(n, () => r);
      assert.equal(steps[steps.length - 1], target);
      assert.ok(target >= 0 && target < n);
      assert.ok(steps.length > n);
    }
  }
});

test('Einstellungen werden begrenzt und Namen bereinigt', () => {
  const s = L.normalizeSettings({ players: 9, rounds: 0, noExactFrom: 'x', penalty: -4 });
  assert.equal(s.players, 6);
  assert.equal(s.rounds, 1);
  assert.equal(s.noExactFrom, 5);
  assert.equal(s.penalty, 0);
  assert.deepEqual(L.sanitizeNames(['  Anna ', '', 'x'.repeat(40)], 4), ['Anna', 'Spieler 2', 'x'.repeat(16), 'Spieler 4']);
  assert.equal(L.normalizeSettings(null).players, 4);
});

test('validateGame erkennt kaputte Daten', () => {
  const g = started();
  assert.equal(L.validateGame(g), true);
  assert.equal(L.validateGame(null), false);
  assert.equal(L.validateGame({ ...g, n: 9 }), false);
  assert.equal(L.validateGame({ ...g, phase: 'x' }), false);
  const bad = JSON.parse(JSON.stringify(g));
  bad.rounds[0].bids[0] = 7; // mehr als Kartenzahl
  assert.equal(L.validateGame(bad), false);
  assert.equal(L.validateGame({ ...g, rounds: [] }), false);
});

test('Tabellenzeilen: Ansage/Stiche/Punkte je Runde', () => {
  let g = started();
  g = bidAll(g, [0, 0, 0, 1]);
  g = enterTricks(g, [1, 0, 0, 0]);
  g = L.finishRound(g, { force: true });
  const rows = L.tableRows(g, S);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].done, true);
  assert.equal(rows[0].cells[0].bid, 1);
  assert.equal(rows[0].cells[0].tricks, 1);
  assert.equal(rows[0].cells[0].points, 12);
  assert.equal(rows[1].done, false);
  assert.equal(rows[1].cells[0].points, null);
});

test('Alle Stiche vergeben: leere Felder zählen als 0, Abschluss sofort möglich', () => {
  let g = playUntilRound(started(), 2); // 3 Karten
  g = bidAll(g, [1, 1, 1, 0]);
  g = L.setTricks(g, 0, 2);
  assert.equal(L.roundCheck(g).status, 'incomplete', 'Summe 2 von 3: noch offen');
  g = L.setTricks(g, 1, 1); // Summe 3 = Kartenzahl, zwei Spieler leer
  const eff = L.effectiveTricks(g);
  assert.deepEqual(eff.values, [2, 1, 0, 0]);
  assert.deepEqual(eff.suggestedAll, [2, 3]);
  assert.equal(L.roundCheck(g).status, 'ok');
  assert.equal(L.resultRemaining(g), 0);
  const done = L.finishRound(g);
  assert.notEqual(done, g);
  assert.deepEqual(done.rounds[2].tricks, [2, 1, 0, 0]);
  // ein vorausgefüllter Wert lässt sich ändern und wird dann fest
  const edited = L.stepTricks(g, 2, +1);
  assert.equal(edited.rounds[2].tricks[2], 1);
  assert.equal(L.roundCheck(edited).status, 'incomplete', 'Summe 4 von 3, der letzte Wert fehlt noch');
});
