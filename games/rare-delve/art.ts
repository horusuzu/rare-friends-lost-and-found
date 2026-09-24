/**
 * Rare Delve pixel art: 16x16 sprites in a warm cave palette, drawn in code. Every monster, item and tile is original.
 * Rows use '.' for transparency and one character per palette color. Most creatures are symmetric: an 8-wide half is mirrored.
 */
import { ITEMS } from './data.ts';

export const PALETTE = {
  ink: '#120e18', rock: '#2b2433', rockHi: '#4b3f55', rockLo: '#1b1621', floor: '#3a3128', floorHi: '#52463a',
  moss: '#5d8a4c', leaf: '#8cc063', ember: '#e2733a', gold: '#f2c14e', bone: '#efe3c8', blood: '#c6443c',
  water: '#4b97b8', glow: '#ffe9a6', violet: '#9366c8', rust: '#a8552e', shell: '#7a6a58',
} as const;
const P = PALETTE;

export interface Sprite { readonly rows: readonly string[]; readonly colors: Readonly<Record<string, string>> }
const mirror = (half: readonly string[]): string[] => half.map(h => h + [...h].reverse().join(''));
const sprite = (rows: readonly string[], colors: Record<string, string>): Sprite => ({ rows, colors });
const pad = (rows: readonly string[]): string[] => {
  const top = Math.floor((16 - rows.length) / 2);
  return [...Array(top).fill('.'.repeat(16)), ...rows, ...Array(16 - top - rows.length).fill('.'.repeat(16))];
};

// ---------- monsters ----------

export const MONSTER_ART: Readonly<Record<string, Sprite>> = {
  dustbun: sprite(mirror(['........', '........', '........', '....o.o.', '...oaoao', '..oaaaaa', '.oaaaaaa', '.oaacaaa', 'oaaaeoaa', 'oaaaooaa',
    'oaaaaaaa', '.oaaaabb', '.oabbbbb', '..obbbbb', '...oo.oo', '........']), { o: P.ink, a: '#b8ad9c', b: '#8a8070', c: '#e4dccb', e: P.bone }),
  newt: sprite(mirror(['........', '........', '........', '........', '..ooo...', '.oeeoooo', '.oeoaaaa', '.oaaaaaa', '..oaaaac', '..obaaaa',
    '.oaobbbb', 'oa.obbbb', 'o..obbbb', '...oboob', '...oo..o', '........']), { o: P.ink, a: P.ember, b: P.rust, c: P.glow, e: P.bone }),
  crab: sprite(mirror(['........', '........', '.oo.....', 'oaao....', 'oa.ao...', 'oaao....', '.oao.o.o', '..oaoeoe', '..oaaoao', '.oaaaaaa',
    'oaacaaaa', 'oaaaaaaa', '.obbbbbb', '.o.o.o.o', 'o.o..o..', '........']), { o: P.ink, a: P.shell, b: P.rockHi, c: P.bone, e: P.bone }),
  moth: sprite(mirror(['........', '.o......', '..o.....', 'oo.o...o', 'oaao..oo', 'oacao.oe', 'oaccaoaa', 'oacaaoaa', '.oaaaoaa', '.oaaaoab',
    '..oaao.o', '..oabao.', '...oaoo.', '....o...', '........', '........']), { o: P.ink, a: P.glow, b: P.gold, c: '#fff8dc', e: P.ember }),
  mite: sprite(mirror(['........', '........', '........', '........', '...o....', 'o...o...', '.o.oooo.', '..oaaaao', '.oaaeoaa', 'oaacaaaa',
    'oaaaaaaa', 'oabbgbbb', '.obbbbbb', 'o.o.o.oo', '........', '........']), { o: P.ink, a: P.blood, b: P.rust, c: '#f08a7e', e: P.bone, g: P.gold }),
  slug: sprite(pad(['..o.......o.....', '...o.....o......', '...oo...oo......', '..oeoooooeo.....', '..oaaaaaaaao....', '.oaacaaaaaaao...',
    '.oaaaaaaaaaaao..', 'oaabaabaabaaaoo.', 'obbbbbbbbbbbbbbo', 'orrorrorrorrorro', '.oooooooooooooo.']), { o: P.ink, a: '#a39a5a', b: '#7d7440', c: '#d8d08e', e: P.bone, r: P.rust }),
  archer: sprite(['......oo........', '.....oaao.....o.', '.....oeao....o.o', '......oo....o..o', '.....oaao..o...o', '....oaaaaooooooo',
    '...oa.oao..o...o', '..oa..oao...o..o', '..o...oao....o.o', '......oao.....o.', '.....oaaao......', '....oa.o.ao.....', '....o..o..o.....',
    '...oo.oo..oo....', '................', '................'], { o: P.ink, a: P.moss, e: P.glow }),
  jelly: sprite(mirror(['........', '........', '........', '........', '.....ooo', '...ooaaa', '..oaaaaa', '.oacaaaa', '.occaeoa', 'oaaaaooa',
    'oaaaaaaa', 'oaaaaaaa', 'obaaaaaa', 'obbabbab', '.oooooo.', '........']), { o: P.ink, a: '#7fd0c8', b: '#4b9c96', c: '#d8fff8', e: P.ink }),
  toad: sprite(mirror(['........', '........', '........', '..ooo...', '.oeeoo..', '.oeoaaoo', 'oaaaaaaa', 'oaacaaaa', 'oaaaaaaa', 'oooooooo',
    'obbbbbbb', 'oabbbbbb', '.oaaaaaa', 'oaao.oaa', 'ooo..ooo', '........']), { o: P.ink, a: '#6c9a3e', b: '#d6c68a', c: '#a8d070', e: P.gold }),
  wasp: sprite(mirror(['........', '.......o', '......o.', '..oo.oo.', '.occo.oe', '.occcooa', '.occco.o', '..ooooaa', '....obbb', '....oaaa',
    '....obbb', '....oaaa', '.....obb', '......oa', '.......o', '........']), { o: P.ink, a: P.gold, b: P.ink, c: '#cfe8f0', e: P.blood }),
  bat: sprite(mirror(['........', '........', '.....o..', 'o....oo.', 'oo...oao', 'oao..oae', 'oaao.oaa', 'oaaaooaa', 'oaaaaaaa', 'o.oaaaaa',
    '...o.oaa', '......oa', '.......o', '........', '........', '........']), { o: P.ink, a: P.violet, e: P.glow }),
  tortoise: sprite(pad(['.....oooooo.....', '...oobcbbcboo...', '..obccbbbbccbo..', '.obbbbcbbcbbbbo.', '.obcbbbbbbbbcbo.', 'oooooooooooooooo',
    'oaaoaaaaaaaaoaeo', '.oo.oaaaaaao.oao', '....oo....oo..o.']), { o: P.ink, a: '#8a5a3a', b: P.rust, c: P.ember, e: P.glow }),
};

