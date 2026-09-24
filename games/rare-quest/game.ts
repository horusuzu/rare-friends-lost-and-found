/** Top-level Rare Quest state machine: overworld, dialogue, menus, shop and battle UI. Pure and deterministic. */
import { ITEMS, MOVES, WILD_SPECIES, type ItemId, type Text } from './data.ts';
import { createMon, healMon, isFainted, isToken, monText, statsOf, type Mon } from './mon.ts';
import { HERB_HEAL, LEADER, startBattle, switchIn, takeTurn, type Action, type Battle, type BattleKind, type BattleResult, type Items, type Line, type Sfx, type Snap, type TurnResult } from './battle.ts';
import { HOME_RESPAWN, MAPS, REST_RESPAWN, START, facingTarget, isBlocked, isGrass, rollEncounter, stepFrom, warpAt, type Dir } from './world.ts';
import { npcScript, type Effect } from './story.ts';

export type Button = Dir | 'a' | 'b' | 'menu';
export type BattleUi = 'lines' | 'main' | 'fight' | 'bag' | 'party';
export type Scene =
  | { readonly k: 'world' }
  | { readonly k: 'talk'; readonly lines: readonly Text[]; readonly i: number; readonly then?: Effect }
  | { readonly k: 'menu'; readonly cur: number }
  | { readonly k: 'party'; readonly cur: number; readonly mode: 'view' | 'herb' }
  | { readonly k: 'bag'; readonly cur: number }
  | { readonly k: 'shop'; readonly cur: number }
  | { readonly k: 'battle'; readonly b: Battle; readonly ui: BattleUi; readonly cur: number; readonly lines: readonly Line[]; readonly li: number; readonly forced?: boolean };
export interface Flags { readonly lab: boolean; readonly badge: boolean; readonly rest: boolean }
export interface Walk { readonly fromX: number; readonly fromY: number; readonly t: number }
export interface GameState {
  readonly token: string; readonly seed: number;
  readonly map: string; readonly x: number; readonly y: number; readonly face: Dir; readonly walk: Walk | null;
  readonly party: readonly Mon[]; readonly items: Items; readonly coins: number; readonly flags: Flags;
  readonly seen: readonly string[]; readonly caught: readonly string[]; readonly steps: number;
  readonly scene: Scene;
  /** Manual save in progress: input waits for `saveResult`. */
  readonly saving: boolean;
  /** Incremented whenever the adapter should persist (manual save, healing, badge). */
  readonly saveTick: number;
  readonly saveError: boolean;
  readonly sfx: { readonly n: number; readonly id: Sfx };
  readonly last: BattleResult | null;
  readonly bump: number;
  readonly clock: number;
}

export const STEP_TIME = 0.2;
export const ITEM_CAP = 99;
export const COIN_CAP = 99999;
export const START_COINS = 100;
export const MAIN_MENU: readonly Text[] = [['なかま', 'PARTY'], ['どうぐ', 'ITEMS'], ['ノート', 'NOTES'], ['セーブ', 'SAVE'], ['とじる', 'CLOSE']];
export const BATTLE_MENU: readonly Text[] = [['たたかう', 'FIGHT'], ['どうぐ', 'ITEM'], ['なかま', 'PARTY'], ['にげる', 'RUN']];
export const BAG: readonly ItemId[] = ['ribbon', 'herb'];
export const SHOP: readonly (ItemId | 'leave')[] = ['ribbon', 'herb', 'leave'];
export const BOSS_TEAM: readonly (readonly [string, number])[] = [['pillowstone', 7], ['lanternbo', 8], ['grovelet', 10]];

const t = (ja: string, en: string): Text => [ja, en];
const world: Scene = { k: 'world' };
const withSfx = (s: GameState, id: Sfx): GameState => ({ ...s, sfx: { n: s.sfx.n + 1, id } });
const talk = (s: GameState, lines: readonly Text[], then?: Effect): GameState => ({ ...s, scene: { k: 'talk', lines, i: 0, ...(then ? { then } : {}) } });
const wrap = (cur: number, delta: number, n: number) => (cur + delta + n) % n;

