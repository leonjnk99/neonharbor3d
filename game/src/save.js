// Save / load via localStorage. Pure except for the localStorage global,
// which tests mock before importing.

import { SAVE_KEY, MISSIONS } from './config.js';

export function saveGame(world) {
  try {
    const data = {
      missionIndex: world.mission ? world.missionIndex : MISSIONS.length,
      cash: world.cash,
      kills: world.kills,
      bestWanted: world.bestWanted,
      missionsDone: world.missionsDone,
    };
    globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { globalThis.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