// ---------- items ----------

const bottle = (liquid: string): Sprite => sprite(mirror(['........', '........', '......oo', '.....obb', '......ob', '......ob', '.....oca', '....ocaa',
  '...oaaaa', '...oaaaa', '...oaaaa', '...oaaaa', '....oaaa', '.....ooo', '........', '........']), { o: P.ink, a: liquid, b: P.shell, c: '#ffffff' });

export const ITEM_ART: Readonly<Record<string, Sprite>> = {
  food: sprite(mirror(['........', '........', '........', '........', '........', '.....ooo', '...ooaaa', '..oacaaa', '.oaccaaa', '.oaaaaaa',
    '.oaaaaaa', '.obbbbbb', '..oooooo', '........', '........', '........']), { o: P.ink, a: '#d9a45a', b: '#a8743a', c: '#f4d49a' }),
  loaf: sprite(pad(['....oooooooo....', '..ooaaaaaaaaoo..', '.oacaaoaaoaaaao.', 'oaccaaoaaoaaaaao', 'oaaaaoaaoaaaaaao', 'oaaaaaaaaaaaaaao',
    'obbbbbbbbbbbbbbo', '.oooooooooooooo.']), { o: P.ink, a: '#d9a45a', b: '#a8743a', c: '#f4d49a' }),
  herb: sprite(['................', '..........ooo...', '........ooaao...', '.......oaaaco...', '......oaacao....', '.....oaacao.....',
    '....oaacaao.....', '...oaacaao......', '...oaaaao.......', '....oooo........', '...ob...........', '..ob............', '..o.............',
    '................', '................', '................'], { o: P.ink, a: P.moss, b: P.rust, c: P.leaf }),
  potion: bottle(P.blood),
  scroll: sprite(pad(['..oooooooooooo..', '.obboaaaaaaaaoo.', '.obbo.aaaaaaaao.', '..oooccccccccao.', '....oaaaaaaaaao.', '....occcccccaao.',
    '....oaaaaaaaaao.', '....occccccaaao.', '....oaaaaaaaoooo', '....oaaaaaaaobbo', '....oooooooooooo']), { o: P.ink, a: P.bone, b: '#c8b890', c: P.shell }),
  wand: sprite(['................', '............og..', '...........oggo.', '..........oaog..', '.........oao....', '........oao.....',
    '.......oao......', '......oao.......', '.....oao........', '....oao.........', '...oao..........', '..obo...........', '..oo............',
    '................', '................', '................'], { o: P.ink, a: '#a8744a', b: '#6e4a30', g: P.glow }),
  weapon: sprite(['................', '.............oo.', '............oco.', '...........oco..', '..........oco...', '.........oco....',
    '........oco.....', '...o...oco......', '...oo.oco.......', '....ooco........', '....obo.........', '...obooo........', '..obo..o........',
    '..oo............', '................', '................'], { o: P.ink, b: P.rust, c: '#c9c4d8' }),
  shield: sprite(mirror(['........', '...ooooo', '..oaaaaa', '.oaccccc', '.oacbbbb', '.oacbbbb', '.oacbbbb', '.oacbbbg', '.oacbbgg',
    '..oacbbb', '..oacbbb', '...oacbb', '....oacb', '.....oac', '......oo', '........']), { o: P.ink, a: P.shell, b: '#8b6a44', c: '#b89a6a', g: P.gold }),
  dart: sprite(['................', '................', '................', '..........oo....', '.........oco....', '........oco.....',
    '.......oco......', '......oco.......', '....oooo........', '...obbo.........', '..obo.o.........', '..oo............', '................',
    '................', '................', '................'], { o: P.ink, b: P.blood, c: '#c9c4d8' }),
  treasure: sprite(mirror(['........', '........', '........', '.....ooo', '....obbb', '...obbab', '..obbacc', '..obacgc', '.obbacgg', '.obbacgc',
    '.obbbacc', '..obbbaa', '...obbbb', '....oooo', '........', '........']), { o: P.ink, a: P.water, b: P.rockHi, c: P.violet, g: '#e8d8ff' }),
  opal: sprite(mirror(['........', '........', '........', '.....ooo', '....oaaa', '...oacca', '..oacgca', '..oaccaa', '..oaaaab', '...oaabb',
    '....oabb', '.....obb', '......oo', '........', '........', '........']), { o: P.ink, a: P.ember, b: P.blood, c: P.gold, g: '#ffffff' }),
  gold: sprite(pad(['......oooo......', '....ooaaaaoo....', '...oacaaaaabo...', '...ooaaaaaaoo...', '..oaooooooooao..', '.oacaaaaaaaaabo.',
    '.ooaaaaaaaaaaoo.', 'oaooooooooooooao', 'oacaaaaaaaaaaabo', '.oaaaaaaaaaaaoo.', '..oooooooooooo..']), { o: P.ink, a: P.gold, b: '#b0822a', c: '#fff2b8' }),
  lantern: sprite(mirror(['........', '......oo', '.....o..', '.....ooo', '....obbb', '...obggg', '...obgcc', '...obgcr', '...obgrr', '...obggr',
    '...obggg', '....obbb', '...ooooo', '...obbbb', '....oooo', '........']), { o: P.ink, b: P.gold, g: P.glow, c: '#ffffff', r: P.blood }),
};
const SPECIFIC = new Set(['loaf', 'opal']);

