/**
 * A scripted Rare Delve player for tests (never shipped). It sees what a player sees: explored tiles,
 * visible monsters and items. It explores, fights what comes adjacent, picks things up, eats, heals,
 * equips better gear and takes the stairs. Decisions are expressed as button presses so a browser
 * test can replay them exactly.
 */
import { DIRS, DIR_LIST, ITEMS } from './data.ts';
import { canStep, visibleIdx } from './dungeon.ts';
import { bagRows, actOptions, press } from './game.ts';
import { heroAtk, heroDef } from './turn.ts';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function visibleSet(s) { return new Set(visibleIdx(s.run.map, s.hero.x, s.hero.y)); }

/** BFS from the hero over explored floor, avoiding monsters and known traps; returns the first step toward the goal. */
export function stepToward(s, isGoal, { through = false } = {}) {
  const { map, seen, mons, traps } = s.run, w = map.w;
  const blocked = new Set([...mons.map(m => m.y * w + m.x), ...traps.filter(t => t.found).map(t => t.y * w + t.x)]);
  const start = s.hero.y * w + s.hero.x;
  const first = new Map([[start, null]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q], x = cur % w, y = (cur - x) / w;
    if (cur !== start && isGoal(x, y)) return first.get(cur);
    for (const d of DIR_LIST) {
      if (!canStep(map, x, y, d)) continue;
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy, n = ny * w + nx;
      if (first.has(n) || (!through && seen[n] !== '1')) continue;
      if (blocked.has(n) && !isGoal(nx, ny)) continue;
      first.set(n, cur === start ? d : first.get(cur));
      queue.push(n);
    }
  }
  return null;
}

function menuTo(s, row, option) {
  const buttons = ['menu'];
  for (let i = 0; i < row; i++) buttons.push('s');
  buttons.push('a');
  const opts = actOptions({ ...s, scene: { k: 'bag', cur: row, from: 'dungeon' } }, row);
  const at = opts.indexOf(option);
  if (at < 0) return null;
  for (let i = 0; i < at; i++) buttons.push('s');
  buttons.push('a');
  return buttons;
}

function findRow(s, pred) { return bagRows(s).findIndex(r => typeof r.slot === 'number' && pred(r.item)); }
const known = (s, k) => ['potion', 'scroll', 'wand'].includes(ITEMS[k].kind) ? s.run.known.includes(k) : true;

