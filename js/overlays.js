/* Overlays: Menü, Punktetabelle, Einstellungen, Rückfrage. */
import * as L from './logic.js';
import { h, icon, fmtNum } from './dom.js';
import { COLORS } from './board.js';

const root = () => document.getElementById('overlay-root');

function openModal(content, { className = '', onClose } = {}) {
  const back = h('div', { class: 'backdrop' });
  const sheet = h('div', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true' }, content);
  const wrap = h('div', { class: 'modal' }, back, sheet);
  root().append(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('in');
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 240);
    onClose?.(result);
  };
  back.addEventListener('click', () => close());
  wrap._close = close;
  return { close, el: sheet, wrap };
}

/** Escape schließt das oberste Overlay. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...root().querySelectorAll('.modal:not(.out)')];
  open[open.length - 1]?._close?.();
});

export const anyOverlayOpen = () => root().querySelector('.modal:not(.out)') !== null;

/* ------------------------------------------------------------------ */

export function confirmDialog({ title, text, confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal(
      h(
        'div',
        { class: 'dialog' },
        h('h2', {}, title),
        text ? h('p', {}, text) : null,
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn-text', type: 'button', onclick: () => m.close() }, cancelLabel),
          h(
            'button',
            {
              class: `btn-solid${danger ? ' danger' : ''}`,
              type: 'button',
              onclick: () => {
                result = true;
                m.close();
              },
            },
            confirmLabel,
          ),
        ),
      ),
      { className: 'sheet-center', onClose: () => resolve(result) },
    );
  });
}

/* ------------------------------------------------------------------ */

export function openMenu({ canUndo, onUndo, onTable, onSettings, onNew }) {
  const item = (ic, label, fn, disabled = false) =>
    h(
      'button',
      {
        class: 'menu-item',
        type: 'button',
        disabled,
        onclick: () => {
          m.close();
          setTimeout(fn, 60);
        },
      },
      icon(ic, 22),
      h('span', {}, label),
    );
  const m = openModal(
    h(
      'div',
      { class: 'menu' },
      item('undo', 'Rückgängig', onUndo, !canUndo),
      item('table', 'Punktetabelle', onTable),
      item('sliders', 'Einstellungen', onSettings),
      item('refresh', 'Neues Spiel', onNew),
    ),
    { className: 'sheet-center sheet-menu' },
  );
  return m;
}

/* ------------------------------------------------------------------ */

