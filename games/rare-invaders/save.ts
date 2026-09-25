/** Local save: the personal best and the sound setting. Version 1 saves from before the setting load with sound on. */
export interface Save { best: number; sound: boolean }

/** Throws on malformed JSON (the caller reports it); an unrecognised save starts fresh, as before. */
export function parseSave(raw: string | null): Save {
  if (raw === null) return { best: 0, sound: true };
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { best: 0, sound: true };
  const { version, best, sound } = saved as { version?: unknown; best?: unknown; sound?: unknown };
  const validBest = version === 1 && Number.isSafeInteger(best) && (best as number) >= 0 && (best as number) < 1e9;
  if (!validBest) return { best: 0, sound: true };
  return { best: best as number, sound: typeof sound === 'boolean' ? sound : true };
}

export function serializeSave(save: Save): string {
  return JSON.stringify({ version: 1, best: save.best, sound: save.sound });
}
