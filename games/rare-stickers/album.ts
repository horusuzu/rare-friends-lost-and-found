/**
 * Sticker book model: deterministic pack pulls of the player's own Friend, compact trade codes,
 * and an album of pages with freely placed stickers. Stickers are collectibles with no value;
 * trade codes are not proofs of anything, only a way to hand a sticker design to someone else.
 */
export type Collection = 'generations' | 'genesis';
export interface Owner { collection: Collection; tokenId: bigint }
export interface Sticker extends Owner { style: number; backdrop: number; hue: number; nameA: number; nameB: number; serial: number }
export type Source = 'pack' | 'trade';
export interface Placed { sticker: Sticker; source: Source; page: number; x: number; y: number; rot: number }
export interface Album { version: 1; packs: number; day: string; items: Placed[] }

export interface Style { id: string; ja: string; en: string; rarity: 1 | 2 | 3 | 4; weight: number }
export const STYLES: readonly Style[] = [
  { id: 'matte', ja: 'ノーマル', en: 'Matte', rarity: 1, weight: 30 },
  { id: 'patch', ja: 'ワッペン', en: 'Patch', rarity: 1, weight: 18 },
  { id: 'puffy', ja: 'ぷっくり', en: 'Puffy', rarity: 2, weight: 14 },
  { id: 'clear', ja: 'クリア', en: 'Clear', rarity: 2, weight: 12 },
  { id: 'glitter', ja: 'ラメ', en: 'Glitter', rarity: 2, weight: 11 },
  { id: 'holo', ja: 'ホロ', en: 'Holo', rarity: 3, weight: 7 },
  { id: 'prism', ja: 'プリズム', en: 'Prism', rarity: 3, weight: 5 },
  { id: 'gold', ja: '金箔', en: 'Gold Foil', rarity: 4, weight: 3 },
];
export const RARITY_LABEL: Record<Style['rarity'], [string, string]> = { 1: ['ノーマル', 'COMMON'], 2: ['レア', 'RARE'], 3: ['キラ', 'SHINY'], 4: ['レジェンド', 'LEGEND'] };
const NAME_A: readonly [string, string][] = [
  ['スーパー', 'Super'], ['ゴッド', 'God'], ['ネオ', 'Neo'], ['ミラクル', 'Miracle'], ['シャイン', 'Shine'], ['ブラック', 'Black'],
  ['ホーリー', 'Holy'], ['マッハ', 'Mach'], ['ギガ', 'Giga'], ['プリンセス', 'Princess'], ['ダーク', 'Dark'], ['キング', 'King'],
  ['ソニック', 'Sonic'], ['ロイヤル', 'Royal'], ['ドリーム', 'Dream'], ['アルティメット', 'Ultimate'],
];
const NAME_B: readonly [string, string][] = [
  ['フレンド', 'Friend'], ['ドラゴン', 'Dragon'], ['エンジェル', 'Angel'], ['ナイト', 'Knight'], ['ウィング', 'Wing'], ['スター', 'Star'],
  ['サムライ', 'Samurai'], ['ファントム', 'Phantom'], ['ブレイブ', 'Brave'], ['ルーン', 'Rune'], ['ノヴァ', 'Nova'], ['ハート', 'Heart'],
  ['タイガー', 'Tiger'], ['ジェット', 'Jet'], ['ティアラ', 'Tiara'], ['コメット', 'Comet'],
];
export const PACKS_PER_DAY = 3;
export const MAX_PACKS = 9;
export const MAX_ITEMS = 150;
export const PAGE_CAP = 8;

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One pack = one sticker of the player's own Friend in a random style. */
export function openPack(owner: Owner, seed: number): Sticker {
  const next = rng(seed ^ Number(owner.tokenId % 0x7fffffffn));
  const total = STYLES.reduce((sum, s) => sum + s.weight, 0);
  let roll = next() * total, style = 0;
  while (roll >= STYLES[style].weight) { roll -= STYLES[style].weight; style++; }
  return {
    collection: owner.collection, tokenId: owner.tokenId, style,
    backdrop: Math.floor(next() * 8), hue: Math.floor(next() * 12),
    nameA: Math.floor(next() * NAME_A.length), nameB: Math.floor(next() * NAME_B.length),
    serial: 1 + Math.floor(next() * 9999),
  };
}

export function stickerName(s: Sticker, lang: 'ja' | 'en'): string {
  const i = lang === 'ja' ? 0 : 1;
  return lang === 'ja' ? `${NAME_A[s.nameA][i]}${NAME_B[s.nameB][i]}` : `${NAME_A[s.nameA][i]} ${NAME_B[s.nameB][i]}`;
}

// ---- Trade codes: version, packed fields, LEB128 token id, CRC-16, Crockford base32. ----
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function crc16(bytes: number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
function toBase32(bytes: number[]): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } value &= (1 << bits) - 1; }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(text: string): number[] {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('This is not a sticker code.');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; value &= (1 << bits) - 1; }
  }
  return out;
}

export function encodeCode(s: Sticker): string {
  const bytes = [1, s.style | (s.backdrop << 3) | (s.collection === 'genesis' ? 64 : 0), s.hue, (s.nameA << 4) | s.nameB, s.serial >> 8, s.serial & 255];
  let id = s.tokenId;
  do { const low = Number(id & 0x7fn); id >>= 7n; bytes.push(id > 0n ? low | 0x80 : low); } while (id > 0n);
  const crc = crc16(bytes);
  const body = toBase32([...bytes, crc >> 8, crc & 255]);
  return `RF-${body.match(/.{1,4}/g)!.join('-')}`;
}

