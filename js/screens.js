/* Startbildschirm (Namen) und Endwertung. */
import * as L from './logic.js';
import { h, icon, setScore } from './dom.js';
import { COLORS } from './board.js';

export function renderSetup(root, { settings, names, onNames, onCount, onSettings, onStart }) {
  const list = h('div', { class: 'name-list' });
  let current = names.slice();

  const buildList = () => {
    list.replaceChildren();
    for (let i = 0; i < settings.players; i++) {
      const input = h('input', {
        type: 'text',
        value: current[i] || '',
        placeholder: `Spieler ${i + 1}`,
        maxlength: '16',
        autocomplete: 'off',
        autocapitalize: 'words',
        spellcheck: 'false',
        enterkeyhint: i === settings.players - 1 ? 'done' : 'next',
        'aria-label': `Name Spieler ${i + 1}`,
      });
      input.addEventListener('input', () => {
        current[i] = input.value;
        onNames(current.slice());
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = list.querySelectorAll('input')[i + 1];
        if (next) next.focus();
        else input.blur();
      });
      list.append(
        h('label', { class: 'name-field', style: `--pc:${COLORS[i][0]}` }, h('span', { class: 'idx' }, String(i + 1)), input),
      );
    }
  };

  const count = h('span', { class: 'step-val' });
  const minus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Weniger Spieler', onclick: () => change(-1) }, icon('minus', 20));
  const plus = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Mehr Spieler', onclick: () => change(1) }, icon('plus', 20));
  const sync = () => {
    count.textContent = String(settings.players);
    minus.disabled = settings.players <= L.LIMITS.players[0];
    plus.disabled = settings.players >= L.LIMITS.players[1];
  };
  const change = (d) => {
    settings = onCount(settings.players + d);
    sync();
    buildList();
  };
  sync();
  buildList();

  root.replaceChildren(
    h(
      'div',
      { class: 'setup' },
      h('button', { class: 'icon-btn setup-gear', type: 'button', 'aria-label': 'Einstellungen', onclick: onSettings }, icon('sliders', 24)),
      h('h1', { class: 'logo' }, 'Stechen'),
      h(
        'div',
        { class: 'setup-body' },
        h('div', { class: 'row' }, h('div', { class: 'row-label' }, 'Spieler'), h('div', { class: 'stepper' }, minus, count, plus)),
        h('div', { class: 'names-head' }, h('span', {}, 'Namen'), h('small', {}, 'in der Reihenfolge im Uhrzeigersinn')),
        list,
      ),
      h('button', { class: 'cta', type: 'button', onclick: () => onStart() }, 'Weiter'),
    ),
  );
}

export function renderFinal(root, { game, settings, onTable, onUndo, onNew }) {
  const rank = L.ranking(game, settings);
  const winners = rank.filter((r) => r.rank === 1).length;
  const rows = rank.map((r, k) => {
    const score = h('div', { class: 'f-score' });
    const el = h(
      'div',
      { class: `f-row${r.rank === 1 ? ' first' : ''}`, style: `--pc:${COLORS[r.player][0]};--pc-rgb:${COLORS[r.player][1]};--d:${k * 90}ms` },
      h('div', { class: 'f-rank' }, String(r.rank)),
      h('div', { class: 'f-name' }, h('span', { class: 'swatch' }), h('span', {}, r.name)),
      score,
    );
    score._v = 0;
    score.textContent = '0';
    requestAnimationFrame(() => setScore(score, r.total));
    return el;
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'final' },
      h('div', { class: 'final-head' }, h('small', {}, 'Endwertung'), h('h1', {}, winners > 1 ? 'Gleichstand' : `${rank[0].name} gewinnt`)),
      h('div', { class: 'f-list' }, ...rows),
      h(
        'div',
        { class: 'final-actions' },
        h('button', { class: 'cta', type: 'button', onclick: onNew }, 'Neues Spiel'),
        h(
          'div',
          { class: 'final-sub' },
          h('button', { class: 'btn-text', type: 'button', onclick: onTable }, 'Punktetabelle'),
          h('button', { class: 'btn-text', type: 'button', onclick: onUndo }, 'Rückgängig'),
        ),
      ),
    ),
  );
}