/** The sprite for an item id (by id when it has its own art, otherwise by kind). */
export function artFor(k: string): Sprite {
  if (SPECIFIC.has(k)) return ITEM_ART[k];
  const kind = ITEMS[k]?.kind ?? 'treasure';
  return ITEM_ART[kind === 'food' ? 'food' : kind];
}
/** A potion or wand drawn in its per-run look color. */
export function tinted(s: Sprite, key: string, hex: string | null): Sprite {
  return hex && Object.hasOwn(s.colors, key) ? { rows: s.rows, colors: { ...s.colors, [key]: hex } } : s;
}

// ---------- tiles ----------

const floorRows = ['aaaaaaaaaaaaaaab', 'abaaaaaaaaaaaaab', 'aaaaaaacaaaaaaab', 'aaaaaaaaaaaaaaab', 'aaaaaaaaaaaabaab', 'aacaaaaaaaaaaaab',
  'aaaaaaaaaaaaaaab', 'bbbbbbbbbbbbbbbb', 'aaaaaaabaaaaaaaa', 'aaaaaaabaaacaaaa', 'aabaaaabaaaaaaaa', 'aaaaaaabaaaaaaaa', 'aaaaaaabaaaaabaa',
  'acaaaaabaaaaaaaa', 'aaaaaaabaaaaaaaa', 'bbbbbbbbbbbbbbbb'];
