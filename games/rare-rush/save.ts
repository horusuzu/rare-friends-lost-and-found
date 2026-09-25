/** Local record and settings, stored through the SDK client's saveLocal. */
export interface SavedRecord { best: number; bestDistance: number; topSpeed: number; sound: boolean }
interface Saved { version: 1; best: number; bestDistance: number; topSpeed: number; sound?: boolean }

export const EMPTY_RECORD: SavedRecord = { best: 0, bestDistance: 0, topSpeed: 0, sound: true };

/**
 * Throws on a corrupt record. The sound field was added later: saves without it,
 * or with an unexpected value, keep their record and default to sound on.
 */
export function parseSave(raw: string | null): SavedRecord | null {
  if (!raw) return null;
  const v = JSON.parse(raw) as Partial<Saved>;
  const ok = v.version === 1 && [v.best, v.bestDistance, v.topSpeed].every(n => Number.isSafeInteger(n) && n! >= 0 && n! < 1e9);
  if (!ok) throw new Error('Invalid save');
  return { best: v.best!, bestDistance: v.bestDistance!, topSpeed: v.topSpeed!, sound: typeof v.sound === 'boolean' ? v.sound : true };
}

export function serializeSave(record: SavedRecord): string {
  return JSON.stringify({ version: 1, best: record.best, bestDistance: record.bestDistance, topSpeed: record.topSpeed, sound: record.sound } satisfies Saved);
}
