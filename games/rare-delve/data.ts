/** Rare Delve tables: directions, items, monsters, traps and tuning. Every name here is original. */
export type Text = readonly [ja: string, en: string];
const t = (ja: string, en: string): Text => [ja, en];

export const W = 40;
export const H = 28;
export const FLOORS = 10;
export const BAG_MAX = 20;
export const CHEST_MAX = 8;
export const FULL_MAX = 100;
/** The belly drops 1 % every this many turns. */
export const HUNGER_TURNS = 9;
export const BASE_HP = 25;
export const HP_PER_LEVEL = 5;
export const BASE_STR = 8;
export const MAX_LEVEL = 30;
export const PIT_DAMAGE = 5;
export const BLAZE_DAMAGE = 15;
export const CLEAR_BONUS = 1000;
export const GOLD_CAP = 999_999;
/** Gold needed to raise the shop to level n (index n). */
export const SHOP_COSTS: readonly number[] = [0, 0, 400, 1200];
export const SHOP_MAX = 3;
/** Regeneration: the hero gains 1 HP each time this many "max HP points" accumulate. */
export const REGEN_POOL = 150;

export type Dir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export const DIR_LIST: readonly Dir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const DIRS: Readonly<Record<Dir, readonly [number, number]>> = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
};
export function dirOf(dx: number, dy: number): Dir | null {
  return DIR_LIST.find(d => DIRS[d][0] === Math.sign(dx) && DIRS[d][1] === Math.sign(dy) && (dx !== 0 || dy !== 0)) ?? null;
}

/** Total EXP needed to reach a level. */
export function expForLevel(level: number): number {
  let total = 0, gap = 8;
  for (let l = 2; l <= level; l++) { total += Math.round(gap); gap *= 1.34; }
  return total;
}

export type ItemKind = 'food' | 'herb' | 'potion' | 'scroll' | 'wand' | 'weapon' | 'shield' | 'dart' | 'treasure' | 'gold' | 'lantern';
export interface ItemDef {
  readonly kind: ItemKind; readonly name: Text; readonly note: Text;
  /** Base sell price at the shop counter. */
  readonly price: number;
  /** Fill for food, heal for herbs, attack for weapons, defence for shields, damage for darts. */
  readonly power: number;
  /** Relative spawn weight and first floor it appears on (0 = never spawns loose). */
  readonly weight: number; readonly minFloor: number;
}
const item = (kind: ItemKind, name: Text, note: Text, price: number, power: number, weight: number, minFloor = 1): ItemDef =>
  ({ kind, name, note, price, power, weight, minFloor });