export function newGame(token: string, seed: number): GameState {
  if (!isToken(token)) throw new Error('Invalid partner token');
  const partner = createMon('friend', 5, token);
  const [ja, en] = monText(partner);
  return {
    token, seed: seed >>> 0, map: START.map, x: START.x, y: START.y, face: START.face, walk: null,
    party: [partner], items: { ribbon: 3, herb: 2 }, coins: START_COINS, flags: { lab: false, badge: false, rest: false },
    seen: [], caught: [], steps: 0, saving: false, saveTick: 0, saveError: false, sfx: { n: 0, id: 'confirm' }, last: null, bump: 0, clock: 0,
    scene: {
      k: 'talk', i: 0, lines: [
        t(`ここは モエギ村。きみは ${ja}。`, `This is Moegi Village. You are ${en}.`),
        t('おばあちゃん「たびに でるなら これを もっていきな」', 'Grandma: "Off on a journey? Take these with you."'),
        t('なかよしリボン×3 と げんきハーブ×2 を もらった！', 'Got 3 Friend Ribbons and 2 Pep Herbs!'),
        t('きたの わかば小道を ぬけて、ヒスイ道場の バッジを めざそう！', 'Head north along the Sprout Trail and win the Jade Dojo badge!'),
        t('※ どうぐ・どんぐり・バトルは すべて むりょうの シミュレーション（RFでは ありません）', 'Note: items, acorns and battles are a free simulation (not RF).'),
      ],
    },
  };
}

// ---------- overworld ----------

function arrive(s: GameState): GameState {
  const here: GameState = { ...s, walk: null };
  const w = warpAt(here.map, here.x, here.y);
  if (w) return withSfx({ ...here, map: w.to, x: w.tx, y: w.ty }, 'door');
  if (!isGrass(here.map, here.x, here.y)) return here;
  const roll = rollEncounter(here.map, here.seed);
  const next = { ...here, seed: roll.seed };
  return roll.mon ? beginBattle(next, 'wild', [roll.mon]) : next;
}

/** Advance walking by `dt` seconds while `held` is pressed. */
export function tick(s: GameState, held: Dir | null, dt: number): GameState {
  if (!Number.isFinite(dt) || dt <= 0) return s;
  let state: GameState = { ...s, clock: s.clock + dt, bump: Math.max(0, s.bump - dt) };
  let remaining = dt;
  for (let guard = 0; remaining > 1e-9 && guard < 64 && state.scene.k === 'world' && !state.saving; guard++) {
    if (state.walk) {
      const need = STEP_TIME - state.walk.t;
      if (remaining < need) { state = { ...state, walk: { ...state.walk, t: state.walk.t + remaining } }; remaining = 0; break; }
      remaining -= need;
      state = arrive(state);
      continue;
    }
    if (!held) break;
    const p = stepFrom(state.x, state.y, held);
    if (isBlocked(state.map, p.x, p.y)) {
      state = { ...state, face: held };
      if (state.bump <= 0) state = { ...withSfx(state, 'bump'), bump: 0.3 };
      break;
    }
    state = { ...state, face: held, walk: { fromX: state.x, fromY: state.y, t: 0 }, x: p.x, y: p.y, steps: state.steps + 1 };
  }
  return state;
}

function interact(s: GameState): GameState {
  if (s.walk) return s;
  const target = facingTarget(s.map, s.x, s.y, s.face);
  if (!target) return s;
  if (target.kind === 'sign') return withSfx(talk(s, target.lines), 'confirm');
  const script = npcScript(target.id, s.flags);
  return withSfx(talk(s, script.lines, script.then), 'confirm');
}

