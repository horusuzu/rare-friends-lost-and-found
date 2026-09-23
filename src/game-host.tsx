"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createWalletClient, custom, defineChain, formatEther, isAddress, parseAbi, parseUnits, zeroAddress, type Address, type EIP1193Provider } from "viem";
import { GENERATION_SPRITE_MANIFEST } from "./generation-sprites.js";
const WALLET_ABI = parseAbi(["function tokenBoundAccount(uint256 tokenId) view returns (address)"]);
import {ScoreShareDialog,type ScoreShare} from "./score-share.js";
import { readFriendRewards } from './friend-rewards.js';
import { bindGameFrame, createPreviewLocalStore, type GameArguments, type GameMethod } from "./frame-bridge.js";
import { GameFrame, type GameConfirmation, type GameFriend, type GameFrameProps } from "./game-frame.js";
import { createGamePreview, maximumPrize, RF, type ChanceGameDefinition, type GameSnapshot, type GameClient, type PreviewGameClient } from "./game.js";
import { createLiveGameClient, LIVE_GAME_MAX_ORACLE_FEE, type LiveGameDeployment, type LiveGameOptions } from "./live-game.js";
import { fundFriendWallet } from "./friend-funding.js";
import type { ChanceWalletClient } from "./chain.js";
import { readGenerationEligibility, readGenesisEligibility, type GenerationIdentityClient } from "./identity.js";
import { readOwnedFriends, type OwnedFriendsClient, type OwnedFriend } from "./owned-friends.js";
import { createFriendWalletSession, createFriendPublicClient, type FriendWalletProvider, type FriendWalletSession } from "./wallet.js";

export type GameHostProps = {
  definition: ChanceGameDefinition;
  /** Optional linked Genesis, displayed only after same-owner verification. */
  linkedGenesisId?: bigint;
  /** Explicit opt-in for Genesis companion previews; never enables live actions. */
  allowGenesisPreview?: boolean;
  frameUrl: string;
  /** Explicit live deployment; omit for simulated gameplay. */
  deployment?: LiveGameDeployment;
  /** Optional browser wallet already used by this project. */
  walletProvider?: FriendWalletProvider;
  /** Optional read-only RPC override. The public default needs no API key. */
  publicClient?: OwnedFriendsClient;
};

/** Complete game runtime: connection, owned Friends, verification, frame and confirmations. */
export function GameHost({ walletProvider, publicClient, ...props }: GameHostProps) {
  const [connection, setConnection] = useState<{ provider: FriendWalletProvider | undefined; session: FriendWalletSession } | null>(null);
  const [defaultClient] = useState(() => createFriendPublicClient());
  useEffect(() => {
    const session = createFriendWalletSession({ provider: walletProvider });
    setConnection({ provider: walletProvider, session });
    return () => session.dispose();
  }, [walletProvider]);
  if (!connection || connection.provider !== walletProvider) return <GameFrame mode={props.deployment ? "live" : "preview"} friends={[]} selectedFriendId={null} friendsLoading>
    <p className="rf-runtime-status" role="status">Loading wallet connection…</p>
  </GameFrame>;
  return <WalletViewport {...props} session={connection.session} publicClient={publicClient ?? defaultClient} />;
}

