import type { ChanceGameDefinition, GameSnapshot, GameClient } from './game.js';
import { scoreGame } from './score-games.js';

export type GameMethod = 'read' | 'canBuy' | 'buy' | 'play' | 'settle' | 'redeem' | 'loadLocal' | 'saveLocal' | 'readRewards' | 'shareScore';
export type GameArguments = readonly (bigint | number | string)[];
const UINT256_MAX = (1n << 256n) - 1n;
const quantity = (value: unknown) => typeof value === 'bigint' && value > 0n && value <= 99n;
function valid(method: unknown, args: unknown, outcomes: number, maxWave = 5): args is (bigint | number | string)[] {
  if (!Array.isArray(args)) return false;
  switch (method) {
    case 'read': case 'loadLocal': case 'readRewards': return args.length === 0;
    case 'shareScore': return args.length === 4 && Number.isSafeInteger(args[0]) && args[0] >= 0 && args[0] < 1e9 && Number.isInteger(args[1]) && args[1] >= 1 && args[1] <= maxWave && ['over','won'].includes(args[2]) && ['ja','en'].includes(args[3]);
    case 'saveLocal': return args.length === 1 && validLocalValue(args[0]);
    case 'canBuy': case 'buy': case 'play': return args.length === 1 && quantity(args[0]);
    case 'settle': return args.length === 1 && typeof args[0] === 'bigint' && args[0] > 0n && args[0] <= UINT256_MAX;
    case 'redeem': return args.length === 2 && Number.isInteger(args[0]) && args[0] >= 1 && args[0] <= outcomes && quantity(args[1]);
    default: return false;
  }
}

// Provider errors can contain private RPC URLs, API keys, request bodies and wallet
// diagnostics. Only SDK-authored public messages cross the community-game boundary.
const PUBLIC_ACTION_ERRORS = new Set([
  'Game session changed.', 'Game action cancelled.', 'Cancelled',
  'Another game action is pending.', 'Another game transaction is pending.',
  'Close the host menu before playing.', 'Choose a quantity from 1 through 99.',
  'Invalid outcome.', 'Invalid play ID.', 'This play belongs to a different Friend.',
  'Dice fee exceeds the approved maximum. Keep this pending cast and review the fee before retrying.',
]);
function publicError(error: unknown, method: GameMethod): string {
  if (method === 'readRewards') return 'Could not read real rewards. Try again later.';
  if (method === 'loadLocal' || method === 'saveLocal') return 'Local preview storage is unavailable.';
  if (error instanceof Error) {
    const transaction = error as Error & { code?: unknown; transactionHash?: unknown };
    if (transaction.name === 'ChanceTransactionError' && typeof transaction.transactionHash === 'string' &&
        /^0x[0-9a-f]{64}$/i.test(transaction.transactionHash)) {
      const messages: Record<string, string> = {
        unconfirmed: 'has an unknown confirmation status', replaced: 'was replaced',
        reorg: 'is no longer confirmed on the expected chain', unverified: 'has an unverified game result',
        reverted: 'reverted',
      };
      if (typeof transaction.code === 'string' && Object.hasOwn(messages, transaction.code)) {
        return `Transaction ${transaction.transactionHash} ${messages[transaction.code]}. Inspect the transaction in your wallet before retrying the same action.`;
      }
    }
    if (PUBLIC_ACTION_ERRORS.has(error.message) || /^Cast #[1-9][0-9]{0,77} is pending\. Finish that same cast before starting another\.$/.test(error.message)) {
      return error.message;
    }
  }
  return method === 'read' || method === 'canBuy'
    ? 'Could not read game state. Retry the read.'
    : 'Game action failed. Check your wallet and transaction status before trying the same action again.';
}

