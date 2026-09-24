/** Original Rare Quest content: types, moves, monsters and items. All names and art are made for this game. */
export type Text = readonly [string, string];
export type TypeId = 'sprout' | 'ember' | 'tide' | 'gale' | 'stone' | 'pixel';
export const TYPES: readonly TypeId[] = Object.freeze(['sprout', 'ember', 'tide', 'gale', 'stone', 'pixel']);
export const TYPE_NAMES: Readonly<Record<TypeId, Text>> = Object.freeze({
  sprout: ['め', 'SPROUT'], ember: ['ほむら', 'EMBER'], tide: ['しお', 'TIDE'],
  gale: ['かぜ', 'GALE'], stone: ['いわ', 'STONE'], pixel: ['ドット', 'PIXEL'],
});

const STRONG: Readonly<Record<TypeId, readonly TypeId[]>> = {
  sprout: ['tide', 'stone'], ember: ['sprout', 'gale'], tide: ['ember', 'stone'],
  gale: ['sprout', 'pixel'], stone: ['ember', 'gale'], pixel: [],
};
const WEAK: Readonly<Record<TypeId, readonly TypeId[]>> = {
  sprout: ['ember', 'gale', 'sprout'], ember: ['tide', 'stone', 'ember'], tide: ['sprout', 'tide'],
  gale: ['stone'], stone: ['sprout'], pixel: ['stone'],
};
/** Attack multiplier: 2 (strong), 0.5 (resisted) or 1. */
export function effectiveness(attack: TypeId, defend: TypeId): number {
  if (STRONG[attack].includes(defend)) return 2;
  return WEAK[attack].includes(defend) ? 0.5 : 1;
}

export interface MoveDef { readonly id: string; readonly name: Text; readonly type: TypeId; readonly power: number; readonly accuracy: number; readonly pp: number }
const move = (id: string, ja: string, en: string, type: TypeId, power: number, accuracy: number, pp: number): MoveDef =>
  Object.freeze({ id, name: [ja, en] as const, type, power, accuracy, pp });
export const MOVES: Readonly<Record<string, MoveDef>> = Object.freeze(Object.fromEntries([
  move('dot-tackle', 'ドットタックル', 'Dot Tackle', 'pixel', 40, 100, 35),
  move('hop-kick', 'ぴょんキック', 'Hop Kick', 'pixel', 50, 95, 25),
  move('pixel-rush', 'ピクセルラッシュ', 'Pixel Rush', 'pixel', 60, 95, 20),
  move('glitch-beam', 'グリッチビーム', 'Glitch Beam', 'pixel', 80, 90, 10),
  move('moss-punch', 'こけパンチ', 'Moss Punch', 'sprout', 45, 100, 25),
  move('root-drill', 'ねっこドリル', 'Root Drill', 'sprout', 75, 90, 15),
  move('yam-roast', 'やきいもアタック', 'Yam Roast', 'ember', 45, 100, 25),
  move('kiln-burst', 'かまどバースト', 'Kiln Burst', 'ember', 75, 90, 15),
  move('brine-spray', 'しおしぶき', 'Brine Spray', 'tide', 45, 100, 25),
  move('eddy-drop', 'うずまきドロップ', 'Eddy Drop', 'tide', 75, 90, 15),
  move('breeze-chop', 'そよかぜチョップ', 'Breeze Chop', 'gale', 45, 100, 25),
  move('whirl-dive', 'つむじダイブ', 'Whirl Dive', 'gale', 75, 90, 15),
  move('pebble-toss', 'こいしなげ', 'Pebble Toss', 'stone', 45, 95, 25),
  move('boulder-press', 'がんせきプレス', 'Boulder Press', 'stone', 80, 85, 10),
].map(m => [m.id, m])));

export interface BaseStats { readonly hp: number; readonly atk: number; readonly def: number; readonly spd: number }
export interface SpeciesDef {
  readonly id: string; readonly name: Text; readonly type: TypeId; readonly base: BaseStats;
  /** Probability multiplier (0–1] for a Friend Ribbon at full effect. */
  readonly catchRate: number; readonly expYield: number;
  readonly learnset: readonly (readonly [number, string])[];
  /** 16×16 art: '.' clear, '0' lightest … '3' darkest. */
  readonly art: readonly string[];
  readonly note: Text;
}
/** Mirror an 8-wide half into a symmetric 16-wide sprite. */
const sym = (half: readonly string[]) => half.map(h => h + [...h].reverse().join(''));
const species = (id: string, ja: string, en: string, type: TypeId, [hp, atk, def, spd]: readonly number[], catchRate: number, expYield: number,
  learnset: readonly (readonly [number, string])[], art: readonly string[], note: Text): SpeciesDef =>
  Object.freeze({ id, name: [ja, en] as const, type, base: Object.freeze({ hp, atk, def, spd }), catchRate, expYield, learnset, art: Object.freeze([...art]), note });

