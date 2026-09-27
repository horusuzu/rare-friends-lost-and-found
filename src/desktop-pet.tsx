"use client";
/**
 * Desktop pet (trusted host only): an always-on-top Document Picture-in-Picture window with the selected Friend and
 * its real, read-only unclaimed RF. Enabled only for games in the host's fixed PET_GAMES table, for a verified running
 * session, on browsers with documentPictureInPicture (desktop Chrome/Edge 116+). Sandboxed game code cannot open,
 * address or configure it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPetPoller, detectPetSupport, petMustClose, petSessionKey, petToggleVisible, PET_WINDOW, type PetSession } from './desktop-pet-control.js';
import type { GenerationSprites } from './generation-sprites.js';
import { petGame } from './pet-games.js';
import { mountPetView } from './pet-view.js';

export type DesktopPetOptions = {
  /** The game definition name; looked up in the host's PET_GAMES table. */
  gameName: string;
  /** The verified running session, or null when there is none. */
  session: PetSession | null;
  /** The Friend's display label, e.g. "Friend #7730". */
  label: string;
  /** The host's read-only reward reader for this session. */
  readRewards?: () => Promise<unknown>;
  loadSprites: () => Promise<GenerationSprites>;
};
type PipApi = { requestWindow(options: { width: number; height: number }): Promise<Window> };
type Active = { key: string; win: Window | null; teardown?: () => void };

function startPet(win: Window, options: DesktopPetOptions, session: PetSession, title: string): () => void {
  const view = mountPetView(win, { label: options.label, gameTitle: title, loadSprites: options.loadSprites, onActivate: () => window.focus() });
  const poller = createPetPoller({
    friendId: session.friendId, collection: session.collection, read: options.readRewards!,
    setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: id => win.clearTimeout(id),
    hidden: () => win.document.visibilityState === 'hidden', onUpdate: reader => view.update(reader),
  });
  const visibility = () => poller.visibilityChanged();
  win.document.addEventListener('visibilitychange', visibility);
  poller.start();
  return () => { poller.stop(); win.document.removeEventListener('visibilitychange', visibility); view.destroy(); };
}

export function useDesktopPet(options: DesktopPetOptions) {
  const [supported] = useState(() => typeof window !== 'undefined' && detectPetSupport(window));
  const sessionKey = petSessionKey(options.session);
  const visible = petToggleVisible({ gameName: options.gameName, verified: sessionKey !== null && typeof options.readRewards === 'function', supported });
  const [open, setOpen] = useState(false);
  const active = useRef<Active | null>(null);
  const mounted = useRef(true);
  const latest = useRef(options); latest.current = options;

  const close = useCallback(() => {
    const current = active.current;
    active.current = null;
    if (current) {
      current.teardown?.();
      try { current.win?.close(); } catch { /* already closed */ }
    }
    if (mounted.current) setOpen(false);
  }, []);

  /** Must run inside the click handler: requestWindow needs the user activation. */
  const toggle = useCallback(() => {
    if (active.current) { close(); return; }
    const opts = latest.current, session = opts.session, key = petSessionKey(session), game = petGame(opts.gameName);
    const api = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
    if (!key || !session || !game || typeof opts.readRewards !== 'function' || !detectPetSupport(window) || !api) return;
    const entry: Active = { key, win: null };
    active.current = entry;
    setOpen(true);
    let request: Promise<Window>;
    try { request = Promise.resolve(api.requestWindow({ ...PET_WINDOW })); } catch (error) { request = Promise.reject(error); }
    request.then(win => {
      // Closed, toggled off or the session changed while the window was being created.
      if (active.current !== entry) { try { win.close(); } catch { /* ignore */ } return; }
      entry.win = win;
      // Its own ✕ (or the game tab navigating away) ends the pet.
      win.addEventListener('pagehide', () => { if (active.current === entry) close(); }, { once: true });
      entry.teardown = startPet(win, opts, session, game.title);
    }, () => { if (active.current === entry) close(); });
  }, [close]);

  // Friend, account, network or wallet change, disconnect, or the game session ending.
  useEffect(() => { if (active.current && petMustClose(active.current.key, latest.current.session)) close(); }, [sessionKey, close]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; close(); }; }, [close]);
  return { visible, open, toggle };
}

export function DesktopPetButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const ja = typeof navigator !== 'undefined' && /^ja\b/i.test(navigator.language ?? '');
  return <button type="button" className="rf-frame-pet" aria-pressed={open} onClick={onToggle}
    title={ja ? 'デスクトップペット：常に手前に出る小窓（読み取りのみ）' : 'Desktop pet: an always-on-top mini window (read-only)'}>{ja ? '🐾 ペット' : '🐾 Pet'}</button>;
}