function WalletViewport({ session, publicClient, ...props }: Omit<GameHostProps, "walletProvider" | "publicClient"> & {
  session: FriendWalletSession; publicClient: OwnedFriendsClient;
}) {
  const wallet = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const provider = session.getProvider();
  const walletClient = useMemo(() => provider && wallet.account && props.deployment ? createWalletClient({
    account: wallet.account, chain: defineChain({ id: props.deployment.chainId, name: "Robinhood",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [GENERATION_SPRITE_MANIFEST.rpcUrl] } } }),
    transport: custom(provider as EIP1193Provider),
  }) : undefined, [provider, wallet.account, wallet.revision, props.deployment]);
  const assertWalletActive = useCallback(() => {
    const current = session.getSnapshot();
    if (current.revision !== wallet.revision || current.status !== "connected" || session.getProvider() !== provider) {
      throw new Error("Wallet session changed. Reconnect before continuing.");
    }
  }, [session, wallet.revision, provider]);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<{id: bigint; collection?: "genesis" | "generations"} | null>(null);
  const [discovery, setDiscovery] = useState<{
    client: OwnedFriendsClient; session: FriendWalletSession; revision: number; attempt: number; friends: readonly GameFriend[]; hiddenCount?: number; error?: string;
  } | null>(null);
  const valid = wallet.status === "connected" && discovery?.revision === wallet.revision &&
    discovery.client === publicClient && discovery.session === session && discovery.attempt === attempt ? discovery : null;
  const friends = valid?.friends ?? [];
  const friend = friends.find(value => value.id === selected?.id && (value.collection ?? "generations") === (selected.collection ?? "generations")) ?? null;
  useEffect(() => {
    setSelected(null);
    if (wallet.status !== "connected" || !wallet.account) return;
    const controller = new AbortController();
    const genesisEnabled = props.allowGenesisPreview && !props.deployment && props.linkedGenesisId !== undefined;
    void Promise.allSettled([
      readOwnedFriends(publicClient, wallet.account, { signal: controller.signal }),
      genesisEnabled ? readGenesisEligibility(publicClient, props.linkedGenesisId!, wallet.account) : Promise.resolve(null),
    ]).then(([generations, genesis]) => {
      if (controller.signal.aborted) return;
      const friends: GameFriend[] = [];
      if (genesis.status === "fulfilled" && genesis.value?.eligible) friends.push({ id: props.linkedGenesisId!, collection: "genesis", label: `Genesis #${props.linkedGenesisId}`, kind: "owned", walletAddress: genesis.value.walletAddress });
      if (generations.status === "fulfilled") friends.push(...generations.value.friends);
      const errors = [generations.status === "rejected" ? "Generationsを読み込めませんでした。再読み込みしてください。" : "", genesis.status === "rejected" ? "Genesisを確認できませんでした。再読み込みしてください。" : ""].filter(Boolean);
      setDiscovery({ client: publicClient, session, revision: wallet.revision, attempt, friends,
        hiddenCount: generations.status === "fulfilled" ? generations.value.hiddenCount : 0, error: errors.join(" ") || undefined });
    });
    return () => controller.abort();
  }, [session, publicClient, wallet.status, wallet.account, wallet.revision, attempt, props.allowGenesisPreview, props.linkedGenesisId, props.deployment]);
  const connection = <div className="rf-runtime-connection">
    {wallet.status === "unavailable" && <><p>No browser wallet found. Enable your wallet extension or open this game in your wallet’s browser.</p><button type="button" onClick={() => { void session.connect(); }}>Check for wallet</button></>}
    {wallet.status === "disconnected" && <p>Connect your wallet to find your Friends on Robinhood.</p>}
    {wallet.status === "connecting" && <p role="status">Connecting wallet…</p>}
    {wallet.status === "switching-network" && <button type="button" disabled>Switching network… Check your wallet</button>}
    {wallet.status === "wrong-network" && <p role="alert">Your wallet is on {wallet.chainId === 1 ? "Ethereum mainnet" : `chain ${wallet.chainId}`}. Switch to Robinhood mainnet (4663) to load your Friends.</p>}
    {wallet.error && <p role="alert">{wallet.error}</p>}
    {wallet.account && <p>Connected: {wallet.account}</p>}
    {(wallet.status === "disconnected" || wallet.status === "error") && wallet.wallets.map(value =>
      <button key={value.id} type="button" onClick={() => { void session.connect(value.id); }}>{wallet.wallets.length === 1 ? "Connect wallet" : `Connect ${value.name}`}</button>)}
    {wallet.account && <button type="button" onClick={() => session.disconnect()}>Disconnect</button>}
    {wallet.status === "connected" && <button type="button" onClick={() => setAttempt(value => value + 1)}>{valid?.error ? "Retry loading Friends" : "Refresh Friends"}</button>}
    {wallet.status === "wrong-network" && <><button type="button" className="rf-frame-primary" onClick={() => { void session.switchNetwork(); }}>Switch to Robinhood</button><button type="button" onClick={() => { void session.refresh(); }}>Check network</button></>}
  </div>;
  return <ConnectedViewport {...props} selectedFriend={friend} account={wallet.account} chainId={wallet.chainId}
    publicClient={publicClient} revision={wallet.revision} walletClient={walletClient} assertActive={assertWalletActive} picker={{ friends, onSelectFriend: (id, collection) => setSelected({id, collection}), connection,
      friendsLoading: wallet.status === "connected" && !valid, friendsError: valid?.error,
      friendsHiddenCount: valid?.hiddenCount,
      friendsEmptyMessage: valid && !valid.error ? valid.hiddenCount ? "No eligible Friends available in this wallet." : "No Rare Friends Generations NFTs found in this wallet on Robinhood." : null }} />;
}

