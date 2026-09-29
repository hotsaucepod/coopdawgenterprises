import { FLOORS, RATING_START } from '../data/floors';

export interface FloorSave {
  purchased: string[];
  crate: Record<string, number>;  // storage room stock per product
  shelf: Record<string, number>;  // shelf stock per fixture id
  completed: boolean;
}

export interface SaveData {
  version: number;
  money: number;
  rating: number;
  currentFloor: string;
  unlockedFloors: string[];
  upgrades: { speed: number; carry: number };
  floors: Record<string, FloorSave>;
  won: boolean;
  lifetimeEarned: number;
}

const KEY = 'mall-tycoon-save-v1';

export function emptyFloorSave(): FloorSave {
  return { purchased: [], crate: {}, shelf: {}, completed: false };
}

export function newSave(): SaveData {
  return {
    version: 1,
    money: 20,
    rating: RATING_START,
    currentFloor: FLOORS[0].id,
    unlockedFloors: [FLOORS[0].id],
    upgrades: { speed: 0, carry: 0 },
    floors: { [FLOORS[0].id]: emptyFloorSave() },
    won: false,
    lifetimeEarned: 0,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newSave();
    const data = JSON.parse(raw) as SaveData;
    if (!data || data.version !== 1) return newSave();
    const base = newSave();
    return { ...base, ...data, upgrades: { ...base.upgrades, ...(data.upgrades ?? {}) } };
  } catch {
    return newSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode). The game still runs.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function floorSave(data: SaveData, floorId: string): FloorSave {
  if (!data.floors[floorId]) data.floors[floorId] = emptyFloorSave();
  return data.floors[floorId];
}