/** Trusted host only. Transfer the other port to the exact sandboxed iframe window. */
export function bindGameFrame(port: MessagePort, options: {
  client: GameClient;
  onShareScore?: (result: import("./score-share.js").ScoreShare) => void;
  authorize: (method: GameMethod, args: GameArguments) => Promise<void>;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onError?: (error: Error, method: GameMethod) => void;
  onActionChange?: (busy: boolean) => void;
}) {
  let alive = true, busy = false, rewardsBusy = false, lastId = 0, paused = false;
  const send = (message: unknown) => { if (alive) port.postMessage(message); };
  port.onmessage = async ({ data }: MessageEvent<unknown>) => {
    if (!alive || !data || typeof data !== 'object') return;
    const request = data as { type?: unknown; id?: unknown; method?: unknown; args?: unknown };
    if (request.type !== 'friendsdk:request' || !Number.isSafeInteger(request.id) || Number(request.id) <= lastId) return;
    const id = Number(request.id); lastId = id;
    if (!valid(request.method, request.args, options.client.definition.outcomes.length, scoreGame(options.client.definition.name)?.maxWave)) {
      send({ type: 'friendsdk:response', id, error: 'Unsupported game action.' }); return;
    }
    if (request.method === 'shareScore') {
      if (paused || options.client.mode !== 'preview' || !options.onShareScore) { send({ type: 'friendsdk:response', id, error: paused ? 'Close the host menu before playing.' : 'Score sharing unavailable.' }); return; }
      options.onShareScore(request.args as unknown as import('./score-share.js').ScoreShare);
      send({ type: 'friendsdk:response', id }); return;
    }
    // This read never holds the simulated-ledger lock: closing the panel must not
    // strand a care save while a public RPC is slow. Only one reward read at a time.
    if (request.method === 'readRewards') {
      if (rewardsBusy) { send({ type: 'friendsdk:response', id, error: 'A reward read is already pending.' }); return; }
      rewardsBusy = true;
      try {
        if (!options.client.readRewards) throw new Error('Reward reader unavailable');
        const value = await options.client.readRewards();
        send({ type: 'friendsdk:response', id, value });
      } catch { send({ type: 'friendsdk:response', id, error: publicError(new Error(), 'readRewards') }); }
      finally { rewardsBusy = false; }
      return;
    }
    if (busy) { send({ type: 'friendsdk:response', id, error: 'Another game action is pending.' }); return; }
    const method = request.method as GameMethod, args = request.args;
    const mutation = ['buy', 'play', 'redeem'].includes(method) || (method === 'settle' && options.client.mode === 'chain');
    if (paused && (mutation || method === 'saveLocal')) {
      send({ type: 'friendsdk:response', id, error: 'Close the host menu before playing.' }); return;
    }
    busy = true;
    if (mutation) options.onActionChange?.(true);
    try {
      if (mutation) await options.authorize(method, args);
      // Authorization may have waited on a menu while selection/account changed.
      if (!alive) return;
      let value: unknown;
      switch (method) {
        case 'loadLocal':
          if (options.client.mode !== 'preview' || !options.client.loadLocal) throw new Error('Storage unavailable');
          value = await options.client.loadLocal();
          if (value !== null && !validLocalValue(value)) throw new Error('Invalid stored preview');
          break;
        case 'saveLocal':
          if (options.client.mode !== 'preview' || !options.client.saveLocal) throw new Error('Storage unavailable');
          await options.client.saveLocal(args[0] as string); break;
        case 'read': value = await options.client.read(); break;
        case 'canBuy': value = await options.client.canBuy(args[0] as bigint); break;
        case 'buy': value = await options.client.buy(args[0] as bigint); break;
        case 'play': value = await options.client.play(args[0] as bigint); break;
        case 'settle': value = await options.client.settle(args[0] as bigint); break;
        case 'redeem': value = await options.client.redeem(args[0] as number, args[1] as bigint); break;
      }
      if (!alive) return;
      if (method === 'read') options.onSnapshot?.(value as GameSnapshot);
      else if (options.client.mode === 'preview' && method !== 'canBuy' && method !== 'loadLocal' && method !== 'saveLocal') options.onSnapshot?.(await options.client.read());
      send({ type: 'friendsdk:response', id, value });
    } catch (error) {
      if (alive) options.onError?.(error instanceof Error ? error : new Error('Game action failed.'), method);
      send({ type: 'friendsdk:response', id, error: publicError(error, method) });
    } finally { busy = false; if (alive && mutation) options.onActionChange?.(false); }
  };
  port.start();
  return {
    setPaused(value: boolean) { paused = value; send({ type: 'friendsdk:paused', paused }); },
    close() { if (!alive) return; port.postMessage({ type: 'friendsdk:closed' }); alive = false; port.onmessage = null; port.close(); },
  };
}