export type ConnectedGameHostProps = {
  definition: ChanceGameDefinition;
  /** Optional linked Genesis, displayed only after same-owner verification. */
  linkedGenesisId?: bigint;
  /** Explicit opt-in for Genesis companion previews; never enables live actions. */
  allowGenesisPreview?: boolean;
  /** Optional integration with connection and selection already available in this project. */
  selectedFriend: GameFriend | null;
  account: string | null;
  chainId: number | null;
  /** Read-only client; ownership is checked by the SDK before play. */
  publicClient: GenerationIdentityClient | null;
  /** URL of the game document rendered through GameSession. */
  frameUrl: string;
  /** Change when a supplied connection invalidates identity. */
  revision?: number;
  deployment?: LiveGameDeployment;
  /** Required only when a deployment is supplied. Stays in the trusted runtime. */
  walletClient?: ChanceWalletClient;
  assertActive?: () => void;
};
type Picker = Pick<GameFrameProps, "friends" | "onSelectFriend" | "connection" | "friendsLoading" | "friendsError" | "friendsEmptyMessage" | "friendsHiddenCount" | "onConnect">;

/** SDK frame for a project that already supplies connection and selection. */
export function ConnectedGameHost(props: ConnectedGameHostProps) { return <ConnectedViewport {...props} />; }

function ConnectedViewport({ allowGenesisPreview, linkedGenesisId, definition, selectedFriend, account, chainId, publicClient, frameUrl, revision = 0, picker, deployment, walletClient, assertActive }: ConnectedGameHostProps & { picker?: Picker }) {
  const ledgerState = useRef({ definition, revision: 0, ledgers: new Map<string, PreviewGameClient>() });
  if (ledgerState.current.definition !== definition) ledgerState.current = { definition, revision: ledgerState.current.revision + 1, ledgers: new Map() };
  const ledgers = ledgerState.current.ledgers;
  const key = JSON.stringify([selectedFriend?.collection ?? "generations", allowGenesisPreview, linkedGenesisId?.toString(), selectedFriend?.id.toString(), selectedFriend?.walletAddress?.toLowerCase(), account?.toLowerCase(), chainId]);
  const sessionKey = `${key}:${revision}:${ledgerState.current.revision}:${deployment?.game ?? "preview"}`;
  if (!selectedFriend || !account || chainId === null || !publicClient) return <GameFrame mode={deployment ? "live" : "preview"} selectionMode={picker ? "picker" : "host"}
    friends={selectedFriend ? [selectedFriend] : []} selectedFriendId={selectedFriend?.id ?? null} selectedFriendCollection={selectedFriend?.collection} {...picker}>
    <p className="rf-runtime-status" role="status">Connect a wallet and choose an owned hardwired Friend.</p>
  </GameFrame>;
  return <EligibilityGate key={sessionKey} definition={definition} picker={picker} friend={selectedFriend} account={account} chainId={chainId} publicClient={publicClient}
    frameUrl={frameUrl} allowGenesisPreview={allowGenesisPreview} linkedGenesisId={linkedGenesisId} ledgers={ledgers} deployment={deployment} walletClient={walletClient} assertActive={assertActive} />;
}