/** One decision: a short list of buttons. */
export function decide(s, memo = {}) {
  if (s.scene.k === 'summary' || s.scene.k === 'pick') return ['a'];
  if (s.scene.k !== 'dungeon') return ['b'];
  const h = s.hero, r = s.run, vis = visibleSet(s);
  if (h.sleep > 0) return ['wait'];
  const low = h.hp < h.maxHp * 0.4;
  if (low) {
    const heal = findRow(s, i => i.k === 'mendleaf' || (i.k === 'p_mend' && known(s, 'p_mend')));
    if (heal >= 0) return menuTo(s, heal, 'use');
    if (h.hp < h.maxHp * 0.25) {
      const gamble = findRow(s, i => ITEMS[i.k].kind === 'potion' && !known(s, i.k));
      if (gamble >= 0) return menuTo(s, gamble, 'use');
      const home = findRow(s, i => i.k === 's_home' && known(s, 's_home'));
      if (home >= 0 && h.hp < h.maxHp * 0.2) return menuTo(s, home, 'use');
    }
  }
  if (h.full < 12) {
    const food = findRow(s, i => i.k === (h.full < 1 ? 'loaf' : 'bun')) >= 0 ? findRow(s, i => i.k === (h.full < 1 ? 'loaf' : 'bun')) : findRow(s, i => ITEMS[i.k].kind === 'food');
    if (food >= 0) return menuTo(s, food, 'use');
  }
  if (h.str < h.maxStr) { const cure = findRow(s, i => i.k === 'clearroot'); if (cure >= 0) return menuTo(s, cure, 'use'); }
  const grow = findRow(s, i => i.k === 'sprout'); if (grow >= 0) return menuTo(s, grow, 'use');
  for (const [kind, score] of [['weapon', x => heroAtk({ ...h, weapon: x })], ['shield', x => heroDef({ ...h, shield: x })]]) {
    const cur = kind === 'weapon' ? heroAtk(h) : heroDef(h);
    const better = findRow(s, i => ITEMS[i.k].kind === kind && score(i) > cur);
    if (better >= 0) return menuTo(s, better, 'equip');
  }
  const enchant = findRow(s, i => (i.k === 's_edge' && h.weapon && known(s, 's_edge')) || (i.k === 's_guard' && h.shield && known(s, 's_guard')));
  if (enchant >= 0) return menuTo(s, enchant, 'use');

  const seenMons = r.mons.filter(m => vis.has(m.y * r.map.w + m.x));
  const target = seenMons.find(m => cheb(m, h) === 1 && DIR_LIST.some(d => DIRS[d][0] === m.x - h.x && DIRS[d][1] === m.y - h.y && canStep(r.map, h.x, h.y, d)));
  if (target) return [DIR_LIST.find(d => DIRS[d][0] === target.x - h.x && DIRS[d][1] === target.y - h.y)];
  // An archer or a monster across a corner: close the distance.
  const near = seenMons.filter(m => cheb(m, h) <= 3 && !(m.sleep > 0));
  if (near.length) { const d = stepToward(s, (x, y) => near.some(m => cheb(m, { x, y }) === 1) && !near.some(m => m.x === x && m.y === y)); if (d) return [d]; }

  const onStairs = r.map.stairs[0] === h.x && r.map.stairs[1] === h.y && r.floor < 10;
  memo.floorTurns = memo.floor === r.floor ? memo.floorTurns + 1 : 0; memo.floor = r.floor;
  const hungry = h.full < 25 && findRow(s, i => ITEMS[i.k].kind === 'food') < 0;
  const leave = memo.floorTurns > 260 || hungry;
  if (onStairs && leave) return ['a'];
  const bagFull = h.bag.length >= 20;
  const wanted = r.items.filter(f => vis.has(f.y * r.map.w + f.x) && (f.item.k === 'gold' || f.item.k === 'lantern' || !bagFull));
  if (!leave || wanted.some(f => f.item.k === 'lantern')) {
    const want = stepToward(s, (x, y) => r.items.some(f => f.x === x && f.y === y && (f.item.k === 'gold' || f.item.k === 'lantern' || !bagFull)) && r.seen[y * r.map.w + x] === '1');
    if (want && wanted.length) return [want];
  }
  const stairsSeen = r.seen[r.map.stairs[1] * r.map.w + r.map.stairs[0]] === '1';
  if (r.floor === 10 && stairsSeen) { const d = stepToward(s, (x, y) => x === r.map.stairs[0] && y === r.map.stairs[1]); if (d) return [d]; }
  if (!leave) {
    const explore = stepToward(s, (x, y) => DIR_LIST.some(d => { const nx = x + DIRS[d][0], ny = y + DIRS[d][1]; return nx >= 0 && ny >= 0 && nx < r.map.w && ny < r.map.h && r.seen[ny * r.map.w + nx] !== '1'; }));
    if (explore) return [explore];
  }
  if (onStairs) return ['a'];
  if (stairsSeen) { const d = stepToward(s, (x, y) => x === r.map.stairs[0] && y === r.map.stairs[1]); if (d) return [d]; }
  const any = stepToward(s, (x, y) => x === r.map.stairs[0] && y === r.map.stairs[1], { through: true });
  return [any ?? 'wait'];
}

/** Play one whole dive from town until it ends; returns stats and the button log. */
export function playDive(s0, { maxTurns = 5000 } = {}) {
  let s = press(s0, 'a');
  const buttons = ['a'], memo = {};
  let deepest = 1, presses = 1;
  while (s.run && s.run.turn < maxTurns) {
    for (const b of decide(s, memo)) { s = press(s, b); buttons.push(b); presses++; if (!s.run) break; }
    if (s.run) deepest = Math.max(deepest, s.run.floor);
  }
  const summary = s.scene.k === 'summary' ? s.scene : null;
  return { state: s, result: summary?.result ?? 'timeout', floor: summary?.floor ?? deepest, turns: summary?.turns ?? 0, level: summary?.level ?? 0, cause: summary?.cause ?? null, presses, buttons };
}
