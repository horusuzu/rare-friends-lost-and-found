/**
 * Polls the trusted host's read-only reward reader. One read at a time (the bridge allows only one pending), paused
 * while the game is paused or the page is hidden, 20 s apart with a quick second read and backoff on errors.
 * The reader never claims, activates or sends anything.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameClient } from '@rarefriends/friendsdk/game';
import { EMPTY_READER, nextDelay, onFail, onRead, readSample, type Reader } from './feed.ts';

export interface Rewards {
  readonly reader: Reader;
  readonly available: boolean;
  /** A read is in flight. */
  readonly busy: boolean;
  /** Read again now (clears the failure count). */
  readonly retry: () => void;
}

const hiddenNow = (): boolean => typeof document !== 'undefined' && document.hidden;

export function useRewards(client: GameClient, friendId: bigint, collection: 'genesis' | 'generations', running: boolean): Rewards {
  const available = typeof client.readRewards === 'function';
  const [reader, setReader] = useState<Reader>(EMPTY_READER);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(hiddenNow);
  const state = useRef<Reader>(EMPTY_READER), inFlight = useRef(false), alive = useRef(true), dueAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = running && !hidden && available;
  const liveRef = useRef(live); liveRef.current = live;

  const clear = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const read = useRef<() => Promise<void>>(async () => undefined);
  const schedule = useCallback(() => {
    clear();
    if (!alive.current || !liveRef.current || inFlight.current) return;
    timer.current = setTimeout(() => { timer.current = null; void read.current(); }, Math.max(0, dueAt.current - Date.now()));
  }, []);
  read.current = async () => {
    const readRewards = client.readRewards;
    if (inFlight.current || !liveRef.current || !readRewards) return;
    inFlight.current = true; setBusy(true);
    let next: Reader;
    try { next = onRead(state.current, readSample(await readRewards(), friendId, collection)); }
    catch { next = onFail(state.current); }
    inFlight.current = false;
    if (!alive.current) return;
    state.current = next; setReader(next); setBusy(false);
    dueAt.current = Date.now() + nextDelay({ ok: next.failures === 0, reads: next.reads, failures: next.failures, everOk: next.everOk });
    schedule();
  };

  useEffect(() => { if (live) schedule(); else clear(); }, [live, schedule]);
  useEffect(() => {
    alive.current = true;
    const visibility = () => setHidden(hiddenNow());
    document.addEventListener('visibilitychange', visibility);
    return () => { alive.current = false; clear(); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const retry = useCallback(() => {
    state.current = { ...state.current, failures: 0 }; setReader(state.current);
    dueAt.current = 0; schedule();
  }, [schedule]);
  return { reader, available, busy, retry };
}