function EligibilityGate({ allowGenesisPreview, linkedGenesisId, definition, picker, friend, account, chainId, publicClient, frameUrl, ledgers, deployment, walletClient, assertActive }: {
  definition: ChanceGameDefinition; picker?: Picker; linkedGenesisId?: bigint; allowGenesisPreview?: boolean;
  friend: GameFriend; account: string; chainId: number; publicClient: GenerationIdentityClient; frameUrl: string;
  ledgers: Map<string, PreviewGameClient>;
  deployment?: LiveGameDeployment; walletClient?: ChanceWalletClient; assertActive?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [verification, setVerification] = useState<{ client: GenerationIdentityClient; eligible: boolean; walletAddress?: string; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setVerification(null);
    if (chainId !== 4663) {
      setVerification({ client: publicClient, eligible: false, error: "Switch your wallet to Robinhood mainnet (4663)." });
      return () => { alive = false; };
    }
    void (async () => {
      if (friend.collection === "genesis") {
        if (deployment || !allowGenesisPreview) throw new Error("Genesis is available only in enabled companion previews.");
        const result = await readGenesisEligibility(publicClient, friend.id, account as Address);
        if (alive) setVerification({ client: publicClient, eligible: result.eligible, walletAddress: result.walletAddress,
          error: result.eligible ? undefined : "このウォレットは選択したGenesisを所有していません。" });
        return;
      }
      const result = await readGenerationEligibility(publicClient, friend.id, account as Address);
      let walletAddress: string | undefined;
      if (result.eligible) {
        walletAddress = await publicClient.readContract({ address: GENERATION_SPRITE_MANIFEST.generations, abi: WALLET_ABI,
          functionName: "tokenBoundAccount", args: [friend.id], blockNumber: result.blockNumber });
        if (!isAddress(walletAddress) || walletAddress.toLowerCase() === zeroAddress) throw new Error("Invalid canonical Friend wallet.");
      }
      if (alive) setVerification({ client: publicClient, eligible: result.eligible === true, walletAddress,
        error: result.eligible ? undefined : "The connected account must own this hardwired Generations Friend (generation 1 or higher)." });
    })().catch(cause => {
      if (alive) setVerification({ client: publicClient, eligible: false,
        error: `Could not verify this Friend. ${cause instanceof Error ? cause.message : "Try again."}` });
    });
    return () => { alive = false; };
  }, [publicClient, friend.id, friend.collection, account, chainId, attempt, allowGenesisPreview, deployment]);
  // A replaced read client invalidates verification during render, before effects.
  const checked = verification?.client === publicClient ? verification : null;
  if (!checked?.eligible) return <GameFrame mode={deployment ? "live" : "preview"} selectionMode={picker ? "picker" : "host"} friends={[friend]} selectedFriendId={friend.id} selectedFriendCollection={friend.collection} {...picker}>
    <div className="rf-runtime-status" role={checked?.error ? "alert" : "status"}>
      <p>{checked?.error ?? "Checking ownership and hardwired eligibility…"}</p>
      {checked?.error && <button type="button" onClick={() => { setVerification(null); setAttempt(value => value + 1); }}>Retry eligibility</button>}
    </div>
  </GameFrame>;
  if (deployment) {
    if (!walletClient) return <GameFrame mode="live" friends={[friend]} selectedFriendId={friend.id} selectedFriendCollection={friend.collection} {...picker}>
      <p role="alert">Connect a wallet to send live game transactions.</p>
    </GameFrame>;
    return <EmbeddedSession key={frameUrl} picker={picker} friend={{ ...friend, kind: "owned", walletAddress: checked.walletAddress }}
      definition={definition} frameUrl={frameUrl} live={{ definition, deployment, friendId: friend.id, account: account as Address,
        friendWallet: checked.walletAddress as Address,
        publicClient: publicClient as LiveGameOptions["publicClient"], walletClient, assertActive }} />;
  }
  const ledgerKey = `${chainId}:${friend.collection ?? "generations"}:${friend.id}:${checked.walletAddress!.toLowerCase()}`;
  let client = ledgers.get(ledgerKey);
  if (!client) {
    client = createGamePreview(definition, { friendId: friend.id, stake: maximumPrize(definition) * 10n, rfBalance: 20n * RF }).client;
    ledgers.set(ledgerKey, client);
  }
  // Remount both the bridge and child on any identity/network/URL change.
  return <EmbeddedSession key={frameUrl} picker={picker} friend={{ ...friend, kind: "owned", walletAddress: checked.walletAddress }} client={client} definition={definition} frameUrl={frameUrl} rewards={{ publicClient, account: account as Address, genesisId: linkedGenesisId }} />;
}

