/** Turn-based battle rules. Pure: every call returns new objects and advances the seeded RNG. */
import { MOVES, effectiveness, type Text } from './data.ts';
import { rand } from './rng.ts';
import { gainExp, isFainted, monText, speciesOf, statsOf, type Mon } from './mon.ts';

export type BattleKind = 'wild' | 'boss';
export type BattleResult = 'win' | 'lose' | 'run' | 'caught';
export type Sfx = 'hit' | 'miss' | 'faint' | 'level' | 'catch' | 'heal' | 'super' | 'weak' | 'run' | 'bump' | 'door' | 'confirm' | 'buy' | 'save' | 'encounter' | 'badge' | 'cancel';
export interface Battle {
  readonly kind: BattleKind; readonly foes: readonly Mon[]; readonly foe: number; readonly active: number;
  readonly runs: number; readonly over?: BattleResult; readonly mustSwitch?: boolean;
}
export interface Snap { readonly active: number; readonly myHp: number; readonly foe: number; readonly foeHp: number }
export interface Line { readonly text: Text; readonly sfx?: Sfx; readonly snap: Snap }
export interface Items { readonly ribbon: number; readonly herb: number }
export interface BattleCtx { readonly party: readonly Mon[]; readonly items: Items; readonly coins: number; readonly seed: number; readonly battle: Battle }
export type Action =
  | { readonly kind: 'move'; readonly slot: number }
  | { readonly kind: 'item'; readonly item: string }
  | { readonly kind: 'switch'; readonly to: number }
  | { readonly kind: 'run' };
export interface TurnResult { readonly ctx: BattleCtx; readonly lines: readonly Line[] }

export const HERB_HEAL = 20;
export const PARTY_MAX = 6;
export const LEADER: Text = ['師範コハク', 'Master Kohaku'];

export function startBattle(kind: BattleKind, foes: readonly Mon[], active = 0): Battle {
  if (foes.length === 0) throw new Error('A battle needs a foe');
  return { kind, foes: [...foes], foe: 0, active, runs: 0 };
}

export interface Damage { readonly amount: number; readonly effect: number; readonly stab: boolean }
/** Damage for one hit. `roll` in [0,1) sets the 85–100 % random factor. */
export function damage(attacker: Mon, defender: Mon, moveId: string, roll: number): Damage {
  const move = Object.hasOwn(MOVES, moveId) ? MOVES[moveId] : undefined;
  if (!move) throw new Error(`Unknown move ${moveId}`);
  const a = statsOf(attacker).atk, d = statsOf(defender).def;
  const effect = effectiveness(move.type, speciesOf(defender).type);
  const stab = move.type === speciesOf(attacker).type;
  const raw = (move.power * (a / d) * (attacker.level + 10)) / 60;
  const amount = Math.max(1, Math.floor(raw * (stab ? 1.5 : 1) * effect * (0.85 + 0.15 * roll)) + 1);
  return { amount, effect, stab };
}
/** Ribbon success chance: the species rate, scaled from one third at full hp to nearly all of it at 1 hp. */
export function captureChance(mon: Mon): number {
  const max = statsOf(mon).hp;
  return Math.min(1, Math.max(0, speciesOf(mon).catchRate * ((3 * max - 2 * mon.hp) / (3 * max))));
}
export function runChance(me: Mon, foe: Mon, attempts: number): number {
  const a = statsOf(me).spd, b = statsOf(foe).spd;
  return a >= b ? 1 : Math.min(1, 0.25 + (0.5 * a) / b + 0.2 * attempts);
}
export function expReward(foe: Mon, kind: BattleKind): number {
  return Math.floor(((speciesOf(foe).expYield * foe.level) / 4) * (kind === 'boss' ? 1.5 : 1));
}
export function coinReward(foe: Mon, kind: BattleKind): number { return kind === 'boss' ? 40 + foe.level * 10 : foe.level * 3; }

const t = (ja: string, en: string): Text => [ja, en];