/** Game-side client. No signer, account selection, deployment, or arbitrary RPC. */
export function createFrameGameClient(port: MessagePort, definition: ChanceGameDefinition, onPause?: (paused: boolean) => void, mode: GameClient["mode"] = "preview") {
  let nextId = 0, alive = true;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const close = () => {
    alive = false;
    for (const request of pending.values()) request.reject(new Error('Game session changed.'));
    pending.clear(); port.onmessage = null; port.close();
  };
  port.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'friendsdk:closed') { close(); return; }
    if (data.type === 'friendsdk:paused' && typeof data.paused === 'boolean') { onPause?.(data.paused); return; }
    if (data.type !== 'friendsdk:response') return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (typeof data.error === 'string') request.reject(new Error(data.error)); else request.resolve(data.value);
  };
  port.start();
  function call<T>(method: GameMethod, args: GameArguments): Promise<T> {
    if (!alive) return Promise.reject(new Error('Game session changed.'));
    if (pending.size >= 8) return Promise.reject(new Error('Too many pending game actions.'));
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: value => resolve(value as T), reject });
      port.postMessage({ type: 'friendsdk:request', id, method, args });
    });
  }
  const client = Object.freeze<GameClient>({ mode, definition,
    ...(mode === 'preview' ? { loadLocal: () => call<string | null>('loadLocal', []), saveLocal: (value: string) => call<void>('saveLocal', [value]) } : {}),
    shareScore: (score, wave, status, language) => call('shareScore', [score,wave,status,language]),
    readRewards: () => call('readRewards', []),
    read: () => call('read', []), canBuy: quantity => call('canBuy', [quantity]),
    buy: quantity => call('buy', [quantity]), play: (quantity = 1n) => call('play', [quantity]),
    settle: playId => call('settle', [playId]), redeem: (outcomeId, quantity) => call('redeem', [outcomeId, quantity]),
  });
  return { client, close };
}

const LOCAL_PREVIEW_LIMIT = 32 * 1024;
function validLocalValue(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LOCAL_PREVIEW_LIMIT && new TextEncoder().encode(value).byteLength <= LOCAL_PREVIEW_LIMIT;
}

/** Trusted runtime only: a fixed game/NFT slot, never a child-selected storage key. */
export function createPreviewLocalStore(options: {
  frameUrl: string; friendId: bigint; collection?: "genesis" | "generations"; walletAddress: string;
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  assertActive: () => void;
}): Required<Pick<GameClient, 'loadLocal' | 'saveLocal'>> {
  const key = `friendsdk:local-preview:${options.collection === "genesis" ? "genesis:" : ""}v1:${JSON.stringify([options.frameUrl, options.friendId.toString(), options.walletAddress.toLowerCase()])}`;
  return {
    async loadLocal() {
      options.assertActive();
      const value = options.storage().getItem(key);
      if (value !== null && !validLocalValue(value)) throw new Error('Local preview storage is unavailable.');
      return value;
    },
    async saveLocal(value) {
      options.assertActive();
      if (!validLocalValue(value)) throw new Error('Invalid local preview save.');
      options.storage().setItem(key, value);
    },
  };
}