function applyEffect(s: GameState, effect: Effect | undefined): GameState {
  switch (effect) {
    case undefined: return s;
    case 'heal': return withSfx(talk({ ...s, party: s.party.map(healMon), saveTick: s.saveTick + 1 }, [t('……みんな すっかり げんきに なった！', '...Everyone is fully rested!')]), 'heal');
    case 'rest': return withSfx(talk({ ...s, party: s.party.map(healMon), flags: { ...s.flags, rest: true }, saveTick: s.saveTick + 1 },
      [t('……みんな すっかり げんきに なった！', '...Everyone is fully rested!'), t('ハナ「また いつでも きてね」', 'Hana: "Come back any time."')]), 'heal');
    case 'lab': return withSfx(talk({ ...s, items: { ...s.items, ribbon: Math.min(ITEM_CAP, s.items.ribbon + 5) }, flags: { ...s.flags, lab: true } },
      [t('なかよしリボンを 5こ もらった！', 'Received 5 Friend Ribbons!')]), 'buy');
    case 'shop': return { ...s, scene: { k: 'shop', cur: 0 } };
    case 'boss': return beginBattle(s, 'boss', BOSS_TEAM.map(([id, lv]) => createMon(id, lv)));
  }
}

function notes(s: GameState): readonly Text[] {
  return [
    t(`モンスターノート: みた ${s.seen.length} / なかよし ${s.caught.length} / ぜんぶ ${WILD_SPECIES.length}`,
      `Monster notes: seen ${s.seen.length} / befriended ${s.caught.length} / total ${WILD_SPECIES.length}`),
    s.flags.badge ? t('バッジ: ヒスイバッジ ✓', 'Badge: Jade Badge ✓') : t('バッジ: まだ ない（ヒスイ道場で ちょうせん）', 'Badge: none yet (challenge the Jade Dojo)'),
    t(`どんぐり: ${s.coins}こ（シミュレーション・RFでは ない）`, `Acorns: ${s.coins} (simulated, not RF)`),
  ];
}

