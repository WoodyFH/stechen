/*
 * Spielfeld: Quadranten (2–4 Spieler) oder Liste.
 * Das DOM wird einmal pro Layout gebaut und danach nur noch aktualisiert,
 * damit CSS-Übergänge (Hervorhebung, Farbe des Mittelpunkts) weich laufen.
 */
import * as L from './logic.js';
import { h, icon, setText, setScore, prefersReducedMotion } from './dom.js';

/** Akzentton je Sitzplatz: [Hex, RGB-Tripel für Transparenzen] */
export const COLORS = [
  ['#e8b04a', '232,176,74'],
  ['#4fc3b0', '79,195,176'],
  ['#ef7a6b', '239,122,107'],
  ['#9b8cf0', '155,140,240'],
  ['#5aa9f0', '90,169,240'],
  ['#a5cf5b', '165,207,91'],
];

/** Sitzordnung im Uhrzeigersinn. rot = um 180° gedreht, inner = Seite zur Bildschirmmitte (lokal). */
const SLOTS = {
  quad4: [
    { slot: 'tl', rot: true, inner: 'left' },
    { slot: 'tr', rot: true, inner: 'right' },
    { slot: 'br', inner: 'left' },
    { slot: 'bl', inner: 'right' },
  ],
  quad3: [{ slot: 'top', rot: true, wide: true }, { slot: 'br', inner: 'left' }, { slot: 'bl', inner: 'right' }],
  quad2: [
    { slot: 'top', rot: true, wide: true },
    { slot: 'bottom', wide: true },
  ],
};

const btn = (cls, act, label, ic) =>
  h('button', { class: `btn ${cls}`, type: 'button', 'aria-label': label, dataset: { act } }, icon(ic, 30));

function makeCell(i, def) {
  const [color, rgb] = COLORS[i];
  const r = {};
  const cell = h(
    'div',
    {
      class: `cell${def?.rot ? ' rot' : ''}${def?.wide ? ' wide' : ''}`,
      dataset: { i, slot: def?.slot || 'row', inner: def?.inner || '' },
      style: `--pc:${color};--pc-rgb:${rgb}`,
    },
    h(
      'div',
      { class: 'cell-inner' },
      h(
        'div',
        { class: 'head' },
        h(
          'div',
          { class: 'name-row' },
          h('span', { class: 'swatch' }),
          (r.name = h('span', { class: 'name' })),
          (r.dealer = h('span', { class: 'dealer', title: 'Geber' }, 'G')),
        ),
        (r.score = h('div', { class: 'score' })),
      ),
      h('div', { class: 'num' }, (r.val = h('div', { class: 'val' })), (r.sub = h('div', { class: 'sub' }))),
      h(
        'div',
        { class: 'ctl' },
        (r.minus = btn('minus', 'minus', 'Minus', 'minus')),
        (r.plus = btn('plus', 'plus', 'Plus', 'plus')),
        (r.ok = btn('ok', 'ok', 'Ansage bestätigen', 'check')),
      ),
    ),
  );
  cell._r = r;
  return cell;
}

function makeCenter() {
  const r = {};
  const el = h(
    'div',
    { class: 'center' },
    (r.dot = h('button', { class: 'dot', type: 'button', 'aria-label': 'Menü', dataset: { act: 'menu' } }, (r.dotNum = h('span', { class: 'dot-n' })))),
    h(
      'div',
      { class: 'c-info' },
      (r.label = h('div', { class: 'c-label' })),
      (r.caption = h('div', { class: 'c-caption' })),
      (r.hint = h('div', { class: 'c-hint' }, 'Karten an die Stirn')),
    ),
    h(
      'div',
      { class: 'c-action' },
      (r.pill = h('button', { class: 'pill', type: 'button' })),
      (r.force = h('button', { class: 'link', type: 'button', dataset: { act: 'force' } }, 'Trotzdem speichern')),
    ),
  );
  el._r = r;
  return el;
}

