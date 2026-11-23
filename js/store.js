/* Persistenz im localStorage. Alles in einem Schlüssel, jeder Zugriff abgesichert. */
import { HISTORY_CAP, normalizeSettings, validateGame } from './logic.js';

const KEY = 'stechen:v1';

export function fresh() {
  return { settings: normalizeSettings({}), names: [], game: null, history: [] };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const game = validateGame(d.game) ? d.game : null;
    return {
      settings: normalizeSettings(d.settings),
      names: Array.isArray(d.names) ? d.names.filter((x) => typeof x === 'string').slice(0, 6) : [],
      game,
      history: game && Array.isArray(d.history) ? d.history.filter(validateGame).slice(-HISTORY_CAP) : [],
    };
  } catch {
    return fresh();
  }
}

/** Speichert den Zustand. Bei vollem Speicher wird zuerst der Verlauf gekürzt. */
export function save(state) {
  const attempt = (history) => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ settings: state.settings, names: state.names, game: state.game, history }),
    );
  };
  try {
    attempt(state.history);
    return true;
  } catch {
    try {
      attempt(state.history.slice(-30));
      return true;
    } catch {
      return false;
    }
  }
}