export const SPECIES: Readonly<Record<string, SpeciesDef>> = Object.freeze(Object.fromEntries([
  species('mossball', 'モッコロ', 'Mossball', 'sprout', [50, 45, 50, 40], 0.8, 45,
    [[1, 'dot-tackle'], [1, 'moss-punch'], [8, 'hop-kick'], [12, 'root-drill']], [
      '.......33.......', '......3223......', '.......33.......', '....33333333....', '...3111111113...', '..311211112113..',
      '.31111111111113.', '.31130111130113.', '.31133111133113.', '.31111111111113.', '.31211133111213.', '.31111111111113.',
      '..312111112113..', '...3111111113...', '....33333333....', '................'],
    ['ころころ ころがって こけを あつめる。', 'Rolls around collecting moss.']),
  species('capmochi', 'カサモチ', 'Capmochi', 'sprout', [60, 40, 55, 30], 0.7, 50,
    [[1, 'dot-tackle'], [1, 'moss-punch'], [6, 'pebble-toss'], [14, 'root-drill']], [
      '.....333333.....', '...3322222233...', '..322002220023..', '.32220022200223.', '.32222222222223.', '.33333333333333.',
      '...3111111113...', '...3131111313...', '...3131111313...', '...3111331113...', '...3111111113...', '..311111111113..',
      '..311111111113..', '..321111111123..', '...3333333333...', '................'],
    ['もちもちの からだに きのこの かさ。', 'A squishy body under a mushroom cap.']),
  species('yamyam', 'ホクイモ', 'Yamyam', 'ember', [45, 55, 40, 50], 0.7, 50,
    [[1, 'dot-tackle'], [1, 'yam-roast'], [9, 'hop-kick'], [15, 'kiln-burst']], [
      '......1..1......', '.....1..1.......', '......1..1......', '....33333333....', '..332222222233..', '.32222222222223.',
      '3222002222002223', '3222302222302223', '3222222222222223', '3222222332222223', '.32212222221223.', '.32222222222223.',
      '..332222222233..', '....33333333....', '.....3....3.....', '................'],
    ['いつも ほかほか。さわると あったかい。', 'Always toasty warm to the touch.']),
  species('lanternbo', 'ランタンボ', 'Lanternbo', 'ember', [50, 60, 45, 55], 0.5, 60,
    [[1, 'yam-roast'], [1, 'hop-kick'], [10, 'kiln-burst'], [16, 'pixel-rush']], [
      '......3333......', '.......33.......', '....33333333....', '...3000000003...', '...3111111113...', '...3000000003...',
      '..310311113013..', '..310311113013..', '..300000000003..', '..311113311113..', '..300000000003..', '...3111111113...',
      '...3000000003...', '....33333333....', '......2222......', '.......22.......'],
    ['よみちを てらして まいごを たすける。', 'Lights night paths for lost travellers.']),
  species('brinebub', 'シオプク', 'Brinebub', 'tide', [55, 45, 45, 45], 0.7, 50,
    [[1, 'dot-tackle'], [1, 'brine-spray'], [9, 'hop-kick'], [14, 'eddy-drop']], [
      '.....333333.....', '...3300000033...', '..300111111003..', '.30011111111003.', '.30113111131103.', '.30113111131103.',
      '.30111111111103.', '.30111133111103.', '..300111111003..', '...3333333333...', '...2.2.22.2.2...', '...2.2.2..2.2...',
      '..2..2.2..2..2..', '..2...2....2.2..', '...2..2...2.....', '................'],
    ['しおかぜに のって ふわふわ ただよう。', 'Drifts along on salty breezes.']),
  species('polkadrop', 'ミズタマル', 'Polkadrop', 'tide', [45, 50, 40, 60], 0.6, 55,
    [[1, 'brine-spray'], [1, 'hop-kick'], [11, 'eddy-drop'], [17, 'breeze-chop']], [
      '.......33.......', '......3003......', '.....300013.....', '.....301113.....', '....30111113....', '...3011211113...',
      '...3111111213...', '..311311113113..', '..311311113113..', '..321111111123..', '..311113311113..', '..312111111213..',
      '...3111111113...', '....31111113....', '.....333333.....', '................'],
    ['あめあがりに みずたまりから うまれる。', 'Born from puddles after the rain.']),
  species('vanebird', 'カザミドリ', 'Vanebird', 'gale', [45, 55, 40, 70], 0.6, 55,
    [[1, 'dot-tackle'], [1, 'breeze-chop'], [10, 'hop-kick'], [15, 'whirl-dive']], [
      '.........333....', '........311133..', '........310132..', '........3111322.', '..33....31113...', '.3113..3111113..',
      '.31113331111113.', '..3111111111113.', '...311111111113.', '...312121211113.', '....3121212113..', '.....33311133...',
      '.......3..3.....', '......33..33....', '................', '................'],
    ['やねの うえで かぜの むきを よむ。', 'Reads the wind from village rooftops.']),
  species('glitchmoth', 'バグモス', 'Glitchmoth', 'gale', [50, 60, 45, 65], 0.35, 70,
    [[1, 'breeze-chop'], [1, 'dot-tackle'], [12, 'glitch-beam'], [18, 'whirl-dive']], sym([
      '....3...', '.....3..', '......33', '333..311', '3023.310', '32023311', '30202311', '32020311',
      '30202311', '3202.311', '.33..311', '..32.311', '..3303.3', '...33..3', '........', '........']),
    ['はねの もようが ときどき ずれる。', 'Its wing pattern sometimes skips a frame.']),
  species('pillowstone', 'イシマクラ', 'Pillowstone', 'stone', [60, 50, 80, 20], 0.6, 60,
    [[1, 'dot-tackle'], [1, 'pebble-toss'], [9, 'boulder-press'], [16, 'hop-kick']], sym([
      '........', '........', '....3333', '..332222', '.3222122', '.3221222', '32222222', '32333222',
      '32222222', '32222222', '32222232', '32222222', '.3222222', '..332222', '....3333', '........']),
    ['いちにちの ほとんどを ねて すごす。', 'Spends most of the day asleep.']),
  species('dotton', 'ドットン', 'Dotton', 'pixel', [55, 50, 50, 50], 0.6, 55,
    [[1, 'dot-tackle'], [1, 'hop-kick'], [10, 'pixel-rush'], [18, 'glitch-beam']], sym([
      '........', '...33333', '..300000', '.3000000', '33333333', '31111111', '31211111', '31031111',
      '31111111', '31111111', '31112111', '31111133', '33333333', '........', '...2....', '........']),
    ['からだは 8×8の ドットで できている。', 'Built from exactly sixty-four dots.']),
  species('grovelet', 'モリノコ', 'Grovelet', 'sprout', [70, 65, 65, 50], 0.3, 90,
    [[1, 'moss-punch'], [1, 'hop-kick'], [8, 'root-drill'], [12, 'pebble-toss']], sym([
      '....3333', '..332121', '.3212121', '32121212', '31212121', '32121212', '.3333333', '...31111',
      '...31031', '...31131', '...31111', '..331111', '.3113111', '.3133111', '..3.3333', '........']),
    ['どうじょうの にわで そだった ちいさな もり。', 'A little grove raised in the dojo garden.']),
].map(s => [s.id, s])));