export function decodeCode(input: string): Sticker {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/^RF/, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (cleaned.length < 12 || cleaned.length > 40) throw new Error('This is not a sticker code.');
  const bytes = fromBase32(cleaned);
  // Drop trailing padding bits that do not form a byte.
  const payload = bytes.slice(0, -2), crc = (bytes.at(-2)! << 8) | bytes.at(-1)!;
  if (payload.length < 7 || crc16(payload) !== crc || toBase32(bytes) !== cleaned) throw new Error('This sticker code has a typo. Check it and try again.');
  if (payload[0] !== 1) throw new Error('This sticker code is from a newer version.');
  let tokenId = 0n, shift = 0n, i = 6;
  for (; i < payload.length; i++) { tokenId |= BigInt(payload[i] & 0x7f) << shift; shift += 7n; if (!(payload[i] & 0x80)) break; }
  if (i !== payload.length - 1 || shift > 70n) throw new Error('This is not a sticker code.');
  const hue = payload[2], serial = (payload[4] << 8) | payload[5];
  if (hue > 11 || serial < 1 || serial > 9999 || (payload[1] & 128)) throw new Error('This is not a sticker code.');
  return {
    collection: payload[1] & 64 ? 'genesis' : 'generations', tokenId,
    style: payload[1] & 7, backdrop: (payload[1] >> 3) & 7, hue, nameA: payload[3] >> 4, nameB: payload[3] & 15, serial,
  };
}

// ---- Album ----
export function newAlbum(day: string): Album { return { version: 1, packs: PACKS_PER_DAY, day, items: [] }; }

export function refillPacks(album: Album, day: string): Album {
  if (day <= album.day) return album;
  return { ...album, day, packs: Math.min(MAX_PACKS, album.packs + PACKS_PER_DAY) };
}

export function usePack(album: Album): Album {
  if (album.packs <= 0) throw new Error('No packs left today.');
  return { ...album, packs: album.packs - 1 };
}

const sameSticker = (a: Sticker, b: Sticker) => encodeCode(a) === encodeCode(b);

/** Stick onto the last page, or start a new page once it holds PAGE_CAP stickers. */
export function addSticker(album: Album, sticker: Sticker, source: Source, seed: number): Album {
  if (album.items.length >= MAX_ITEMS) throw new Error('Your sticker book is full.');
  if (source === 'trade' && album.items.some(it => it.source === 'trade' && sameSticker(it.sticker, sticker))) throw new Error('You already have this traded sticker.');
  const lastPage = album.items.reduce((max, it) => Math.max(max, it.page), 0);
  const onLast = album.items.filter(it => it.page === lastPage).length;
  const page = onLast >= PAGE_CAP ? lastPage + 1 : lastPage;
  const slot = album.items.filter(it => it.page === page).length, next = rng(seed);
  const x = round(clamp01(0.25 + (slot % 2) * 0.5 + (next() - 0.5) * 0.12));
  const y = round(clamp01(0.13 + Math.floor(slot / 2) * 0.25 + (next() - 0.5) * 0.06));
  const rot = round((next() - 0.5) * 0.3);
  return { ...album, items: [...album.items, { sticker, source, page, x, y, rot }] };
}

export function moveSticker(album: Album, index: number, x: number, y: number): Album {
  if (!album.items[index]) throw new Error('That sticker is not in the book.');
  return { ...album, items: album.items.map((it, i) => i === index ? { ...it, x: round(clamp01(x)), y: round(clamp01(y)) } : it) };
}

type StoredItem = [code: string, source: 'p' | 't', page: number, x: number, y: number, rot: number];
export function serializeAlbum(album: Album): string {
  const items: StoredItem[] = album.items.map(it => [encodeCode(it.sticker), it.source === 'pack' ? 'p' : 't', it.page, Math.round(it.x * 1000), Math.round(it.y * 1000), Math.round(it.rot * 1000)]);
  return JSON.stringify({ version: 1, packs: album.packs, day: album.day, items });
}

export function parseAlbum(raw: string | null): Album | null {
  if (raw === null) return null;
  const v = JSON.parse(raw) as { version?: unknown; packs?: unknown; day?: unknown; items?: unknown };
  const int = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (v.version !== 1 || !int(v.packs, 0, MAX_PACKS) || typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
      !Array.isArray(v.items) || v.items.length > MAX_ITEMS) throw new Error('Invalid sticker book.');
  const items = v.items.map((raw: unknown): Placed => {
    if (!Array.isArray(raw) || raw.length !== 6) throw new Error('Invalid sticker book.');
    const [code, source, page, x, y, rot] = raw as StoredItem;
    if (typeof code !== 'string' || (source !== 'p' && source !== 't') || !int(page, 0, MAX_ITEMS) || !int(x, 0, 1000) || !int(y, 0, 1000) || !int(rot, -250, 250)) throw new Error('Invalid sticker book.');
    return { sticker: decodeCode(code), source: source === 'p' ? 'pack' : 'trade', page, x: x / 1000, y: y / 1000, rot: rot / 1000 };
  });
  return { version: 1, packs: v.packs as number, day: v.day, items };
}