export function openTable({ game, settings }) {
  const rows = L.tableRows(game, settings);
  const tot = L.totals(game, settings);
  const lead = new Set(L.leaders(game, settings));
  const dealerNow = game.phase === 'dealer' ? null : L.dealerOf(game, game.current);

  const head = h(
    'tr',
    {},
    h('th', { class: 'rcol' }, ''),
    ...game.players.map((name, i) =>
      h(
        'th',
        { class: lead.has(i) ? 'lead' : '', style: `--pc:${COLORS[i][0]}` },
        h('span', { class: 'th-name' }, name),
      ),
    ),
  );
  const body = rows.map((row) =>
    h(
      'tr',
      { class: row.done ? '' : 'current' },
      h('th', { class: 'rcol', scope: 'row' }, String(row.round)),
      ...row.cells.map((c, i) => {
        const dealer = row.dealer === i;
        return h(
          'td',
          { class: dealer ? 'is-dealer' : '' },
          row.done
            ? [h('div', { class: `pts${c.points < 0 ? ' neg' : ''}` }, fmtNum(c.points)), h('small', {}, `${c.bid}/${c.tricks}`)]
            : [h('div', { class: 'pts none' }, '·'), h('small', {}, c.bid === null ? '' : `${c.bid}/–`)],
        );
      }),
    ),
  );
  const foot = h(
    'tr',
    { class: 'sum' },
    h('th', { class: 'rcol' }, 'Σ'),
    ...tot.map((t, i) => h('td', { class: lead.has(i) ? 'lead' : '', style: `--pc:${COLORS[i][0]}` }, fmtNum(t))),
  );

  const scroller = h('div', { class: 'table-scroll' }, h('table', { class: 'score-table' }, h('thead', {}, head), h('tbody', {}, body), h('tfoot', {}, foot)));
  const m = openModal(
    h(
      'div',
      { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Punktetabelle'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: () => m.close() }, icon('close', 22))),
      scroller,
    ),
    { className: 'sheet-full' },
  );
  // aktuelle Zeile sichtbar machen
  requestAnimationFrame(() => scroller.querySelector('tr.current')?.scrollIntoView({ block: 'nearest' }));
  return m;
}

/* ------------------------------------------------------------------ */

export function openSettings({ settings, game, version, canInstall, onChange, onInstall, onNewGame, onDeleteGame, onClose }) {
  let s = settings;
  const setters = [];
  const reg = (fn) => {
    setters.push(fn);
    fn();
  };
  const set = (key, value) => {
    s = onChange(key, value);
    setters.forEach((f) => f());
  };

  const stepper = (label, key, { note, fmt = String } = {}) => {
    const [lo, hi] = L.LIMITS[key];
    const val = h('span', { class: 'step-val' });
    const minus = h('button', { class: 'step-btn', type: 'button', 'aria-label': `${label} verringern`, onclick: () => set(key, s[key] - 1) }, icon('minus', 20));
    const plus = h('button', { class: 'step-btn', type: 'button', 'aria-label': `${label} erhöhen`, onclick: () => set(key, s[key] + 1) }, icon('plus', 20));
    reg(() => {
      val.textContent = fmt(s[key]);
      minus.disabled = s[key] <= lo;
      plus.disabled = s[key] >= hi;
    });
    return h('div', { class: 'row' }, h('div', { class: 'row-label' }, label, note ? h('small', {}, note) : null), h('div', { class: 'stepper' }, minus, val, plus));
  };

  const running = game && game.phase !== 'finished';
  const later = running ? 'gilt ab dem nächsten Spiel' : null;

  const layoutSeg = h('div', { class: 'seg' });
  [['quadrants', 'Quadranten'], ['list', 'Liste']].forEach(([val, text]) => {
    const b = h('button', { type: 'button', onclick: () => set('layout', val) }, text);
    reg(() => b.classList.toggle('on', s.layout === val));
    layoutSeg.append(b);
  });

  const vib = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': 'Vibration' }, h('i'));
  vib.addEventListener('click', () => set('vibrate', !s.vibrate));
  reg(() => {
    vib.classList.toggle('on', s.vibrate);
    vib.setAttribute('aria-checked', String(s.vibrate));
  });

  const section = (title, ...rows) => h('section', { class: 'group' }, h('h3', {}, title), ...rows);

  const m = openModal(
    h(
      'div',
      { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Einstellungen'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen', onclick: () => m.close() }, icon('close', 22))),
      h(
        'div',
        { class: 'panel-body' },
        section(
          'Spiel',
          stepper('Spieler', 'players', { note: later }),
          stepper('Runden', 'rounds'),
          stepper('Ansageverbot ab Runde', 'noExactFrom', { note: later, fmt: (v) => (v >= 26 ? 'aus' : String(v)) }),
        ),
        section(
          'Punkte',
          stepper('Treffer', 'hitBase', { note: 'Grundpunkte' }),
          stepper('Treffer pro Ansage-Stich', 'perBid'),
          stepper('Gelungene 0', 'zeroBase', { note: 'Grundpunkte' }),
          stepper('Gelungene 0 pro Karte', 'zeroPerCard'),
          stepper('Abzug pro Stich daneben', 'penalty'),
          h('p', { class: 'fine' }, 'Änderungen rechnen alle Runden sofort neu.'),
        ),
        section('Anzeige', h('div', { class: 'row' }, h('div', { class: 'row-label' }, 'Ansicht'), layoutSeg), h('div', { class: 'row' }, h('div', { class: 'row-label' }, 'Vibration'), vib)),
        section(
          'Spiel verwalten',
          h(
            'div',
            { class: 'btn-col' },
            canInstall ? h('button', { class: 'btn-wide', type: 'button', onclick: onInstall }, icon('download', 20), 'Als App installieren') : null,
            game
              ? h('button', { class: 'btn-wide', type: 'button', onclick: () => { m.close(); setTimeout(onNewGame, 60); } }, icon('refresh', 20), 'Neues Spiel')
              : null,
            game
              ? h('button', { class: 'btn-wide danger', type: 'button', onclick: () => { m.close(); setTimeout(onDeleteGame, 60); } }, icon('trash', 20), 'Spiel löschen')
              : null,
          ),
        ),
        h('p', { class: 'version' }, `Stechen · Version ${version}`),
      ),
    ),
    { className: 'sheet-full', onClose },
  );
  return m;
}
