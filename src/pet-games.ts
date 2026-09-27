/**
 * Fixed per-game desktop pet settings. Only the trusted host reads this table; game code can never enable the pet,
 * open a window or choose what it shows.
 */
export type PetGame = Readonly<{ title: string }>;
export const PET_GAMES: Readonly<Record<string, PetGame>> = Object.freeze({
  'Rare Mine': Object.freeze({ title: 'Rare Mine' }),
});
export function petGame(name: string): PetGame | undefined {
  return Object.hasOwn(PET_GAMES, name) ? PET_GAMES[name] : undefined;
}
