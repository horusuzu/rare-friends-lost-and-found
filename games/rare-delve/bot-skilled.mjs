/**
 * A stronger scripted player for balance tests (never shipped). On top of the basic bot it plays like an
 * experienced human: it test-drinks unknown potions when the room is quiet (unknown scrolls stay unread,
 * since one of them ends the dive), zaps wands and throws darts or potions at dangerous monsters before they close in, and burns crowds
 * with a Cinder Scroll.
 */
import { DIRS, DIR_LIST, ITEMS, SPECIES } from './data.ts';
import { canStep, visibleIdx } from './dungeon.ts';
import { bagRows, actOptions, press } from './game.ts';
import { heroAtk } from './turn.ts';
import { decide } from './bot.mjs';

const RANGE = 6;
const known = (s, k) => ['potion', 'scroll', 'wand'].includes(ITEMS[k].kind) ? s.run.known.includes(k) : true;
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function menuTo(s, row, option) {
  const buttons = ['menu'];
  for (let i = 0; i < row; i++) buttons.push('s');
  buttons.push('a');
  const at = actOptions({ ...s, scene: { k: 'bag', cur: row, from: 'dungeon' } }, row).indexOf(option);
  if (at < 0) return null;
  for (let i = 0; i < at; i++) buttons.push('s');
  buttons.push('a');
  return buttons;
}
const findRow = (s, pred) => bagRows(s).findIndex(r => typeof r.slot === 'number' && pred(r.item));

/** The first monster along direction d within RANGE, if the line is clear. */
function lineTarget(s, d) {
  const { map, mons } = s.run;
  let x = s.hero.x, y = s.hero.y;
  for (let i = 1; i <= RANGE; i++) {
    if (!canStep(map, x, y, d)) return null;
    x += DIRS[d][0]; y += DIRS[d][1];
    const m = mons.find(v => v.x === x && v.y === y);
    if (m) return { m, dist: i };
  }
  return null;
}

/** A monster is dangerous when it can take a big bite of our HP or will outlast a few of our blows. */
function dangerous(s, m) {
  const def = SPECIES[m.sp];
  return def.atk * 3 >= s.hero.hp || m.hp > heroAtk(s.hero) * 2.5 || def.quirk === 'archer' || def.quirk === 'sting' || def.quirk === 'rust';
}

function aim(s, d, row, option) {
  const menu = menuTo(s, row, option);
  return menu ? ['turn', d, ...menu] : null;
}

function ranged(s) {
  for (const d of DIR_LIST) {
    const hit = lineTarget(s, d);
    if (!hit || hit.m.sleep > 0) continue;
    const threat = dangerous(s, hit.m);
    if (threat) {
      const wand = findRow(s, i => ITEMS[i.k].kind === 'wand' && (i.c ?? 1) > 0 && (!known(s, i.k) || ['w_lull', 'w_slow', 'w_gust'].includes(i.k)));
      if (wand >= 0) return aim(s, d, wand, 'zap');
      const potion = findRow(s, i => ['p_doze', 'p_muddle'].includes(i.k) && known(s, i.k));
      if (potion >= 0) return aim(s, d, potion, 'throw');
    }
    if (hit.dist >= 2 || threat) {
      const dart = findRow(s, i => i.k === 'dart');
      if (dart >= 0) return aim(s, d, dart, 'throw');
    }
  }
  return null;
}

function quietTests(s) {
  if (s.hero.hp < s.hero.maxHp * 0.7) return null;
  const potion = findRow(s, i => ITEMS[i.k].kind === 'potion' && !known(s, i.k));
  if (potion >= 0) return menuTo(s, potion, 'use');
  return null;
}

export function decideSkilled(s, memo = {}) {
  if (s.scene.k !== 'dungeon' || s.hero.sleep > 0) return decide(s, memo);
  const vis = new Set(visibleIdx(s.run.map, s.hero.x, s.hero.y));
  const seen = s.run.mons.filter(m => vis.has(m.y * s.run.map.w + m.x));
  const awake = seen.filter(m => !(m.sleep > 0));
  if (awake.filter(m => cheb(m, s.hero) <= 2).length >= 2) {
    const blaze = findRow(s, i => i.k === 's_blaze' && known(s, 's_blaze'));
    if (blaze >= 0) return menuTo(s, blaze, 'use');
  }
  if (s.hero.hp < s.hero.maxHp * 0.5) {
    const mend = findRow(s, i => i.k === 'p_mend' && known(s, 'p_mend'));
    if (mend >= 0 && awake.length) return menuTo(s, mend, 'use');
  }
  if (awake.length) { const shot = ranged(s); if (shot) return shot; }
  if (!seen.length) { const test = quietTests(s); if (test) return test; }
  return decide(s, memo);
}

export function playDiveSkilled(s0, { maxTurns = 5000 } = {}) {
  let s = press(s0, 'a');
  const memo = {};
  let deepest = 1;
  while (s.run && s.run.turn < maxTurns) {
    for (const b of decideSkilled(s, memo)) { s = press(s, b); if (!s.run) break; }
    if (s.run) deepest = Math.max(deepest, s.run.floor);
  }
  const summary = s.scene.k === 'summary' ? s.scene : null;
  return { state: s, result: summary?.result ?? 'timeout', floor: summary?.floor ?? deepest, turns: summary?.turns ?? 0, level: summary?.level ?? 0, cause: summary?.cause ?? null };
}