function EmbeddedSession({ friend, client, definition, live, frameUrl, picker, rewards }: {
  friend: GameFriend; client?: GameClient; definition: ChanceGameDefinition; live?: LiveGameOptions; frameUrl: string; picker?: Picker; rewards?: { publicClient: GenerationIdentityClient; account: Address; genesisId?: bigint };
}) {
  const liveRef = useRef(live); liveRef.current = live;
  const mode = live ? "live" : "preview";
  const epoch = useRef(0);
  const mounted = useRef(false);
  const [fundAmount, setFundAmount] = useState("1");
  const [funding, setFunding] = useState(false);
  const fundingRef = useRef(false);
  const actionPending = useRef(false);
  const [transactionPending, setTransactionPending] = useState(false);
  const [fundMessage, setFundMessage] = useState("");
  const iframe = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<ReturnType<typeof bindGameFrame> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const paused = useRef(false);
  const [scoreShare,setScoreShare]=useState<ScoreShare|null>(null);
  const sharing=useRef(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<GameConfirmation | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const onMenuChange = useCallback((open: boolean) => { paused.current = open; bridge.current?.setPaused(open || fundingRef.current || sharing.current); }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    let alive = true, timedOut = false, loaded = false;
    let documentId: string | null = null;
    let handshakeId: string | null = null;
    let timeout: number;
    const frame = iframe.current!;
    setStatus("loading");
    setSessionError("");
    setConfirmation(null);
    function disconnect() {
      sharing.current=false;setScoreShare(null);
      epoch.current++;
      bridge.current?.close(); bridge.current = null;
      pending.current?.();
      actionPending.current = false; setTransactionPending(false);
      setSnapshot(null);
      setStatus("loading");
    }
    function startTimeout() {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (!alive) return;
        timedOut = true;
        disconnect(); setStatus("error");
      }, 10_000);
    }
    function load() {
      if (!alive) return;
      // A WindowProxy survives navigation; the old port and approval must not.
      disconnect(); documentId = null; handshakeId = null; loaded = true; timedOut = false;
      startTimeout();
      frame.contentWindow?.postMessage({ type: "friendsdk:connect" }, "*");
    }
    startTimeout();
    function authorize(method: GameMethod, args: GameArguments) {
      return new Promise<void>((resolve, reject) => {
        if (!alive) { reject(new Error("Game session changed.")); return; }
        const quantity = args[method === "redeem" ? 1 : 0] as bigint;
        const outcome = method === "redeem" ? definition.outcomes[Number(args[0]) - 1] : undefined;
        let finished = false;
        const finish = (approved: boolean) => {
          if (finished) return;
          finished = true;
          pending.current = null;
          if (alive) setConfirmation(null);
          if (approved && alive) resolve(); else reject(new Error("Game action cancelled."));
        };
        pending.current = () => finish(false);
        setConfirmation({
          title: method === "buy" ? `Buy ${definition.consumable.toLowerCase()}` : method === "play" ? `Use ${definition.consumable.toLowerCase()}` : method === "settle" ? "Resolve result" : "Redeem reward",
          description: method === "buy" ? `${quantity} ${definition.consumable.toLowerCase()} for ${friend.label}.${liveRef.current ? " Approves the exact RF cost, then purchases with the Friend wallet. Each transaction requires your wallet confirmation and ETH gas." : ""}`
            : method === "play" ? `Use ${quantity} ${definition.consumable.toLowerCase()} from ${friend.label}.`
            : method === "settle" ? `RNG request: ${formatEther(LIVE_GAME_MAX_ORACLE_FEE)} ETH, plus transaction gas. Request the Dice result and settle this play. Pending plays reuse their existing request without another RNG fee or consumable.`
            : `${quantity} ${outcome!.name}; ${liveRef.current ? "RF" : "simulated RF"} returns to this Friend.`,
          notice: method === "settle" ? "Rare Friends plans to subsidize RNG costs for all developers to improve the user experience and reduce costs. This demo does not include the subsidy; it demonstrates the paid RNG flow." : undefined,
          amount: method === "buy" ? definition.price * quantity : outcome ? outcome.reward * quantity : undefined,
          onConfirm: () => finish(true), onCancel: () => finish(false),
        });
      });
    }
    function ready(event: MessageEvent) {
      if (!alive || event.source !== frame.contentWindow) return;
      if (documentId === event.data?.documentId && handshakeId === event.data?.handshakeId) {
        if (event.data.type === "friendsdk:unloading") {
          disconnect(); loaded = false; documentId = null; handshakeId = null; startTimeout(); return;
        }
        if (event.data.type === "friendsdk:reset") {
          disconnect(); handshakeId = null; startTimeout(); return;
        }
      }
      if (timedOut || event.data?.type !== "friendsdk:ready" || typeof event.data.documentId !== "string" ||
        typeof event.data.handshakeId !== "string" || event.data.documentId.length > 200 || event.data.handshakeId.length > 200) return;
      // Detect replacement even if the new child's effect runs before its load event.
      if (documentId && documentId !== event.data.documentId) {
        disconnect(); loaded = false; documentId = null; handshakeId = null; startTimeout();
      }
      if (documentId === event.data.documentId && handshakeId !== event.data.handshakeId) disconnect();
      if (!loaded || bridge.current) return;
      documentId = event.data.documentId;
      handshakeId = event.data.handshakeId;
      const channel = new MessageChannel();
      const bridgeEpoch = ++epoch.current;
      let activeClient: GameClient;
      try { activeClient = liveRef.current ? createLiveGameClient({ ...liveRef.current, assertActive() {
        if (!alive || epoch.current !== bridgeEpoch) throw new Error("Game session changed.");
        liveRef.current?.assertActive?.();
      } }) : client!; }
      catch (error) {
        channel.port1.close(); channel.port2.close(); clearTimeout(timeout);
        setSessionError(error instanceof Error ? error.message : "Invalid game deployment."); setStatus("error"); return;
      }
      if (activeClient.mode === "preview") {
        activeClient = { ...activeClient, ...createPreviewLocalStore({
          frameUrl: new URL(frameUrl, window.location.href).href,
          friendId: friend.id, collection: friend.collection, walletAddress: friend.walletAddress!,
          storage: () => window.localStorage,
          assertActive() {
            if (!alive || epoch.current !== bridgeEpoch || bridge.current !== connection) throw new Error("Game session changed.");
          },
        }) };
      }
      if (rewards) {
        const context = rewards;
        activeClient = { ...activeClient, readRewards: async () => {
          if (!alive || epoch.current !== bridgeEpoch) throw new Error('Game session changed.');
          const value = await readFriendRewards(context.publicClient, { friendId: friend.id, collection: friend.collection, account: context.account, walletAddress: friend.walletAddress as Address, genesisId: context.genesisId });
          if (!alive || epoch.current !== bridgeEpoch) throw new Error('Game session changed.');
          return value;
        } };
      }
      clearTimeout(timeout);
      const connection = bindGameFrame(channel.port1, { client: activeClient, authorize,
        onShareScore: !live && definition.name === "Rare Invaders" ? result => { if (!alive) return; sharing.current=true; connection.setPaused(true); setScoreShare(result); } : undefined,
        onActionChange(value) { actionPending.current = value; if (alive) setTransactionPending(value); },
        onError(error, method) {
          if (alive && method === "read") { setSessionError(error.message); setStatus("error"); }
        }, onSnapshot(value) {
        if (!alive || bridge.current !== connection) return;
        clearTimeout(timeout); setSnapshot(value); setStatus("ready");
      } });
      bridge.current = connection;
      // An allow-scripts sandbox has an opaque origin: exact source-window check above
      // is the trust boundary, and * is required when transferring to that child.
      frame.contentWindow!.postMessage({ type: "friendsdk:init", documentId, handshakeId, friendId: friend.id, collection: friend.collection ?? "generations", mode: activeClient.mode }, "*", [channel.port2]);
      bridge.current.setPaused(paused.current);
    }
    frame.addEventListener("load", load);
    window.addEventListener("message", ready);
    return () => {
      alive = false; mounted.current = false; epoch.current++;
      clearTimeout(timeout);
      frame.removeEventListener("load", load);
      window.removeEventListener("message", ready);
      bridge.current?.close(); bridge.current = null;
      pending.current?.();
    };
  }, [client, definition, friend.id, friend.collection, attempt, rewards?.publicClient, rewards?.account, rewards?.genesisId]);

  async function topUp() {
    if (fundingRef.current || actionPending.current || !liveRef.current) return;
    fundingRef.current = true; setFunding(true); setFundMessage("");
    bridge.current?.setPaused(true);
    const startedEpoch = epoch.current;
    try {
      const amount = parseUnits(fundAmount, 18);
      if (!/^[0-9]+(?:\.[0-9]{1,18})?$/.test(fundAmount) || amount <= 0n) throw new Error("Enter a positive RF amount with at most 18 decimal places.");
      const hash = await fundFriendWallet({ ...liveRef.current, amount, assertActive() {
        if (!mounted.current || epoch.current !== startedEpoch) throw new Error("Game session changed.");
        liveRef.current?.assertActive?.();
      } });
      if (!mounted.current || epoch.current !== startedEpoch) return;
      setFundMessage(`RF transfer confirmed: ${hash}`);
      setAttempt(value => value + 1);
    } catch (cause) {
      if (mounted.current) setFundMessage(cause instanceof Error ? cause.message : "RF transfer failed.");
    } finally { fundingRef.current = false; if (mounted.current) { setFunding(false); bridge.current?.setPaused(paused.current); } }
  }
  return <GameFrame mode={mode} selectionMode={picker ? "picker" : "host"} friends={[friend]} selectedFriendId={friend.id} selectedFriendCollection={friend.collection}
    wallet={{ balance: snapshot?.rfBalance, status: snapshot ? "ready" : "loading" }}
    walletActions={live ? <div className="rf-runtime-connection">
      <p>Transfer RF from your connected wallet to this Friend to buy bait. This is a real RF transfer plus ETH gas.</p>
      <label>RF amount <input aria-label="RF amount" value={fundAmount} disabled={funding} inputMode="decimal" onChange={event => setFundAmount(event.target.value)} /></label>
      <button type="button" disabled={funding || transactionPending} onClick={() => { void topUp(); }}>{funding ? "Confirming transfer…" : "Transfer RF to Friend"}</button>
      {transactionPending && <p role="status">Finish the pending game action before transferring RF.</p>}
      {fundMessage && <p role="status">{fundMessage}</p>}
    </div> : rewards ? <div className="rf-runtime-connection"><p>実際の報酬の受取・アクティベートは公式サイトで行えます。このゲームから取引は送りません。</p><a href="https://rarefriends.com/portfolio" target="_blank" rel="noopener noreferrer">公式で確認・受取 ↗</a><p className="rf-frame-note">このパネルの demo RF はゲーム内の模擬残高です。実残高はおうちの貯金箱で確認してください。</p></div> : undefined}
    confirmation={confirmation} onMenuChange={onMenuChange} {...picker}>
    <iframe key={attempt} ref={iframe} src={frameUrl} title={definition.name} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    {scoreShare && <ScoreShareDialog result={scoreShare} friendId={friend.id} collection={friend.collection ?? "generations"} onClose={()=>{sharing.current=false;setScoreShare(null);bridge.current?.setPaused(paused.current || fundingRef.current);}}/>}
    {status !== "ready" && <div className="rf-runtime-status" role={status === "error" ? "alert" : "status"}>
      <p>{status === "loading" ? live ? "Loading live game…" : "Loading game preview…" : sessionError || "The game could not connect. Check the frame URL and its asset permissions."}</p>
      {status === "error" && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry game</button>}
    </div>}
  </GameFrame>;
}
