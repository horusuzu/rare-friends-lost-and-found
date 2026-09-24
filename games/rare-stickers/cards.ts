/**
 * Trading-card layer over stickers: stats from the sticker's finish and serial, a sun/moon/star
 * element triangle, a deterministic best-of-five auto battle, and battle codes that carry an
 * ordered deck. Battles are friendly matches; codes are not proofs of card ownership.
 */
import { STYLES, stickerBytes, readSticker, varint, readVarint, crc16, toBase32, fromBase32, encodeCode, type Owner, type Sticker } from './album.ts';

export const DECK_SIZE = 5;
export const ELEMENTS: readonly [string, string][] = [['太陽', 'Sun'], ['月', 'Moon'], ['星', 'Star']];
export interface Stats { hp: number; atk: number; def: number; element: number; rarity: number }
export interface Hit { by: 'a' | 'b'; damage: number; crit: boolean; hpA: number; hpB: number }
export interface Round { a: Sticker; b: Sticker; hits: Hit[]; hpA: number; hpB: number; winner: 'a' | 'b' | 'draw' }
export interface BattleResult { rounds: Round[]; winner: 'a' | 'b' | 'draw' }
export interface BattleCode { owner: Owner; nonce: number; deck: Sticker[] }
const MAX_HITS = 40;

export function cardStats(s: Sticker): Stats {
  const r = STYLES[s.style].rarity;
  return {
    hp: 20 + r * 7 + (s.serial % 7),
    atk: 5 + r * 2 + ((s.serial >> 3) % 4) + (s.nameA % 3),
    def: 2 + r + ((s.serial >> 5) % 3) + (s.nameB % 2),
    element: s.hue % 3, rarity: r,
  };
}

/** Sun beats Moon, Moon beats Star, Star beats Sun. */
export function advantage(attacker: number, defender: number): number {
  if ((attacker + 1) % 3 === defender) return 1.5;
  if ((defender + 1) % 3 === attacker) return 0.75;
  return 1;
}

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const unit = (seed: number) => {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function battleSeed(challenger: Sticker[], responder: Sticker[], nonce: number): number {
  return fnv(`${nonce}|${challenger.map(encodeCode).join(',')}|${responder.map(encodeCode).join(',')}`);
}

/**
 * Randomness depends on the attacking card, the round and the hit number — never on which side
 * the card sits — so swapping decks mirrors the result exactly.
 */
function fight(a: Sticker, b: Sticker, seed: number, round: number): Round {
  const sa = cardStats(a), sb = cardStats(b), ca = encodeCode(a), cb = encodeCode(b);
  let hpA = sa.hp, hpB = sb.hp;
  let turn: 'a' | 'b' = sa.atk !== sb.atk ? (sa.atk > sb.atk ? 'a' : 'b') : ca <= cb ? 'a' : 'b';
  const hits: Hit[] = [];
  while (hpA > 0 && hpB > 0 && hits.length < MAX_HITS) {
    const [att, def, code] = turn === 'a' ? [sa, sb, ca] : [sb, sa, cb];
    const r1 = unit(seed ^ fnv(`${code}|${round}|${hits.length}`)), r2 = unit(seed ^ fnv(`${code}|${round}|${hits.length}|c`));
    const crit = r2 < 0.1;
    const damage = Math.max(1, Math.round((att.atk * advantage(att.element, def.element) - def.def * 0.6 + (r1 * 3 - 1)) * (crit ? 1.5 : 1)));
    if (turn === 'a') hpB = Math.max(0, hpB - damage); else hpA = Math.max(0, hpA - damage);
    hits.push({ by: turn, damage, crit, hpA, hpB });
    turn = turn === 'a' ? 'b' : 'a';
  }
  const ratioA = hpA / sa.hp, ratioB = hpB / sb.hp;
  const winner = hpA === 0 && hpB > 0 ? 'b' : hpB === 0 && hpA > 0 ? 'a' : ratioA === ratioB ? 'draw' : ratioA > ratioB ? 'a' : 'b';
  return { a, b, hits, hpA, hpB, winner };
}

export function battle(deckA: Sticker[], deckB: Sticker[], seed: number): BattleResult {
  if (deckA.length !== DECK_SIZE || deckB.length !== DECK_SIZE) throw new Error(`A deck needs exactly ${DECK_SIZE} cards.`);
  const rounds = deckA.map((a, i) => fight(a, deckB[i], seed, i));
  const wins = (side: 'a' | 'b') => rounds.filter(r => r.winner === side).length;
  const left = (side: 'a' | 'b') => rounds.reduce((sum, r) => sum + (side === 'a' ? r.hpA / cardStats(r.a).hp : r.hpB / cardStats(r.b).hp), 0);
  const [wa, wb] = [wins('a'), wins('b')];
  const winner = wa !== wb ? (wa > wb ? 'a' : 'b') : left('a') === left('b') ? 'draw' : left('a') > left('b') ? 'a' : 'b';
  return { rounds, winner };
}

// ---- Battle codes: 0xB1, nonce (u32), owner, five cards, CRC-16, base32 with an RFB- prefix. ----
export function encodeBattle({ owner, nonce, deck }: BattleCode): string {
  if (deck.length !== DECK_SIZE) throw new Error(`A deck needs exactly ${DECK_SIZE} cards.`);
  const bytes = [0xb1, (nonce >>> 24) & 255, (nonce >>> 16) & 255, (nonce >>> 8) & 255, nonce & 255,
    owner.collection === 'genesis' ? 1 : 0, ...varint(owner.tokenId), ...deck.flatMap(stickerBytes)];
  const crc = crc16(bytes);
  return `RFB-${toBase32([...bytes, crc >> 8, crc & 255]).match(/.{1,5}/g)!.join('-')}`;
}

export function decodeBattle(input: string): BattleCode {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/^RFB/, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (cleaned.length < 40 || cleaned.length > 160) throw new Error('This is not a battle code.');
  let bytes: number[];
  try { bytes = fromBase32(cleaned); } catch { throw new Error('This is not a battle code.'); }
  const payload = bytes.slice(0, -2), crc = (bytes.at(-2)! << 8) | bytes.at(-1)!;
  if (crc16(payload) !== crc || toBase32(bytes) !== cleaned) throw new Error('This battle code has a typo. Check it and try again.');
  if (payload[0] !== 0xb1 || payload[5] > 1) throw new Error('This is not a battle code.');
  try {
    const nonce = ((payload[1] << 24) | (payload[2] << 16) | (payload[3] << 8) | payload[4]) >>> 0;
    const [tokenId, start] = readVarint(payload, 6);
    const deck: Sticker[] = [];
    let at = start;
    for (let i = 0; i < DECK_SIZE; i++) { const [card, next] = readSticker(payload, at); deck.push(card); at = next; }
    if (at !== payload.length) throw new Error('extra');
    return { owner: { collection: payload[5] ? 'genesis' : 'generations', tokenId }, nonce, deck };
  } catch { throw new Error('This is not a battle code.'); }
}
