/** Fixed per-game score-share settings. Game code can never supply a URL or title. */
export type ScoreGame = Readonly<{ title: string; url: string; maxWave: number; copy: 'waves' | 'tiers' | 'speed' | 'burn' }>;
export const SCORE_GAMES: Readonly<Record<string, ScoreGame>> = Object.freeze({
  'Rare Invaders': Object.freeze({ title: 'RARE INVADERS', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/invaders/', maxWave: 5, copy: 'waves' }),
  'Rare Drop': Object.freeze({ title: 'RARE DROP', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/drop/', maxWave: 11, copy: 'tiers' }),
  /** Rare Rush sends its top speed in km/h as the second value. */
  'Rare Rush': Object.freeze({ title: 'RARE RUSH', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/rush/', maxWave: 450, copy: 'speed' }),
  /** Rare Mine sends its simulated burned total as the score and its best win streak (1–20) as the second value; status 'won' means a streak exists. */
  'Rare Mine': Object.freeze({ title: 'RARE MINE', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/mine/', maxWave: 20, copy: 'burn' }),
});
export function scoreGame(name: string): ScoreGame | undefined {
  return Object.hasOwn(SCORE_GAMES, name) ? SCORE_GAMES[name] : undefined;
}
