/** Local record and settings, stored through the SDK client's saveLocal. */
export interface SavedRecord { best: number; bestTier: number; sound: boolean }
interface Saved { version: 1; best: number; bestTier: number; sound?: boolean }

export const EMPTY_RECORD: SavedRecord = { best: 0, bestTier: 0, sound: true };

/**
 * Throws on a corrupt record. The sound field was added later: saves without it,
 * or with an unexpected value, keep their record and default to sound on.
 */
export function parseSave(raw: string | null, maxTier: number): SavedRecord | null {
  if (!raw) return null;
  const saved = JSON.parse(raw) as Partial<Saved>;
  const ok = saved.version === 1 && Number.isSafeInteger(saved.best) && saved.best! >= 0 && saved.best! < 1e9 &&
    Number.isInteger(saved.bestTier) && saved.bestTier! >= 0 && saved.bestTier! <= maxTier;
  if (!ok) throw new Error('Invalid save');
  return { best: saved.best!, bestTier: saved.bestTier!, sound: typeof saved.sound === 'boolean' ? saved.sound : true };
}

export function serializeSave(record: SavedRecord): string {
  return JSON.stringify({ version: 1, best: record.best, bestTier: record.bestTier, sound: record.sound } satisfies Saved);
}