export const TILE_ART: Readonly<Record<string, Sprite>> = {
  wall: sprite(['cccccccccccccccc', 'caaaaaaabcaaaaaa', 'caaaaaaabcaaaaaa', 'caaaaaaabcaaaaaa', 'bbbbbbbbbbbbbbbb', 'aaaabcaaaaaaabca',
    'aaaabcaaaaaaabca', 'aaaabcaaaaaaabca', 'bbbbbbbbbbbbbbbb', 'caaaaaaabcaaaaaa', 'caaaaaaabcaaaaaa', 'caaaaaaabcaaaaaa', 'bbbbbbbbbbbbbbbb',
    'aaaabcaaaaaaabca', 'aaaabcaaaaaaabca', 'bbbbbbbbbbbbbbbb'], { a: P.rock, b: P.rockLo, c: P.rockHi }),
  floor: sprite(floorRows, { a: P.floor, b: '#2f271f', c: P.floorHi }),
  corridor: sprite(['aaaaaaaaaaaaaaaa', 'aaaabaaaaaaaaaaa', 'aaaaaaaaaacaaaaa', 'aaaaaaaaaaaaaaaa', 'aacaaaaaaaaaabaa', 'aaaaaaaaaaaaaaaa',
    'aaaaaaabaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'abaaaaaaaaaacaaa', 'aaaaaaaaaaaaaaaa', 'aaaaacaaaaaaaaaa', 'aaaaaaaaaaaaabaa', 'aaaaaaaaaaaaaaaa',
    'aabaaaaaacaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa'], { a: '#302820', b: '#241d17', c: '#44392d' }),
  stairs: sprite(pad(['oooooooooooooooo', 'occcccccccccccco', 'oaaaaaaaaaaaaaao', 'o.occcccccccco.o', 'o.oaaaaaaaaaao.o', 'o..occcccccco..o',
    'o..oaaaaaaaao..o', 'o...occcccco...o', 'o...oaaaaaao...o', 'o....oooooo....o', 'oooooooooooooooo']), { o: P.ink, a: P.rockHi, c: P.bone }),
  trip: sprite(pad(['..o..........o..', '..oo........oo..', '...oaaaaaaaao...', '..oo........oo..', '..o..........o..']), { o: P.ink, a: P.bone }),
  pit: sprite(pad(['....oooooooo....', '..oobbbbbbbboo..', '.obbooooooooobo.', 'obboooooooooobbo', 'obboooooooooobbo', '.obbooooooooobo.',
    '..oobbbbbbbboo..', '....oooooooo....']), { o: P.ink, b: P.rust }),
  alarm: sprite(pad(['.......oo.......', '......oaao......', '.....oaaaao.....', '.....oaaaao.....', '....oaaaaaao....', '...oaaaaaaaao...',
    '...oooooooooo...', '.......oo.......', '......obbo......', '.......oo.......']), { o: P.ink, a: P.gold, b: P.ember }),
  pedestal: sprite(pad(['..oooooooooooo..', '.occccccccccccco', '.oaaaaaaaaaaaao.', '..oaaaaaaaaaao..', '...oaaaaaaaao...', '...oaaaaaaaao...',
    '..oaaaaaaaaaao..', '.occccccccccccco', '.oooooooooooooo.']), { o: P.ink, a: P.rockHi, c: P.bone }),
};

/** Draw a sprite at (x, y) with an integer scale; `flip` mirrors it horizontally. */
export function drawSprite(c: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1, flip = false): void {
  s.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      c.fillStyle = s.colors[ch];
      c.fillRect(x + (flip ? 15 - i : i) * scale, y + j * scale, scale, scale);
    }
  });
}

export type FriendRows = readonly string[];
/** The player's canonical one-bit Friend sprite: dark body, pale one-pixel halo so it reads on cave floors. */
export function drawFriend(c: CanvasRenderingContext2D, rows: FriendRows, x: number, y: number, scale = 1, flip = false): void {
  const w = rows[0]?.length ?? 16;
  const on = (i: number, j: number) => j >= 0 && j < rows.length && i >= 0 && i < w && rows[j][i] === '#';
  c.fillStyle = P.glow;
  for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= w; i++) {
    if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) c.fillRect(x + (flip ? w - 1 - i : i) * scale, y + j * scale, scale, scale);
  }
  c.fillStyle = P.ink;
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (on(i, j)) c.fillRect(x + (flip ? w - 1 - i : i) * scale, y + j * scale, scale, scale);
}