function pressWorld(s: GameState, button: Button): GameState {
  if (button === 'a') return interact(s);
  if (button === 'menu' && !s.walk) return withSfx({ ...s, scene: { k: 'menu', cur: 0 } }, 'confirm');
  return s;
}
function pressTalk(s: GameState, scene: Extract<Scene, { k: 'talk' }>, button: Button): GameState {
  if (button !== 'a' && button !== 'b') return s;
  if (scene.i + 1 < scene.lines.length) return { ...s, scene: { ...scene, i: scene.i + 1 } };
  return applyEffect({ ...s, scene: world }, scene.then);
}
function pressMenu(s: GameState, cur: number, button: Button): GameState {
  if (button === 'up' || button === 'down') return { ...s, scene: { k: 'menu', cur: wrap(cur, button === 'up' ? -1 : 1, MAIN_MENU.length) } };
  if (button === 'b' || button === 'menu') return withSfx({ ...s, scene: world }, 'cancel');
  if (button !== 'a') return s;
  switch (cur) {
    case 0: return withSfx({ ...s, scene: { k: 'party', cur: 0, mode: 'view' } }, 'confirm');
    case 1: return withSfx({ ...s, scene: { k: 'bag', cur: 0 } }, 'confirm');
    case 2: return withSfx(talk(s, notes(s)), 'confirm');
    case 3: return withSfx({ ...talk(s, [t('たびの きろくを かいています……', 'Writing your journey down...')]), saving: true, saveTick: s.saveTick + 1 }, 'save');
    default: return withSfx({ ...s, scene: world }, 'cancel');
  }
}
function pressParty(s: GameState, scene: Extract<Scene, { k: 'party' }>, button: Button): GameState {
  if (button === 'up' || button === 'down') return { ...s, scene: { ...scene, cur: wrap(scene.cur, button === 'up' ? -1 : 1, s.party.length) } };
  if (button === 'b') return withSfx({ ...s, scene: scene.mode === 'herb' ? { k: 'bag', cur: 1 } : { k: 'menu', cur: 0 } }, 'cancel');
  if (button !== 'a') return s;
  const mon = s.party[scene.cur];
  if (scene.mode === 'view') {
    if (scene.cur === 0) return withSfx(s, 'cancel');
    const party = [mon, ...s.party.slice(1).map((m, i) => i + 1 === scene.cur ? s.party[0] : m)];
    return withSfx({ ...s, party, scene: { ...scene, cur: 0 } }, 'confirm');
  }
  const [ja, en] = monText(mon), max = statsOf(mon).hp;
  if (s.items.herb <= 0) return talk(s, [t('ハーブが もう ない！', 'No herbs left!')]);
  if (isFainted(mon)) return talk(s, [t('たおれた なかまには きかない。やすらぎの家へ！', 'Herbs cannot wake a fainted friend. Visit a Rest House!')]);
  if (mon.hp >= max) return talk(s, [t('いまは つかっても こうかが ない。', 'It would have no effect now.')]);
  const party = s.party.map((m, i) => i === scene.cur ? { ...m, hp: Math.min(max, m.hp + HERB_HEAL) } : m);
  return withSfx(talk({ ...s, party, items: { ...s.items, herb: s.items.herb - 1 } }, [t(`${ja}の HPが かいふくした！`, `${en} recovered HP!`)]), 'heal');
}
function pressBag(s: GameState, cur: number, button: Button): GameState {
  if (button === 'up' || button === 'down') return { ...s, scene: { k: 'bag', cur: wrap(cur, button === 'up' ? -1 : 1, BAG.length) } };
  if (button === 'b') return withSfx({ ...s, scene: { k: 'menu', cur: 1 } }, 'cancel');
  if (button !== 'a') return s;
  if (BAG[cur] === 'ribbon') return talk(s, [t('バトルで よわった やせいの モンスターに つかおう。', 'Use it in battle on a weakened wild monster.')]);
  if (s.items.herb <= 0) return talk(s, [t('ハーブが もう ない！', 'No herbs left!')]);
  return withSfx({ ...s, scene: { k: 'party', cur: 0, mode: 'herb' } }, 'confirm');
}
function pressShop(s: GameState, cur: number, button: Button): GameState {
  if (button === 'up' || button === 'down') return { ...s, scene: { k: 'shop', cur: wrap(cur, button === 'up' ? -1 : 1, SHOP.length) } };
  const entry = SHOP[cur];
  if (button === 'b' || (button === 'a' && entry === 'leave')) return withSfx({ ...s, scene: world }, 'cancel');
  if (button !== 'a' || entry === 'leave') return s;
  const price = ITEMS[entry].price;
  if (s.coins < price || s.items[entry] >= ITEM_CAP) return withSfx(s, 'cancel');
  return withSfx({ ...s, coins: s.coins - price, items: { ...s.items, [entry]: s.items[entry] + 1 } }, 'buy');
}

// ---------- battle ----------