/** Local, copy-on-write turn builder: the input context is never modified. */
function turn(ctx: BattleCtx) {
  let party = ctx.party, items = ctx.items, coins = ctx.coins, seed = ctx.seed, b = ctx.battle;
  const lines: Line[] = [];
  const roll = () => { const [v, next] = rand(seed); seed = next; return v; };
  const me = () => party[b.active], foe = () => b.foes[b.foe];
  const say = (text: Text, sfx?: Sfx) => {
    lines.push({ text, ...(sfx ? { sfx } : {}), snap: { active: b.active, myHp: me().hp, foe: b.foe, foeHp: foe().hp } });
  };
  const setMe = (mon: Mon) => { party = party.map((m, i) => i === b.active ? mon : m); };
  const setFoe = (mon: Mon) => { b = { ...b, foes: b.foes.map((m, i) => i === b.foe ? mon : m) }; };
  const nameOf = (mon: Mon, foeSide: boolean): Text => {
    const [ja, en] = monText(mon);
    return foeSide ? [`あいての ${ja}`, `Foe ${en}`] : [ja, en];
  };

  function foeFainted() {
    const down = foe(), n = nameOf(down, true);
    say(t(`${n[0]}は たおれた！`, `${n[1]} fainted!`), 'faint');
    if (!isFainted(me())) {
      const amount = expReward(down, b.kind), gain = gainExp(me(), amount), m = monText(me());
      say(t(`${m[0]}は ${amount} けいけんちを もらった！`, `${m[1]} gained ${amount} EXP!`));
      setMe(gain.mon);
      for (const level of gain.levels) say(t(`${m[0]}は レベル${level}に あがった！`, `${m[1]} grew to Lv ${level}!`), 'level');
      for (const id of gain.learned) say(t(`${m[0]}は ${MOVES[id].name[0]}を おぼえた！`, `${m[1]} learned ${MOVES[id].name[1]}!`), 'level');
    }
    const found = coinReward(down, b.kind);
    coins += found;
    say(t(`どんぐりを ${found}こ ひろった！`, `Picked up ${found} acorns!`));
    if (b.kind === 'boss' && b.foe + 1 < b.foes.length) {
      b = { ...b, foe: b.foe + 1 };
      const next = monText(foe());
      say(t(`${LEADER[0]}は ${next[0]}を くりだした！`, `${LEADER[1]} sends out ${next[1]}!`), 'encounter');
    } else b = { ...b, over: 'win' };
  }
  function meFainted() {
    const m = monText(me());
    say(t(`${m[0]}は たおれた！`, `${m[1]} fainted!`), 'faint');
    if (party.some(x => !isFainted(x))) b = { ...b, mustSwitch: true };
    else { b = { ...b, over: 'lose' }; say(t('みんな へとへとに なってしまった…', 'Your whole team is worn out...')); }
  }
  /** One attack; returns true when someone fainted (which ends the exchange). */
  function attack(foeSide: boolean, slot: number): boolean {
    const attacker = foeSide ? foe() : me(), defender = foeSide ? me() : foe();
    const moveSlot = attacker.moves[slot];
    const move = MOVES[moveSlot.id];
    const used: Mon = { ...attacker, moves: attacker.moves.map((m, i) => i === slot ? { ...m, pp: Math.max(0, m.pp - 1) } : m) };
    if (foeSide) setFoe(used); else setMe(used);
    const n = nameOf(attacker, foeSide);
    say(t(`${n[0]}の ${move.name[0]}！`, `${n[1]} used ${move.name[1]}!`));
    if (roll() * 100 >= move.accuracy) { say(t('こうげきは はずれた！', 'The attack missed!'), 'miss'); return false; }
    const hit = damage(used, defender, move.id, roll());
    const hurt: Mon = { ...defender, hp: Math.max(0, defender.hp - hit.amount) };
    if (foeSide) setMe(hurt); else setFoe(hurt);
    say(t(`${hit.amount}の ダメージ！`, `${hit.amount} damage!`), hit.effect > 1 ? 'super' : hit.effect < 1 ? 'weak' : 'hit');
    if (hit.effect > 1) say(t('ぐさっと きいた！', 'It hit a weak spot!'));
    if (hit.effect < 1) say(t('あまり きいていない…', 'It barely tickled...'));
    if (isFainted(hurt)) { if (foeSide) meFainted(); else foeFainted(); return true; }
    return false;
  }
  function foeSlot(): number {
    const usable = foe().moves.map((m, i) => m.pp > 0 ? i : -1).filter(i => i >= 0);
    return usable.length ? usable[Math.floor(roll() * usable.length)] : 0;
  }
  const foeAttacks = () => { attack(true, foeSlot()); };
  const done = (): TurnResult => ({ ctx: { party, items, coins, seed, battle: b }, lines });
  const setItems = (next: Items) => { items = next; };
  const addToParty = (mon: Mon) => { party = [...party, mon]; };
  const setBattle = (next: Battle) => { b = next; };
  return { roll, say, me, foe, setMe, attack, foeAttacks, foeSlot, done, setItems, addToParty, setBattle, battle: () => b, items: () => items, party: () => party };
}

function validateSwitch(ctx: BattleCtx, to: number) {
  if (!Number.isInteger(to) || to < 0 || to >= ctx.party.length) throw new Error('Invalid switch');
  if (to === ctx.battle.active) throw new Error('That member is already out');
  if (isFainted(ctx.party[to])) throw new Error('That member has fainted');
}