/** Species that live in tall grass. Grovelet belongs to the dojo leader. */
export const WILD_SPECIES: readonly string[] = Object.freeze(Object.keys(SPECIES).filter(id => id !== 'grovelet'));

export type ItemId = 'ribbon' | 'herb';
export const ITEMS: Readonly<Record<ItemId, { readonly name: Text; readonly price: number; readonly note: Text }>> = Object.freeze({
  ribbon: { name: ['なかよしリボン', 'Friend Ribbon'], price: 20, note: ['よわった やせいの モンスターと なかよくなる。', 'Befriends a weakened wild monster.'] },
  herb: { name: ['げんきハーブ', 'Pep Herb'], price: 15, note: ['HPを 20 かいふくする。', 'Restores 20 HP.'] },
});

export const WEAK_MOVE: Readonly<Record<TypeId, string>> = Object.freeze({
  sprout: 'moss-punch', ember: 'yam-roast', tide: 'brine-spray', gale: 'breeze-chop', stone: 'pebble-toss', pixel: 'hop-kick',
});
export const STRONG_MOVE: Readonly<Record<TypeId, string>> = Object.freeze({
  sprout: 'root-drill', ember: 'kiln-burst', tide: 'eddy-drop', gale: 'whirl-dive', stone: 'boulder-press', pixel: 'glitch-beam',
});
