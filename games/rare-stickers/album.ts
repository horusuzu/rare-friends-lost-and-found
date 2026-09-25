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
/** rfPacks: RF packs opened so far (RF spent = rfPacks × pack price). */
export interface BattleRecord { wins: number; losses: number; draws: number }
export interface Challenge { nonce: number; deck: Sticker[] }
/**
 * rfPacks / rfBurned: RF tickets spent on packs / burned as battle entry fees.
 * challenges: my open challenges (their decks are needed to replay the reply).
 * fought: challenge keys already answered or settled, so a challenge counts only once.
 * sound: sound effects on/off (books saved before the setting existed load with sound on).
 */
export interface Album {
  version: 1; packs: number; day: string; rfPacks: number; rfBurned: number;
  record: BattleRecord; challenges: Challenge[]; fought: string[]; items: Placed[]; sound: boolean;
}
const MAX_CHALLENGES = 10, MAX_FOUGHT = 60;

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

/**
 * RF packs use the SDK chance game: outcome ids 1–4 (see game.json) pick the rarity, the seed the design.
 * 1 = rare (puffy, clear or glitter), 2 = holo, 3 = prism, 4 = gold foil.
 */
export const RF_PACK_OUTCOMES = [['レア', 'Rare'], ['ホロ', 'Holo'], ['プリズム', 'Prism'], ['金箔', 'Gold Foil']] as const;
export function premiumSticker(owner: Owner, outcomeId: number, seed: number): Sticker {
  if (!Number.isInteger(outcomeId) || outcomeId < 1 || outcomeId > RF_PACK_OUTCOMES.length) throw new Error('Unknown pack outcome.');
  const base = openPack(owner, seed);
  const style = outcomeId === 1 ? 2 + Math.floor(rng(seed ^ 0x5bd1e995)() * 3) : outcomeId + 3;
  return { ...base, style };
}
export function recordRfPack(album: Album): Album { return { ...album, rfPacks: album.rfPacks + 1 }; }

export function stickerName(s: Sticker, lang: 'ja' | 'en'): string {
  const i = lang === 'ja' ? 0 : 1;
  return lang === 'ja' ? `${NAME_A[s.nameA][i]}${NAME_B[s.nameB][i]}` : `${NAME_A[s.nameA][i]} ${NAME_B[s.nameB][i]}`;
}

// ---- Trade codes: version, packed fields, LEB128 token id, CRC-16, Crockford base32. ----
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function crc16(bytes: number[]): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
export function toBase32(bytes: number[]): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } value &= (1 << bits) - 1; }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(text: string): number[] {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('This is not a sticker code.');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; value &= (1 << bits) - 1; }
  }
  return out;
}

export function varint(value: bigint): number[] {
  const out: number[] = []; let id = value;
  do { const low = Number(id & 0x7fn); id >>= 7n; out.push(id > 0n ? low | 0x80 : low); } while (id > 0n);
  return out;
}
/** Reads a LEB128 token id; returns [id, next offset]. Throws on overlong or truncated input. */
export function readVarint(bytes: number[], start: number): [bigint, number] {
  let value = 0n, shift = 0n, i = start;
  for (; i < bytes.length; i++) { value |= BigInt(bytes[i] & 0x7f) << shift; shift += 7n; if (!(bytes[i] & 0x80)) break; }
  if (i >= bytes.length || shift > 70n) throw new Error('This is not a sticker code.');
  return [value, i + 1];
}
/** Sticker fields without version or checksum, shared by sticker and battle codes. */
export function stickerBytes(s: Sticker): number[] {
  return [s.style | (s.backdrop << 3) | (s.collection === 'genesis' ? 64 : 0), s.hue, (s.nameA << 4) | s.nameB, s.serial >> 8, s.serial & 255, ...varint(s.tokenId)];
}
export function readSticker(bytes: number[], start: number): [Sticker, number] {
  if (start + 6 > bytes.length) throw new Error('This is not a sticker code.');
  const [flags, hue, names, hi, lo] = bytes.slice(start, start + 5), serial = (hi << 8) | lo;
  if (hue > 11 || serial < 1 || serial > 9999 || (flags & 128)) throw new Error('This is not a sticker code.');
  const [tokenId, next] = readVarint(bytes, start + 5);
  return [{ collection: flags & 64 ? 'genesis' : 'generations', tokenId, style: flags & 7, backdrop: (flags >> 3) & 7, hue, nameA: names >> 4, nameB: names & 15, serial }, next];
}

export function encodeCode(s: Sticker): string {
  const bytes = [1, ...stickerBytes(s)];
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
  const [sticker, end] = readSticker(payload, 1);
  if (end !== payload.length) throw new Error('This is not a sticker code.');
  return sticker;
}