function snapOf(s: GameState, b: Battle): Snap {
  return { active: b.active, myHp: s.party[b.active].hp, foe: b.foe, foeHp: b.foes[b.foe].hp };
}
function beginBattle(s: GameState, kind: BattleKind, foes: readonly Mon[]): GameState {
  const active = Math.max(0, s.party.findIndex(m => !isFainted(m)));
  const b = startBattle(kind, foes, active);
  const seen = [...s.seen, ...foes.map(f => f.species).filter((id, i, all) => !s.seen.includes(id) && all.indexOf(id) === i)];
  const state: GameState = { ...s, seen, walk: null };
  const snap = snapOf(state, b);
  const foe = monText(foes[0]), me = monText(s.party[active]);
  const intro: Text[] = kind === 'wild'
    ? [t(`くさむらから ${foe[0]}が かおを だした！`, `${foe[1]} popped out of the tall grass!`)]
    : [t(`${LEADER[0]}が しょうぶを しかけてきた！`, `${LEADER[1]} challenges you!`), t(`${LEADER[0]}は ${foe[0]}を くりだした！`, `${LEADER[1]} sends out ${foe[1]}!`)];
  intro.push(t(`${me[0]}、たのんだ！`, `Go for it, ${me[1]}!`));
  const lines: Line[] = intro.map((text, i) => ({ text, snap, ...(i === 0 ? { sfx: 'encounter' as Sfx } : {}) }));
  return withSfx({ ...state, scene: { k: 'battle', b, ui: 'lines', cur: 0, lines, li: 0 } }, 'encounter');
}
function applyTurn(s: GameState, result: TurnResult): GameState {
  const { ctx, lines } = result;
  const next: GameState = { ...s, party: ctx.party, items: ctx.items, coins: Math.min(COIN_CAP, ctx.coins), seed: ctx.seed,
    scene: { k: 'battle', b: ctx.battle, ui: 'lines', cur: 0, lines, li: 0 } };
  return lines[0]?.sfx ? withSfx(next, lines[0].sfx) : next;
}
function runTurn(s: GameState, b: Battle, action: Action): GameState {
  return applyTurn(s, takeTurn({ party: s.party, items: s.items, coins: s.coins, seed: s.seed, battle: b }, action));
}
function finishBattle(s: GameState, b: Battle): GameState {
  const over = b.over as BattleResult;
  const done: GameState = { ...s, scene: world, last: over };
  if (over === 'caught') {
    const species = b.foes[b.foe].species;
    return { ...done, caught: done.caught.includes(species) ? done.caught : [...done.caught, species] };
  }
  if (over === 'lose') {
    const spot = s.flags.rest ? REST_RESPAWN : HOME_RESPAWN;
    return talk({ ...done, map: spot.map, x: spot.x, y: spot.y, face: spot.face, walk: null, party: s.party.map(healMon) },
      [s.flags.rest ? t('……あわてて やすらぎの家へ もどった。みんな げんきに なった。', '...You hurried back to the Rest House. Everyone is rested.')
        : t('……あわてて いえに もどった。みんな げんきに なった。', '...You hurried home. Everyone is rested.')]);
  }
  if (over === 'win' && b.kind === 'boss') {
    return withSfx(talk({ ...done, flags: { ...s.flags, badge: true }, coins: Math.min(COIN_CAP, s.coins + 100), saveTick: s.saveTick + 1 }, [
      t(`${LEADER[0]}「みごとだ！ この ヒスイバッジを うけとってくれ」`, `${LEADER[1]}: "Splendid! Please accept this Jade Badge."`),
      t('ヒスイバッジを てにいれた！ どんぐり 100こも もらった。', 'You received the Jade Badge! And 100 acorns.'),
      t('おめでとう！ これからも Friendと たびを つづけよう。', 'Congratulations! Keep exploring with your Friend.'),
    ]), 'badge');
  }
  return done;
}
function afterLines(s: GameState, b: Battle): GameState {
  if (b.over) return finishBattle(s, b);
  if (b.mustSwitch) return { ...s, scene: { k: 'battle', b, ui: 'party', cur: 0, lines: [], li: 0, forced: true } };
  return { ...s, scene: { k: 'battle', b, ui: 'main', cur: 0, lines: [], li: 0 } };
}
function pressBattle(s: GameState, scene: Extract<Scene, { k: 'battle' }>, button: Button): GameState {
  const { b } = scene;
  const set = (patch: Partial<Extract<Scene, { k: 'battle' }>>): GameState => ({ ...s, scene: { ...scene, ...patch } });
  const vertical = (n: number) => button === 'up' || button === 'down' ? set({ cur: wrap(scene.cur, button === 'up' ? -1 : 1, n) }) : null;
  switch (scene.ui) {
    case 'lines': {
      if (button !== 'a' && button !== 'b') return s;
      const li = scene.li + 1;
      if (li < scene.lines.length) { const next = set({ li }); const sfx = scene.lines[li].sfx; return sfx ? withSfx(next, sfx) : next; }
      return afterLines(s, b);
    }
    case 'main': {
      const col = scene.cur % 2, row = Math.floor(scene.cur / 2);
      if (button === 'left' || button === 'right') return set({ cur: row * 2 + (button === 'right' ? 1 : 0) });
      if (button === 'up' || button === 'down') return set({ cur: (button === 'down' ? 2 : 0) + col });
      if (button !== 'a') return s;
      if (scene.cur === 3) return runTurn(s, b, { kind: 'run' });
      return withSfx(set({ ui: (['fight', 'bag', 'party'] as const)[scene.cur], cur: 0 }), 'confirm');
    }
    case 'fight': {
      const moves = s.party[b.active].moves;
      if (button === 'b') return withSfx(set({ ui: 'main', cur: 0 }), 'cancel');
      if (button === 'a') return runTurn(s, b, { kind: 'move', slot: Math.min(scene.cur, moves.length - 1) });
      return vertical(moves.length) ?? s;
    }
    case 'bag': {
      if (button === 'b') return withSfx(set({ ui: 'main', cur: 1 }), 'cancel');
      if (button === 'a') return runTurn(s, b, { kind: 'item', item: BAG[scene.cur] });
      return vertical(BAG.length) ?? s;
    }
    case 'party': {
      if (button === 'b') return scene.forced ? withSfx(s, 'cancel') : withSfx(set({ ui: 'main', cur: 2 }), 'cancel');
      if (button !== 'a') return vertical(s.party.length) ?? s;
      const to = scene.cur;
      if (isFainted(s.party[to]) || (!scene.forced && to === b.active)) return withSfx(s, 'cancel');
      if (scene.forced) return applyTurn(s, switchIn({ party: s.party, items: s.items, coins: s.coins, seed: s.seed, battle: b }, to));
      return runTurn(s, b, { kind: 'switch', to });
    }
  }
}

