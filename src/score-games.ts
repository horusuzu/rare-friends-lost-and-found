/** Fixed per-game score-share settings. Game code can never supply a URL or title. */
export type ScoreGame = Readonly<{ title: string; url: string; maxWave: number }>;
export const SCORE_GAMES: Readonly<Record<string, ScoreGame>> = Object.freeze({
  'Rare Invaders': Object.freeze({ title: 'RARE INVADERS', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/invaders/', maxWave: 5 }),
  'Rare Drop': Object.freeze({ title: 'RARE DROP', url: 'https://horusuzu.github.io/rare-friends-lost-and-found/drop/', maxWave: 11 }),
});
export function scoreGame(name: string): ScoreGame | undefined {
  return Object.hasOwn(SCORE_GAMES, name) ? SCORE_GAMES[name] : undefined;
}