// ---- Album ----
export function newAlbum(day: string): Album {
  return { version: 1, packs: PACKS_PER_DAY, day, rfPacks: 0, rfBurned: 0, record: { wins: 0, losses: 0, draws: 0 }, challenges: [], fought: [], items: [], sound: true };
}
export function setSound(album: Album, sound: boolean): Album { return album.sound === sound ? album : { ...album, sound }; }
export function recordBattle(album: Album, result: 'win' | 'loss' | 'draw'): Album {
  const key = result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws';
  return { ...album, record: { ...album.record, [key]: album.record[key] + 1 } };
}
export function recordBurn(album: Album): Album { return { ...album, rfBurned: album.rfBurned + 1 }; }
export function addChallenge(album: Album, nonce: number, deck: Sticker[]): Album {
  return { ...album, challenges: [...album.challenges.filter(c => c.nonce !== nonce), { nonce, deck }].slice(-MAX_CHALLENGES) };
}
export function takeChallenge(album: Album, nonce: number): [Challenge | null, Album] {
  const found = album.challenges.find(c => c.nonce === nonce) ?? null;
  return [found, found ? { ...album, challenges: album.challenges.filter(c => c !== found) } : album];
}
export const hasFought = (album: Album, key: string) => album.fought.includes(key);
export function markFought(album: Album, key: string): Album {
  return { ...album, fought: [...album.fought.filter(k => k !== key), key].slice(-MAX_FOUGHT) };
}

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
  // A trade code can never duplicate a sticker already in the book, whether it came from a pack or a trade.
  if (source === 'trade' && album.items.some(it => sameSticker(it.sticker, sticker))) throw new Error('You already have this sticker.');
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
  const challenges = album.challenges.map(c => [c.nonce, c.deck.map(encodeCode)]);
  return JSON.stringify({ version: 1, packs: album.packs, day: album.day, rfPacks: album.rfPacks, rfBurned: album.rfBurned,
    record: [album.record.wins, album.record.losses, album.record.draws], challenges, fought: album.fought, items, sound: album.sound });
}

export function parseAlbum(raw: string | null): Album | null {
  if (raw === null) return null;
  const v = JSON.parse(raw) as { version?: unknown; packs?: unknown; day?: unknown; rfPacks?: unknown; rfBurned?: unknown; record?: unknown; challenges?: unknown; fought?: unknown; items?: unknown; sound?: unknown };
  const int = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (v.version !== 1 || !int(v.packs, 0, MAX_PACKS) || typeof v.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
      !Array.isArray(v.items) || v.items.length > MAX_ITEMS || (v.rfPacks !== undefined && !int(v.rfPacks, 0, 1_000_000)) ||
      (v.sound !== undefined && typeof v.sound !== 'boolean')) throw new Error('Invalid sticker book.');
  const items = v.items.map((raw: unknown): Placed => {
    if (!Array.isArray(raw) || raw.length !== 6) throw new Error('Invalid sticker book.');
    const [code, source, page, x, y, rot] = raw as StoredItem;
    if (typeof code !== 'string' || (source !== 'p' && source !== 't') || !int(page, 0, MAX_ITEMS) || !int(x, 0, 1000) || !int(y, 0, 1000) || !int(rot, -250, 250)) throw new Error('Invalid sticker book.');
    return { sticker: decodeCode(code), source: source === 'p' ? 'pack' : 'trade', page, x: x / 1000, y: y / 1000, rot: rot / 1000 };
  });
  const count = (n: unknown) => { if (!int(n, 0, 1_000_000)) throw new Error('Invalid sticker book.'); return n as number; };
  const rec = v.record ?? [0, 0, 0];
  if (!Array.isArray(rec) || rec.length !== 3) throw new Error('Invalid sticker book.');
  const rawChallenges = v.challenges ?? [], rawFought = v.fought ?? [];
  if (!Array.isArray(rawChallenges) || rawChallenges.length > MAX_CHALLENGES || !Array.isArray(rawFought) || rawFought.length > MAX_FOUGHT ||
      !rawFought.every(k => typeof k === 'string' && k.length <= 80)) throw new Error('Invalid sticker book.');
  const challenges = rawChallenges.map((c: unknown): Challenge => {
    if (!Array.isArray(c) || c.length !== 2 || !int(c[0], 0, 0xffffffff) || !Array.isArray(c[1]) || c[1].length !== 5) throw new Error('Invalid sticker book.');
    return { nonce: c[0], deck: c[1].map((code: unknown) => { if (typeof code !== 'string') throw new Error('Invalid sticker book.'); return decodeCode(code); }) };
  });
  return {
    version: 1, packs: v.packs as number, day: v.day, rfPacks: v.rfPacks === undefined ? 0 : count(v.rfPacks), rfBurned: v.rfBurned === undefined ? 0 : count(v.rfBurned),
    record: { wins: count(rec[0]), losses: count(rec[1]), draws: count(rec[2]) }, challenges, fought: rawFought as string[], items,
    sound: v.sound === undefined ? true : v.sound as boolean,
  };
}