export function takeTurn(ctx: BattleCtx, action: Action): TurnResult {
  if (ctx.battle.over) throw new Error('The battle is over');
  if (ctx.battle.mustSwitch) throw new Error('Choose a member to switch in first');
  const T = turn(ctx);
  switch (action.kind) {
    case 'move': {
      const slot = T.me().moves[action.slot];
      if (!slot) throw new Error('Invalid move slot');
      if (slot.pp <= 0) { T.say(t('その わざは もう PPが ない！', 'No PP left for that move!')); return T.done(); }
      const mineFirst = statsOf(T.me()).spd >= statsOf(T.foe()).spd;
      if (mineFirst) { if (!T.attack(false, action.slot)) T.foeAttacks(); }
      else { const s = T.foeSlot(); if (!T.attack(true, s)) T.attack(false, action.slot); }
      return T.done();
    }
    case 'run': {
      const b = T.battle();
      if (b.kind === 'boss') { T.say(t('師範との しょうぶからは にげられない！', "You can't run from the master's match!")); return T.done(); }
      const chance = runChance(T.me(), T.foe(), b.runs);
      T.setBattle({ ...b, runs: b.runs + 1 });
      if (T.roll() < chance) { T.setBattle({ ...T.battle(), over: 'run' }); T.say(t('すたこら にげだした！', 'You slipped away!'), 'run'); return T.done(); }
      T.say(t('にげられなかった！', "Couldn't get away!"));
      T.foeAttacks();
      return T.done();
    }
    case 'item': {
      const items = T.items();
      if (action.item === 'ribbon') {
        if (T.battle().kind === 'boss') { T.say(t('師範の なかまには もう なかよしが いる！', "The master's partners already have a friend!")); return T.done(); }
        if (items.ribbon <= 0) { T.say(t('リボンが もう ない！', 'No ribbons left!')); return T.done(); }
        if (T.party().length >= PARTY_MAX) { T.say(t('なかまが いっぱいで むすべない！', 'Your party is full!')); return T.done(); }
        T.setItems({ ...items, ribbon: items.ribbon - 1 });
        const target = T.foe(), [ja, en] = monText(target);
        T.say(t('なかよしリボンを むすんだ！', 'You tie a Friend Ribbon...'));
        if (T.roll() < captureChance(target)) {
          T.addToParty(target);
          T.setBattle({ ...T.battle(), over: 'caught' });
          T.say(t(`${ja}と なかよしに なった！`, `${en} became your friend!`), 'catch');
          return T.done();
        }
        T.say(t('リボンが ほどけてしまった！', 'The ribbon slipped loose!'), 'miss');
        T.foeAttacks();
        return T.done();
      }
      if (action.item === 'herb') {
        const mon = T.me(), max = statsOf(mon).hp;
        if (items.herb <= 0) { T.say(t('ハーブが もう ない！', 'No herbs left!')); return T.done(); }
        if (mon.hp >= max) { T.say(t('いまは つかっても こうかが ない。', 'It would have no effect now.')); return T.done(); }
        T.setItems({ ...items, herb: items.herb - 1 });
        T.setMe({ ...mon, hp: Math.min(max, mon.hp + HERB_HEAL) });
        const [ja, en] = monText(mon);
        T.say(t(`${ja}の HPが かいふくした！`, `${en} recovered HP!`), 'heal');
        T.foeAttacks();
        return T.done();
      }
      throw new Error(`Unknown item ${action.item}`);
    }
    case 'switch': {
      validateSwitch(ctx, action.to);
      const out = monText(T.me());
      T.say(t(`もどって、${out[0]}！`, `Come back, ${out[1]}!`));
      T.setBattle({ ...T.battle(), active: action.to });
      const inn = monText(T.me());
      T.say(t(`${inn[0]}、たのんだ！`, `Go for it, ${inn[1]}!`));
      T.foeAttacks();
      return T.done();
    }
  }
}

/** After a faint: send in a healthy member without the foe getting a free hit. */
export function switchIn(ctx: BattleCtx, to: number): TurnResult {
  if (!ctx.battle.mustSwitch) throw new Error('No switch is required');
  if (!Number.isInteger(to) || to < 0 || to >= ctx.party.length) throw new Error('Invalid switch');
  if (isFainted(ctx.party[to])) throw new Error('That member has fainted');
  const T = turn({ ...ctx, battle: { ...ctx.battle, active: to, mustSwitch: false } });
  const inn = monText(T.me());
  T.say(t(`${inn[0]}、たのんだ！`, `Go for it, ${inn[1]}!`));
  return T.done();
}