/** Handle one button press. While a manual save is in flight the state is returned unchanged. */
export function press(s: GameState, button: Button): GameState {
  if (s.saving) return s;
  const scene = s.scene;
  switch (scene.k) {
    case 'world': return pressWorld(s, button);
    case 'talk': return pressTalk(s, scene, button);
    case 'menu': return pressMenu(s, scene.cur, button);
    case 'party': return pressParty(s, scene, button);
    case 'bag': return pressBag(s, scene.cur, button);
    case 'shop': return pressShop(s, scene.cur, button);
    case 'battle': return pressBattle(s, scene, button);
  }
}

/** Report the adapter's save outcome. Manual saves show a message; autosave failures only raise the flag. */
export function saveResult(s: GameState, ok: boolean): GameState {
  if (!s.saving) return { ...s, saveError: !ok };
  return withSfx({
    ...talk({ ...s, saving: false }, [ok ? t('きろくを セーブしました！', 'Your journey has been saved!')
      : t('セーブできませんでした。このまま あそべます。', 'Could not save. You can keep playing.')]),
    saveError: !ok,
  }, ok ? 'save' : 'cancel');
}

export interface Fighter { readonly mon: Mon; readonly label: Text; readonly name: string; readonly level: number; readonly hp: number; readonly max: number }
export interface BattleView { readonly kind: BattleKind; readonly me: Fighter; readonly foe: Fighter; readonly foeIndex: number; readonly foeCount: number }
/** What the battle screen shows now, following the snapshot of the current message line. */
export function battleView(s: GameState): BattleView | null {
  if (s.scene.k !== 'battle') return null;
  const { b, lines, li, ui } = s.scene;
  const snap = ui === 'lines' && lines[li] ? lines[li].snap : snapOf(s, b);
  const fighter = (mon: Mon, hp: number): Fighter => { const label = monText(mon); return { mon, label, name: label[1], level: mon.level, hp, max: statsOf(mon).hp }; };
  return { kind: b.kind, me: fighter(s.party[snap.active], snap.myHp), foe: fighter(b.foes[snap.foe], snap.foeHp), foeIndex: snap.foe, foeCount: b.foes.length };
}
export function moveInfo(id: string) { return MOVES[id]; }