export const ITEMS: Readonly<Record<string, ItemDef>> = {
  bun: item('food', t('小さなパン', 'Small Bun'), t('おなかが 50% ふくれる。', 'Fills the belly by 50%.'), 10, 50, 75),
  loaf: item('food', t('大きなパン', 'Big Loaf'), t('おなかが いっぱいになる。', 'Fills the belly completely.'), 30, 100, 40, 2),
  mendleaf: item('herb', t('いやしの葉', 'Mendleaf'), t('HPが 25 回復。満タンなら 最大HP+1。', 'Heals 25 HP; at full HP, max HP +1.'), 20, 25, 70),
  clearroot: item('herb', t('すっきり根', 'Clearroot'), t('ちからを もどし、混乱を なおす。', 'Restores strength and clears confusion.'), 25, 0, 30, 2),
  sprout: item('herb', t('ふんばり芽', 'Grit Sprout'), t('ちからの 上限が 1 あがる。', 'Raises strength and its cap by 1.'), 150, 1, 14, 2),
  p_mend: item('potion', t('なおりの薬', 'Mending Draught'), t('HP全快、最大HP+3。', 'Full heal and max HP +3.'), 80, 3, 26),
  p_doze: item('potion', t('ねむりの薬', 'Drowse Draught'), t('のむと ねむる。なげると あいてが ねむる。', 'Drink: you sleep. Throw: the target sleeps.'), 20, 0, 22),
  p_muddle: item('potion', t('まどいの薬', 'Muddle Draught'), t('のむと 混乱。なげると あいてが 混乱。', 'Drink: you get confused. Throw: the target does.'), 20, 0, 22),
  p_sight: item('potion', t('みとおしの薬', 'Seer\'s Draught'), t('この階の 敵と 道具が 見える。', 'Shows every monster and item on this floor.'), 60, 0, 22),
  p_rise: item('potion', t('のびざかりの薬', 'Rising Draught'), t('レベルが 1 あがる。', 'Gain one level.'), 200, 0, 12, 3),
  p_swift: item('potion', t('はやあしの薬', 'Swift Draught'), t('しばらく 2倍の 速さで 動ける。', 'For a while you act twice per monster turn.'), 60, 0, 20),
  s_know: item('scroll', t('見極めの巻物', 'Scroll of Insight'), t('えらんだ 道具の 正体が わかる。', 'Identifies an item you choose.'), 40, 0, 30),
  s_edge: item('scroll', t('研ぎの巻物', 'Honing Scroll'), t('装備中の 武器が +1。', 'Your weapon gains +1.'), 80, 0, 24),
  s_guard: item('scroll', t('補強の巻物', 'Bracing Scroll'), t('装備中の 盾が +1。', 'Your shield gains +1.'), 80, 0, 24),
  s_chart: item('scroll', t('地図の巻物', 'Chart Scroll'), t('この階の 地形が わかる。', 'Maps this floor.'), 50, 0, 24),
  s_home: item('scroll', t('帰り道の巻物', 'Homeward Scroll'), t('持ち物を もったまま 町へ かえる。', 'Return to town with everything you carry.'), 60, 0, 16),
  s_blaze: item('scroll', t('火の粉の巻物', 'Cinder Scroll'), t('見えている 敵 すべてに ダメージ。', 'Burns every monster in sight.'), 80, 0, 20, 3),
  w_gust: item('wand', t('突風のワンド', 'Gust Wand'), t('あいてを 遠くへ はじきとばす。', 'Blasts a monster far away.'), 100, 0, 12, 2),
  w_lull: item('wand', t('子守りのワンド', 'Lullaby Wand'), t('あいてを ねむらせる。', 'Puts a monster to sleep.'), 100, 0, 12, 2),
  w_swap: item('wand', t('入れかえのワンド', 'Switch Wand'), t('あいてと 位置を 入れかえる。', 'Trade places with a monster.'), 100, 0, 10, 2),
  w_slow: item('wand', t('のろまのワンド', 'Molasses Wand'), t('あいての 動きを おそくする。', 'Slows a monster down.'), 100, 0, 12, 2),
  knife: item('weapon', t('石のナイフ', 'Flint Knife'), t('こうげき +3。', 'Attack +3.'), 40, 3, 26),
  pick: item('weapon', t('銅のつるはし', 'Copper Pick'), t('こうげき +5。', 'Attack +5.'), 90, 5, 20, 2),
  mallet: item('weapon', t('骨のハンマー', 'Bone Mallet'), t('こうげき +8。', 'Attack +8.'), 150, 8, 14, 4),
  amber: item('weapon', t('こはくの剣', 'Amber Sword'), t('こうげき +11。', 'Attack +11.'), 260, 11, 10, 6),
  cleaver: item('weapon', t('黒曜の大なた', 'Obsidian Cleaver'), t('こうげき +15。', 'Attack +15.'), 400, 15, 6, 8),
  bark: item('shield', t('木の皮の盾', 'Bark Buckler'), t('ぼうぎょ +2。', 'Defence +2.'), 30, 2, 26),
  copper: item('shield', t('銅の丸盾', 'Copper Round'), t('ぼうぎょ +4。', 'Defence +4.'), 80, 4, 20, 2),
  slate: item('shield', t('石板の盾', 'Slate Guard'), t('ぼうぎょ +6。', 'Defence +6.'), 140, 6, 14, 4),
  crystal: item('shield', t('水晶の盾', 'Crystal Guard'), t('ぼうぎょ +9。', 'Defence +9.'), 240, 9, 10, 6),
  shell: item('shield', t('甲羅の大盾', 'Shell Bulwark'), t('ぼうぎょ +12。', 'Defence +12.'), 380, 12, 6, 8),
  dart: item('dart', t('鉄のダーツ', 'Iron Darts'), t('なげて 使う。1本 6ダメージ。', 'Thrown one at a time for 6 damage.'), 3, 6, 34),
  geode: item('treasure', t('晶洞石', 'Geode'), t('町で 高く 売れる。', 'Sells well in town.'), 120, 0, 26, 2),
  opal: item('treasure', t('ほむらオパール', 'Ember Opal'), t('とても 高く 売れる 宝石。', 'A gem worth a lot in town.'), 300, 0, 12, 5),
  gold: item('gold', t('ゴールド', 'Gold'), t('ゲーム内の 通貨（RFでは ありません）。', 'In-game currency (not RF).'), 1, 0, 0),
  lantern: item('lantern', t('ハートのランタン', 'Heart Lantern'), t('ランタン洞の いちばん奥の たから。', 'The treasure at the bottom of Lantern Hollow.'), 1, 0, 0),
};
export const UNIDENTIFIED: readonly ItemKind[] = ['potion', 'scroll', 'wand'];

/** Unidentified looks. Potions use colors, wands woods, scrolls two nonsense words. */
export const COLORS: readonly (readonly [ja: string, en: string, hex: string])[] = [
  ['あか', 'Red', '#e0503a'], ['あお', 'Blue', '#4a8fe0'], ['みどり', 'Green', '#58b85a'], ['きいろ', 'Yellow', '#f2cf3c'],
  ['むらさき', 'Violet', '#a066d8'], ['しろ', 'White', '#f2ece0'], ['こはく', 'Amber', '#e89a36'], ['もも', 'Pink', '#f08cb4'],
];
export const WOODS: readonly (readonly [ja: string, en: string, hex: string])[] = [
  ['カシ', 'Oak', '#a8744a'], ['ヤナギ', 'Willow', '#9fae6a'], ['サクラ', 'Cherry', '#c46a5a'],
  ['クルミ', 'Walnut', '#6e4a30'], ['ヒノキ', 'Cypress', '#d8b07a'], ['ツゲ', 'Boxwood', '#e2c86a'],
];
export const SYLLABLES: readonly Text[] = [
  ['ラ', 'RA'], ['モ', 'MO'], ['ピ', 'PI'], ['ク', 'KU'], ['ザ', 'ZA'], ['ノ', 'NO'], ['ヌ', 'NU'], ['ポ', 'PO'],
  ['キ', 'KI'], ['ル', 'RU'], ['ベ', 'BE'], ['ト', 'TO'], ['ミ', 'MI'], ['ソ', 'SO'], ['ガ', 'GA'], ['フ', 'FU'],
];

