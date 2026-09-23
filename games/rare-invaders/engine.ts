/** Pure arcade simulation. Score is local arcade points, never RF. */
export const WIDTH = 480;
export const HEIGHT = 560;
export const PLAYER_Y = 510;
export interface Enemy { id: number; x: number; y: number; hp: number; kind: number }
export interface Shot { x: number; y: number; enemy: boolean }
export interface State {
  status: 'playing' | 'over' | 'won';
  playerX: number; lives: number; score: number; wave: number;
  enemies: Enemy[]; shots: Shot[]; time: number;
  shield: number; shieldCooldown: number; invincible: number;
  direction: number; fireCooldown: number; enemyFireCooldown: number;
}
export interface Input { move: number; fire: boolean; shield: boolean }
function fleet(wave: number): Enemy[] {
  return Array.from({ length: 24 }, (_, id) => ({
    id, x: 80 + (id % 8) * 44, y: 65 + Math.floor(id / 8) * 42,
    hp: wave >= 3 && id < 8 ? 2 : 1, kind: Math.floor(id / 8),
  }));
}
export function createGame(): State {
  return {
    status: 'playing', playerX: WIDTH / 2, lives: 3, score: 0, wave: 1,
    enemies: fleet(1), shots: [], time: 0, shield: 0, shieldCooldown: 0,
    invincible: 0, direction: 1, fireCooldown: 0, enemyFireCooldown: 1.4,
  };
}
function nextWave(s: State): State {
  if (s.wave === 5) return { ...s, status: 'won', shots: [] };
  const wave = s.wave + 1;
  return { ...s, wave, enemies: fleet(wave), shots: [], direction: 1, enemyFireCooldown: 1.2, invincible: 1 };
}
function moveFleet(s: State, dt: number): void {
  const distance = s.direction * (22 + s.wave * 9 + (24 - s.enemies.length) * 1.8) * dt;
  const bounce = s.enemies.some(e => e.x + distance < 18 || e.x + distance > WIDTH - 18);
  if (bounce) s.direction *= -1;
  s.enemies = s.enemies.map(e => ({ ...e, x: Math.max(18, Math.min(WIDTH - 18, e.x + (bounce ? -distance : distance))), y: e.y + (bounce ? 18 : 0) }));
}
function resolveShots(s: State, dt: number): void {
  s.shots = s.shots.flatMap(shot => {
    const next = { ...shot, y: shot.y + (shot.enemy ? 170 + s.wave * 15 : -440) * dt };
    if (next.y < -20 || next.y > HEIGHT + 20) return [];
    if (next.enemy) {
      if (Math.abs(next.x - s.playerX) < 17 && Math.abs(next.y - PLAYER_Y) < 17) {
        if (s.shield <= 0 && s.invincible <= 0) {
          s.lives -= 1;
          s.invincible = 1.4;
          if (s.lives <= 0) s.status = 'over';
        }
        return [];
      }
    } else {
      const target = s.enemies.find(e => e.hp > 0 && Math.abs(e.x - next.x) < 18 && Math.abs(e.y - next.y) < 18);
      if (target) {
        target.hp -= 1;
        if (target.hp === 0) s.score += 100 + target.kind * 50;
        return [];
      }
    }
    return [next];
  });
  s.enemies = s.enemies.filter(e => e.hp > 0);
}
export function step(state: State, input: Input, elapsed: number): State {
  if (state.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return state;
  const dt = Math.min(elapsed, .03);
  if (state.enemies.length === 0) return nextWave(state);
  const s: State = { ...state, shots: [...state.shots], time: state.time + dt };
  s.shield = Math.max(0, s.shield - dt);
  s.shieldCooldown = Math.max(0, s.shieldCooldown - dt);
  s.invincible = Math.max(0, s.invincible - dt);
  s.fireCooldown = Math.max(0, s.fireCooldown - dt);
  s.enemyFireCooldown -= dt;
  const move = Number.isFinite(input.move) ? Math.max(-1, Math.min(1, input.move)) : 0;
  s.playerX = Math.max(22, Math.min(WIDTH - 22, s.playerX + move * 280 * dt));
  if (input.shield && s.shieldCooldown === 0) { s.shield = 2; s.shieldCooldown = 8; }
  if (input.fire && s.fireCooldown === 0) {
    s.shots.push({ x: s.playerX, y: PLAYER_Y - 22, enemy: false });
    s.fireCooldown = .19;
  }
  moveFleet(s, dt);
  if (s.enemies.some(e => e.y >= PLAYER_Y - 28)) return { ...s, status: 'over' };
  if (s.enemyFireCooldown <= 0) {
    const shooter = s.enemies[Math.floor(s.time * 7) % s.enemies.length];
    s.shots.push({ x: shooter.x, y: shooter.y + 18, enemy: true });
    s.enemyFireCooldown = Math.max(.24, 1.05 - s.wave * .13);
  }
  resolveShots(s, dt);
  return s.status === 'playing' && s.enemies.length === 0 ? nextWave(s) : s;
}
