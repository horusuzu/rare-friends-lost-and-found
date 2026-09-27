/**
 * Desktop pet control logic for the trusted host: support detection, toggle gating, closing on session changes and a
 * read-only reward poller. No DOM, no network of its own; everything is injected so it can be tested headlessly.
 */
import { petGame } from './pet-games.js';
import { EMPTY_READER, nextDelay, onFail, onRead, readSample, type Reader } from './reward-feed.js';

/** Requested Document Picture-in-Picture window size, in CSS pixels. */
export const PET_WINDOW = Object.freeze({ width: 220, height: 260 });

/** Desktop Chrome/Edge 116+ expose `documentPictureInPicture`; Safari, Firefox and phones do not. */
export function detectPetSupport(win: unknown): boolean {
  if (!win || typeof win !== 'object' || !('documentPictureInPicture' in win)) return false;
  const api = (win as { documentPictureInPicture?: unknown }).documentPictureInPicture;
  if (!api || typeof (api as { requestWindow?: unknown }).requestWindow !== 'function') return false;
  const nav = (win as { navigator?: { userAgentData?: { mobile?: unknown } } }).navigator;
  return nav?.userAgentData?.mobile !== true;
}

export function petToggleVisible({ gameName, verified, supported }: { gameName: string; verified: boolean; supported: boolean }): boolean {
  return supported && verified && petGame(gameName) !== undefined;
}

/** The verified session a pet belongs to. `running` is false while the game session is not connected. */
export type PetSession = Readonly<{
  friendId: bigint; collection: 'genesis' | 'generations'; account: string; chainId: number | null; walletAddress: string; running: boolean;
}>;
export function petSessionKey(session: PetSession | null): string | null {
  if (!session || !session.running) return null;
  return JSON.stringify([session.collection, session.friendId.toString(), session.account.toLowerCase(), session.chainId, session.walletAddress.toLowerCase()]);
}
/** An open pet (opened for `openedKey`) closes on any Friend, account, network or wallet change, and when the session stops. */
export function petMustClose(openedKey: string | null, current: PetSession | null): boolean {
  return openedKey !== null && petSessionKey(current) !== openedKey;
}

export type PetStatus = 'reading' | 'measuring' | 'accruing' | 'none' | 'failed';
export function petStatus(reader: Reader): PetStatus {
  if (reader.failures > 0) return 'failed';
  if (!reader.last) return 'reading';
  if (!reader.last.active || reader.feed.rate === 0n) return 'none';
  return reader.feed.rate === null ? 'measuring' : 'accruing';
}

export type PetPollerOptions = {
  friendId: bigint; collection: 'genesis' | 'generations';
  /** The host's read-only reward reader. */
  read: () => Promise<unknown>;
  setTimer: (fn: () => void, ms: number) => number; clearTimer: (id: number) => void;
  /** True while the pet window is hidden (no reads then). */
  hidden: () => boolean;
  now?: () => number;
  onUpdate: (reader: Reader) => void;
};
/** One read at a time, a quick second read then every 20 s, backoff on errors, paused while hidden. */
export function createPetPoller({ friendId, collection, read, setTimer, clearTimer, hidden, now = Date.now, onUpdate }: PetPollerOptions) {
  let reader = EMPTY_READER, timer: number | null = null, inFlight = false, stopped = false, started = false, due = 0;
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };
  function schedule() {
    clear();
    if (stopped || !started || inFlight || hidden()) return;
    timer = setTimer(() => { timer = null; void run(); }, Math.max(0, due - now()));
  }
  async function run() {
    if (stopped || inFlight || hidden()) return;
    inFlight = true;
    let next: Reader;
    try { next = onRead(reader, readSample(await read(), friendId, collection)); }
    catch { next = onFail(reader); }
    inFlight = false;
    if (stopped) return;
    reader = next;
    onUpdate(reader);
    due = now() + nextDelay({ ok: reader.failures === 0, reads: reader.reads, failures: reader.failures, everOk: reader.everOk });
    schedule();
  }
  return {
    start() { if (stopped || started) { schedule(); return; } started = true; due = now(); schedule(); },
    /** Call on the pet window's visibilitychange. */
    visibilityChanged() { if (hidden()) clear(); else schedule(); },
    stop() { stopped = true; clear(); },
    get reader() { return reader; },
  };
}