export type Quirk = 'erratic' | 'sleeper' | 'armored' | 'fast' | 'thief' | 'rust' | 'archer' | 'split' | 'gulp' | 'sting' | 'muddle' | 'heavy';
export type Speed = 'normal' | 'fast' | 'slow';
export interface SpeciesDef {
  readonly name: Text; readonly note: Text;
  readonly hp: number; readonly atk: number; readonly def: number; readonly exp: number;
  readonly minFloor: number; readonly maxFloor: number; readonly speed: Speed; readonly quirk: Quirk; readonly weight: number;
}
const sp = (name: Text, note: Text, hp: number, atk: number, def: number, exp: number, minFloor: number, maxFloor: number, speed: Speed, quirk: Quirk, weight = 10): SpeciesDef =>
  ({ name, note, hp, atk, def, exp, minFloor, maxFloor, speed, quirk, weight });

export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  dustbun: sp(t('ほこりん', 'Dustbun'), t('ふらふら 動く ほこりの かたまり。', 'A wobbly dust ball that drifts at random.'), 8, 3, 1, 3, 1, 3, 'normal', 'erratic', 12),
  newt: sp(t('ねぼけイモリ', 'Drowsy Newt'), t('おこされるまで ねむっている。', 'Sleeps until something wakes it.'), 12, 3, 2, 5, 1, 4, 'normal', 'sleeper', 12),
  crab: sp(t('こいしガニ', 'Pebble Crab'), t('かたいが 動きが おそい。', 'Hard shell, slow feet.'), 16, 5, 7, 8, 2, 5, 'slow', 'armored'),
  moth: sp(t('ひかりガ', 'Glimmoth'), t('1ターンに 2回 動く。', 'Moves twice every turn.'), 11, 4, 2, 9, 3, 6, 'fast', 'fast'),
  mite: sp(t('コインダニ', 'Coin Mite'), t('ゴールドを ぬすんで ワープする。', 'Steals gold and warps away.'), 14, 4, 3, 10, 2, 7, 'normal', 'thief', 8),
  slug: sp(t('さびナメクジ', 'Rust Slug'), t('さわると 盾が さびて 弱くなる。', 'Its touch rusts your shield.'), 23, 8, 4, 14, 4, 8, 'normal', 'rust'),
  archer: sp(t('えだゆみ', 'Twig Archer'), t('まっすぐ ならぶと 矢を うつ。', 'Shoots arrows along straight lines.'), 17, 7, 3, 16, 4, 9, 'normal', 'archer'),
  jelly: sp(t('ふえるゼリー', 'Twin Jelly'), t('たたくと ふえることが ある。', 'May split in two when struck.'), 21, 7, 3, 12, 5, 9, 'normal', 'split', 8),
  toad: sp(t('まるのみガエル', 'Gulp Toad'), t('床の 道具を のみこむ。', 'Swallows items lying on the floor.'), 32, 11, 5, 22, 5, 10, 'normal', 'gulp'),
  wasp: sp(t('トゲバチ', 'Thorn Wasp'), t('さされると ちからが へる。', 'Its sting saps your strength.'), 28, 12, 5, 26, 6, 10, 'normal', 'sting'),
  bat: sp(t('まどいコウモリ', 'Muddle Bat'), t('ふらふら とび、かむと 混乱させる。', 'Flits about; its bite confuses.'), 30, 13, 6, 32, 7, 10, 'normal', 'muddle'),
  tortoise: sp(t('ようがんガメ', 'Magma Tortoise'), t('おそいが 一撃が 重い。', 'Slow, but hits like a landslide.'), 62, 18, 12, 60, 8, 10, 'slow', 'heavy', 8),
};

export type TrapKind = 'trip' | 'pit' | 'alarm';
export const TRAPS: Readonly<Record<TrapKind, { readonly name: Text; readonly note: Text }>> = {
  trip: { name: t('つまずき罠', 'Trip Snare'), note: t('持ち物を ひとつ おとす。', 'Makes you drop an item.') },
  pit: { name: t('おとし穴', 'Pitfall'), note: t('下の階へ おちる。', 'Drops you to the next floor.') },
  alarm: { name: t('鳴子の罠', 'Clapper Trap'), note: t('この階の 敵が みんな 目をさます。', 'Wakes every monster on the floor.') },
};
export const TRAP_KINDS: readonly TrapKind[] = ['trip', 'pit', 'alarm'];