export class Board {
  /** on(act, playerIndex, event) wird bei jedem Tipp auf ein [data-act]-Element aufgerufen. */
  constructor(root, on) {
    this.root = root;
    this.on = on;
    this.key = null;
    this.cells = [];
    this.center = null;
    this.busy = false;
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || !root.contains(t) || t.disabled || this.busy) return;
      const cell = t.closest('.cell');
      this.on(t.dataset.act, cell ? Number(cell.dataset.i) : null, e);
    });
  }

  build(game, settings) {
    const layout = L.layoutFor(game.n, settings.layout);
    this.key = `${layout}|${game.n}|${game.id}`;
    const defs = SLOTS[layout];
    this.cells = game.players.map((_, i) => makeCell(i, defs ? defs[i] : null));
    this.center = makeCenter();
    this.board = h('div', { class: `board ${layout}` });
    if (layout === 'list') {
      this.board.append(this.center, h('div', { class: 'rows' }, ...this.cells));
    } else {
      this.board.append(...this.cells, this.center);
    }
    this.root.replaceChildren(this.board);
  }

  update({ game, settings }) {
    const layout = L.layoutFor(game.n, settings.layout);
    if (this.key !== `${layout}|${game.n}|${game.id}`) this.build(game, settings);

    const phase = game.phase;
    const cards = L.cardsInRound(game.current);
    const round = game.rounds[game.current];
    const totals = L.totals(game, settings);
    const dealer = phase === 'dealer' ? null : L.dealerOf(game, game.current);
    const active = L.activeBidder(game);
    const forbidden = phase === 'bid' ? L.forbiddenBid(game) : null;
    const eff = phase === 'result' ? L.effectiveTricks(game) : null;
    this.board.dataset.phase = phase;

    game.players.forEach((name, i) => {
      const cell = this.cells[i];
      const r = cell._r;
      const isActive = phase === 'bid' ? i === active : phase === 'result';
      cell.classList.toggle('is-active', isActive);
      cell.classList.toggle('is-dim', !isActive && phase !== 'dealer');
      cell.classList.toggle('pickable', phase === 'dealer');
      if (!this.busy) cell.classList.remove('sweep');
      if (phase === 'dealer') cell.dataset.act = 'pick';
      else delete cell.dataset.act;

      r.name.textContent = name;
      r.dealer.hidden = dealer !== i;
      setScore(r.score, totals[i]);

      let val = '';
      let sub = '';
      let subCls = 'sub';
      let valCls = 'val';
      let forbidNum = null;
      if (phase === 'dealer') {
        val = 'G';
        sub = 'Geber';
        valCls += ' is-g';
      } else if (phase === 'bid') {
        if (isActive) {
          val = String(game.draft);
          if (forbidden !== null) {
            sub = `${forbidden} gesperrt`;
            subCls += ' forbid';
            forbidNum = forbidden;
          }
        } else {
          const b = round.bids[i];
          val = b === null ? '–' : String(b);
          if (b === null) valCls += ' is-empty';
        }
      } else if (phase === 'result') {
        const v = eff.values[i];
        val = v === null ? '–' : String(v);
        if (v === null) valCls += ' is-empty';
        if (eff.suggested === i) valCls += ' is-suggested';
        sub = `Ansage ${round.bids[i]}`;
        if (v !== null && v === round.bids[i]) subCls += ' match';
      }
      r.val.className = valCls;
      setText(r.val, val, { pop: phase !== 'dealer' });
      r.sub.className = subCls;
      if (forbidNum !== null) {
        if (r.sub.dataset.f !== String(forbidNum)) {
          r.sub.replaceChildren(h('b', {}, String(forbidNum)), h('span', { class: 'forbid-txt' }, ' gesperrt'));
          r.sub.dataset.f = String(forbidNum);
        }
      } else {
        delete r.sub.dataset.f;
        if (r.sub.textContent !== sub || r.sub.children.length) r.sub.textContent = sub;
      }
      if (phase === 'result' && eff.values[i] === null) r.val.dataset.act = 'zero';
      else delete r.val.dataset.act;

      if (phase === 'bid' && isActive) {
        r.minus.disabled = !L.canStepDraft(game, -1);
        r.plus.disabled = !L.canStepDraft(game, +1);
        r.ok.disabled = false;
      } else if (phase === 'result') {
        r.minus.disabled = !L.canStepTricks(game, i, -1);
        r.plus.disabled = !L.canStepTricks(game, i, +1);
      } else {
        r.minus.disabled = r.plus.disabled = r.ok.disabled = true;
      }
    });

    this.updateCenter(game, settings, cards);
  }

  updateCenter(game, settings, cards) {
    const r = this.center._r;
    const phase = game.phase;
    const remaining =
      phase === 'bid' ? L.bidRemaining(game) : phase === 'result' ? L.resultRemaining(game) : cards;
    r.dot.classList.toggle('is-ok', phase !== 'dealer' && remaining === 0);
    r.dot.classList.toggle('is-over', remaining < 0);
    setText(r.dotNum, remaining < 0 ? `+${-remaining}` : String(remaining));
    r.label.textContent = `Runde ${game.current + 1} von ${game.totalRounds}`;
    r.caption.textContent = phase === 'dealer' ? 'Wer gibt zuerst?' : phase === 'bid' ? 'Ansage' : 'Ergebnis';
    r.hint.hidden = !(game.current === 0 && phase !== 'dealer');

    // Aktionsbereich: Zufällig / Runde abschließen / Meldung
    r.pill.className = 'pill';
    r.pill.hidden = false;
    r.pill.disabled = false;
    delete r.pill.dataset.act;
    r.force.hidden = true;
    r.pill.replaceChildren();
    if (phase === 'dealer') {
      r.pill.dataset.act = 'random';
      r.pill.classList.add('is-random');
      r.pill.append(icon('dice', 20), 'Zufällig');
    } else if (phase === 'result') {
      const check = L.roundCheck(game);
      if (check.status === 'ok') {
        r.pill.dataset.act = 'finish';
        r.pill.classList.add('is-go');
        r.pill.textContent = game.current + 1 >= game.totalRounds ? 'Spiel abschließen' : 'Runde abschließen';
      } else if (check.complete) {
        r.pill.classList.add('is-warn');
        r.pill.disabled = true;
        r.pill.textContent = check.message;
        r.force.hidden = false;
      } else {
        r.pill.hidden = true;
      }
    } else {
      r.pill.hidden = true;
    }
  }

  /** Lauflicht über die Spieler; löst auf, wenn es beim Ziel stehen geblieben ist. */
  sweep(steps) {
    this.busy = true;
    return new Promise((resolve) => {
      const total = steps.length;
      let k = 0;
      const show = (idx) => this.cells.forEach((c, n) => c.classList.toggle('sweep', n === idx));
      if (prefersReducedMotion()) {
        show(steps[total - 1]);
        setTimeout(() => {
          this.busy = false;
          resolve();
        }, 500);
        return;
      }
      const tick = () => {
        show(steps[k]);
        k += 1;
        if (k < total) {
          setTimeout(tick, 55 + 230 * Math.pow(k / total, 3));
        } else {
          setTimeout(() => {
            this.busy = false;
            resolve();
          }, 700);
        }
      };
      tick();
    });
  }

  nudgeForbidden() {
    this.cells.forEach((c) => {
      const sub = c._r.sub;
      if (!sub.classList.contains('forbid')) return;
      sub.classList.remove('nudge');
      void sub.offsetWidth;
      sub.classList.add('nudge');
    });
  }
}
