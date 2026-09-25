# Rare Mine

An original idle-and-tap mining game starring your verified Rare Friends NFT. The mine shows **the real
RF your own NFT is earning**: the host reads your NFT's unclaimed rewards (read-only), the game measures
how fast they grow, and your Friend swings a pickaxe at the rock face of a lantern-lit shaft while
coins pop, arc into a mine cart and clink onto the pile at a pace tied to that real accrual. When the
pile looks good you choose: **Withdraw** (record it), or **Bet** the whole pot on a 45 % chance to
double it. Lose, and the whole stake is **burned**.

**The RF amounts shown are real and read-only; the bet and the burn are a simulation.** Nothing in
the game claims, moves, stakes or burns any token, and no wallet transaction is ever made. Real
claiming happens only on the official site (rarefriends.com/portfolio). A Friend with no accruing
rewards gets **practice mode**: the original simulated mine with "RF (preview)" coins.

Rare Mine targets the Vibeathon **Token Activity** category (most RF burned or spent). Built with
FriendSDK 0.1.2, React, a deterministic TypeScript engine and a 256 × 160 pixel canvas.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+), or the
configured Genesis #597. The host checks current collection-specific ownership on Robinhood Chain
(4663); wallet connection and read-only checks need no transaction or signature. The title reads your
NFT's rewards and shows 「NFTの未受取（本物）」 with the amount and rate, then offers
**本物の報酬で採掘する** (Mine my real rewards), or **つづきから** to reopen your saved ledger. If the
Friend earns nothing, or rewards cannot be read, it offers **練習モードで採掘** instead (see
[Practice mode](#practice-mode)). Japanese is the default; switch to English at any time.

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Tap the rock (cosmetic in real mode, a strike in practice) | tap the mine | Space or Enter |
| Withdraw the pot | 引き出す / Withdraw | W |
| Open the bet (odds first) | 倍かけ / Double or burn | B |
| Confirm / cancel the bet | かける / やめる | Y / N (or Esc) |
| Reveal a rolling bet at once | tap the spinning coin | Space, Enter or a tap |
| Sound on/off | ♪ | M |
| Pause | Ⅱ | P or Esc |

The game pauses when the page loses focus and whenever the runtime's `paused` prop is set; paused,
nothing is mined, no input is taken and reward reads stop.

## Real rewards (read-only)

The trusted host exposes `client.readRewards()`: a `FriendRewardsSnapshot` for the selected NFT
(`claimableRF`, `claimableWETH`, `active`, `blockNumber`, `checkedAt`, bigint 18-decimal base units).
It is read-only; there is no claim or activate action. The game validates every snapshot (the NFT,
the collection, the amount types and ranges) before using it (`feed.ts`).

**Polling.** One read at a time (the bridge allows only one pending read), never overlapping:

| Situation | Next read |
| --- | --- |
| After the first successful read | 5 s (so the rate is known quickly) |
| Every read after that | 20 s |
| Failures before any success | 2 s, 5 s, then 20 s doubling |
| Failures after a success | 40 s, 80 s, 160 s (cap) |
| Paused (menu or `paused` prop) or page hidden | no reads until visible and running again |

After 3 failures with no value yet, the game offers practice mode (「本物の報酬を読み取れませんでした
（残高0という意味ではありません）」). After a failure in real mode the HUD keeps estimating and shows
「更新できませんでした・推定表示中」 with a retry in the mode bar.

**Rate estimation.** The accrual rate is `(newest − oldest) / (checkedAt delta)` over the snapshots
of the last 3 minutes (at most 12). Spans under 2 s are ignored as too noisy. Before the second
snapshot the badge reads 「計測中…」; after it, 「+16.4 RF/分」 (three significant digits). A
snapshot from an older block or time is ignored. A snapshot **lower** than the last one means the
holder claimed on the official site: the window restarts from the new value and the rate is kept.

**Interpolation.** Between snapshots the shown value is `last + rate × elapsed`, clamped to 30 s
(1.5 poll intervals) past the snapshot so a stalled feed never runs away. The display eases toward
that target (it closes 6× its gap per second), holds instead of running backwards, and jumps only
after a claim. The pot odometer, the stats and the HUD redraw at most 8 times a second.

**Coins and clinks.** One coin stands for a fixed unit of real RF, the smallest 1-2-5 step
(… 0.001, 0.002, 0.005, 0.01 …) that keeps coins at or below 6 a second, so real accrual pops
**2.4–6 coins a second**:

| NFT (mainnet, measured) | Accrual | RF per coin | Coins per second |
| --- | --- | --- | --- |
| Genesis #597 | ≈ 16.4 RF/min | 0.05 | ≈ 5.5 |
| Friend #7730 | ≈ 0.2 RF/min | 0.001 | ≈ 3.3 |

Each whole coin unit the shown value crosses is due; the Friend strikes at most every 0.3 s carrying
up to 3 of them, and at most 12 wait (a catch-up after a pause never floods the mine). The pile, the
jar and the clink richness use the pot in these coin units (0.01 RF before the rate is known).

Taps are **cosmetic** in real mode (「タップは演出です」): sparks, chips and a few valueless flying
coins that never touch the pot. The HUD shows the pot, the rate badge, the NFT's unclaimed RF and
unclaimed WETH. The mine is labelled 「表示中のRFは本物の報酬（読み取りのみ）」.

## Pot, Withdraw and the simulated bet

The pot is a ledger over the real accrual (`real.ts`), per NFT:

```
pot = max(0, realEarned − baseline) + streakBonus
```

- **First baseline is 0**, so the first pot is the whole unclaimed amount.
- **Withdraw** (引き出す) records the pot as withdrawn and moves the baseline up to the current real
  value (never down); the streak ends. It is a record only: the mode bar says, as plain text,
  「本物の受け取りは公式サイト rarefriends.com/portfolio で」. There are no links or popups in game code.
- **Bet** (倍かけ) stakes the whole pot. The odds are shown **before** anything is staked:
  「勝率45%・勝てば2倍・負ければ全額バーン」, with the stake, win and burn amounts and
  「賭け・バーンはシミュレーション。本物のRFは動かず、燃えません」 on the dialog. Real accrual keeps
  flowing while the odds are open; the stake is the pot at the moment you confirm.
  - **Win** (45 %): the stake is added to `streakBonus`, so the pot doubles and stays at risk; real
    accrual continues on top. Streaks cap at 20 wins.
  - **Lose**: the whole pot is burned (simulated) and the baseline moves up to the current real value.
- **A claim on the official site** (a lower snapshot, or a saved baseline above the current value on
  load) records the pot as last seen as withdrawn and restarts the mine from the new value, so the pot
  is never negative and no stale bonus remains.

The ledger keeps `realized + winnings = withdrawn + burned + bonus` and `staked = winnings + burned`,
checked in tests and on every save load. The outcome is drawn from the NFT's own seeded bet stream
when you confirm and saved immediately, settled; the suspense only delays the reveal, so reloading
cannot undo a burn. The stats panel shows the NFT's unclaimed RF and accrual (real), recorded
withdrawals, the burned total and record (simulated), with 「賭け・バーンはシミュレーション。…」.

Withdraw is never hidden: it stays available beside the odds and is disabled only while a staked pot
is rolling.

### Odds and expected value

- P(win) = 0.45, payout ×2, so **EV = 0.45 × 2 = 0.9 × stake**: on average **10 % of every bet
  burns**. Measured over 100 000 bet draws: 44.9 %.
- A streak of *k* wins turns a pot *P* into `P × 2^k` with probability `0.45^k`; its expected value
  is `P × 0.9^k`. A ×16 streak (4 wins) happens 4.1 % of the time.

## Practice mode

Practice mode is used when the host has no reward reader, when reads fail 3 times before any value,
or when the NFT does not accrue (not activated, or no growth between snapshots). The title and the
mode bar say why, e.g. 「このFriendには報酬がたまっていません。アクティベートは公式サイトで。」, with
a **もう一度よむ** retry. The mine is labelled 「練習モード · シミュレーション・本物のRFではありません」 and
mines "RF (preview)" coins with the rules below. If a retry later finds accruing rewards, the mode bar
offers **本物の報酬で採掘** and the real ledger continues where it was.

### Practice mining

| Rule | Value |
| --- | --- |
| Automatic strike | every 1.0 s |
| Tap strike | immediate; taps closer than 0.08 s apart are ignored |
| Combo | +1 per tap, max 12; held 1 s after the last tap, then drains 6 levels/s |
| Combo speed-up | auto interval = `1.0 s / (1 + 0.125 × combo)` (0.4 s at max combo) |
| Coins per strike | 1–3 |
| Gold vein | 3 % of strikes, +12–30 coins |
| Gem | 0.8 % of strikes, +60–120 coins, with a flash |
| Rock face | breaks every 8 strikes for +5 coins and a new, deeper face |

Every strike's coins, vein and gem come from a seeded mining stream (mulberry32), so a seed replays
exactly. Expected yield is **3.975 coins per strike**. Measured with `balance-sim.mjs` over 40 seeds:

| Play style | RF (preview) per minute |
| --- | --- |
| Idle (auto only) | ≈ 240 |
| Tapping 3 times a second | ≈ 1 300 |
| Tapping 6 times a second | ≈ 2 000 |

An idle Friend fills the pot to 150 coins in about 40 s, when the Withdraw / Bet buttons pulse and a
hint asks for the first real choice. Over an hour, measured vein and gem rates were 3.04 % and 0.86 %.

### Practice withdraw and bet

Practice Withdraw moves the whole pot to a safe balance with a coin rain into the jar. The practice
bet uses the same odds, dialog and suspense as real mode (1.6 s, 0.3 s with reduced motion; tap to
reveal). Mining pauses while the odds are on screen, so the stake is exactly the pot you saw. Practice
keeps its own identities: `mined + winnings = withdrawn + burned + pot` and `staked = winnings + burned`.

## Stats and sharing

Real mode: the NFT's unclaimed RF and accrual rate (real), recorded withdrawals, **burned total
(simulated)**, best streak and bets won / lost. Practice mode: safe balance, total mined, total
withdrawn, total burned, best streak and bets won / lost.

After your first bet, **Share on X** posts through the trusted host share bridge (the same one
Rare Invaders, Rare Drop and Rare Rush use): your burned total (whole RF in real mode) and best streak,
e.g. 「🔥1200 RF（プレビュー）をバーン！ 最高×16（4連勝）」. The host copy labels it a simulation
(「シミュレーションです」); the host fixes the title and URL and game code cannot supply either.

## What is real, what is simulated, and the live integration gap

| Shown | Real or simulated |
| --- | --- |
| Unclaimed RF / WETH, accrual rate, the pot's accrued part | **Real**, read-only from the chain via the host |
| Withdraw | A local record; real claiming is on rarefriends.com/portfolio |
| Bet outcome, streak bonus, burned total | **Simulated** (seeded local RNG); no RF moves or burns |
| Practice-mode coins | "RF (preview)", simulated, no value |

The labels say so where each number appears: 「表示中のRFは本物の報酬（読み取りのみ）」 on the mine,
「賭け・バーンはシミュレーション。本物のRFは動かず、燃えません」 (EN: "The bet and burn are simulated.
Your real RF never moves or burns.") on the bet dialog, the stats and the footer, and
「練習モード · シミュレーション・本物のRFではありません」 in practice mode. The game never calls the
SDK's buy, play, settle or redeem actions. The required `game.json` chance-game block is an unused
placeholder (one outcome, no payout), like Rare Delve's.

A real bet on accrued rewards would need what SDK v0.1.2 does not provide:

- the rewards **claimed to the canonical NFT wallet** first (claiming is an official-site action;
  accrued-but-unclaimed RF cannot be staked);
- a Rare Friends **bet contract with a variable stake** (the whole pot, not a fixed consumable price)
  paid in RF from the canonical NFT wallet with an exact approval;
- a verifiable 45 % win chance from the oracle RNG, with the result settled on-chain before any
  reveal (the local design already fixes the outcome at confirmation and only animates it);
- a **2× payout funded from a reserved bankroll**, so every open bet's maximum prize is backed
  before it is accepted;
- a **burn** of lost stakes (transfer to a burn address or `burn()`), which is what the Token
  Activity category measures;
- the streak bonus would then be real winnings held by the contract until withdrawn or re-staked.

## Bet effects (pachinko-style reach, jackpot and burn)

Presentation only: the engine fixes the result at confirmation, and `reach.ts` receives that result as an input and
plans the show deterministically from the bet seed. Nothing here can draw, change or delay an outcome, and the odds
shown before staking (45 %, ×2, loss burns) never change.

- **Reach (リーチ).** The mine dims, spotlights sweep and a three-reel window (coin, gem, your Friend) spins. The
  first two reels stop matching at 0.6 s and 1.05 s, 「リーチ！」 is called at 1.1 s with a rising siren, an
  accelerating heartbeat and a flashing border, and the last reel crawls home. Some reaches escalate to
  「激アツ！」 (1.7 s) or 「超激アツ」 (2.3 s, three spotlights and rainbow colour). Like a pachinko 信頼度, the hotter tiers
  are more common before a win (win: 50 / 35 / 15 %, loss: 82 / 15 / 3 %), but the result was already fixed. 35 % of
  reaches hang on a near miss before the last reel settles. Total 2.6–3.95 s; tap to skip.
- **Win (大当たり).** The reels lock, one white flash, then rotating gold light rays, confetti and sparkles, a
  「大当たり！ ×2」 banner with a shine sweep, and a coin torrent that really fills the cart while the pot rolls up.
  Streaks escalate: ×4 「連チャン！」, ×8 「確変突入！」 with a rainbow wash, ×16 and up **FEVER** with expanding rings.
  Sound: a sub-bass hit, a flash zap, a three-phrase square/saw fanfare (original melody, transposed up each tier),
  a bell cascade, a 2–3 s 「ジャラジャラ」 pour of streamed coin clinks, and from 確変 a driving fever loop that climbs a
  semitone a bar. On screen 3.0–4.5 s.
- **Lose (バーン).** The last reel slides off with a clunk, a beat of silence, one dim orange flash and a short
  shake, then the cart bursts into flame with rising embers, charred coin crumbs and smoke, under 「🔥 N バーン」.
  Sound: a deep boom and whoosh, a descending wah-wah brass, coin clatter and crackling embers. On screen 2.2 s.
- **Safety and comfort.** Each celebration has at most one full flash (no strobing and no red flashes), particles
  are capped, and everything is canvas or CSS transform/opacity. With reduced motion the reach is a 0.3 s static
  reveal and the win/lose cards are still (1.8 s) with no flash or shake. ♪ / M mute everything including the fever
  loop, and pause, page hide, unmount or a new bet stop the show at once.

## Sound

Synthesised with WebAudio only; no audio files. In real mode each popping coin lands with a clink,
so the clink rate follows the real accrual (2.4–6 a second, see the coin-unit rule above). Coin clinks are 2–4 inharmonic metal partials with a
soft 2 ms attack, random pitch and stereo position; as the pile grows they get richer (more
partials, longer ring) and more often settle as a pair ("clink-clink"). The pick makes a pitched
"tock" with a noise click, a breaking rock crumbles, veins sparkle and gems chime. Withdraw rings a
cash-register "cha-ching" with a coin cascade into the jar; a bet plays a rising drum roll, a win a
bright fanfare, a loss a whoosh and crackle. Clinks are rate-limited (22 ms apart), scheduled nodes
are capped at 64 and everything runs through a gentle compressor at low volume, so long sessions stay
pleasant. The **♪ on/off** button (`aria-pressed`) and **M** toggle sound; the setting is saved. The
AudioContext starts on the first user gesture.

## Motion and accessibility

Reduced motion follows the system preference and can be toggled in the pause menu: one coin per
strike instead of up to six, no sparks, shake, flash or lantern flicker, a static coin instead of the
spin, and a 0.3 s reveal. The odometer rolls with transforms only. Controls are real buttons of at
least 44 px, the combo exposes `role="meter"` and results are announced with `role="status"`.
Layouts are checked at 320 × 568, 390 × 844, 844 × 390, 960 × 640 and 1100 × 900 with no overflow.

## Saves

Compact JSON (v2, a few hundred bytes) written with `client.saveLocal`, the SDK's per-game, per-NFT
local preview storage, namespaced by collection and token (Genesis and Generations saves never mix).
It holds the real-mode ledger (baseline, bonus, streak, recorded withdrawals, burned, stakes and
winnings as decimal strings of base units, the bet stream), the practice mine if any (both RNG
streams, pot, streak, safe balance, rock, stats) and the sound setting. v1 practice-only saves still
load. The game saves on every withdraw, bet confirmation, claim detection and sound toggle, when
real mode starts, every 20 practice strikes and on pause. Every field is validated on load, including
both ledgers' identities; a malformed or foreign save is ignored with a notice. Real amounts are never
taken from a save: only the ledger's own bookkeeping is.

## Known limits

- Real accrual is shown from snapshots 20 s apart and interpolated with the measured rate; the shown
  value can lag or lead the chain slightly, never by more than 30 s of accrual past a snapshot.
- A claim is inferred from a lower snapshot (or a saved baseline above the current value, with a 1 %
  margin). Any drop is treated as a claim; the pot as last seen is recorded as withdrawn.
- A Friend whose rewards stop growing between two snapshots (rate 0) is treated as not accruing on
  the title; an already running real mine keeps its ledger and simply stops growing.
- On 844 × 390 and similar short landscape screens the side stats panel scrolls when a retry button
  is showing.
- The bet stream is seeded and deterministic, as the preview requires (the browser test predicts each
  result from the exposed `data-betseed`). Someone reading the page with developer tools can
  therefore foresee the next bet. That only matters because it is a simulation; a live version must
  take its randomness from the on-chain oracle, never from client state.
- Saves live in the browser. Validation rejects malformed and inconsistent saves, but a hand-made
  save that keeps every ledger identity is accepted. Nothing in the save has value.
- If reading the save fails (not a malformed save), the title shows **Try again** (もう一度よむ);
  starting a new mine instead replaces the unread save at the next autosave.
- Coin particles, flames and sounds use browser randomness for presentation only.

## Development and verification

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-mine
node node_modules/typescript/bin/tsc -p games/rare-mine/tsconfig.json
node scripts/dev-game.mjs check games/rare-mine
node --test games/rare-mine/engine-*.test.mjs
node games/rare-mine/balance-sim.mjs 40
MINE_SIZE='[[390,844]]' node games/rare-mine/rewards-browser.test.mjs
MINE_SIZE='[[390,844]]' node games/rare-mine/browser.test.mjs
MINE_SIZE='[390]' node games/rare-mine/genesis-browser.test.mjs
node scripts/dev-game.mjs build games/rare-mine --outdir release-mine
```

Engine modules (`rng`, `economy`, `game`, `feed`, `real`, `save`) are pure and deterministic;
`use-rewards.ts` (polling) and `use-real-mine.ts` (ledger glue) are thin hooks; `art`, `layout`,
`particles`, `render`, `sound`, `panels.tsx`, `real-panels.tsx`, `title.tsx`, `view.ts` and
`index.tsx` are presentation. `rewards-browser.test.mjs` runs real mode over `rewards-fixture.mjs`,
a test-only reward RPC fixture whose claimable RF grows with the clock; it checks the rate badge,
that the odometer rises between polls, withdraw and bet moving the baseline, the pot identity, the
labels, reload and the practice fallback. `browser.test.mjs` covers practice mode (a not-activated
Friend) and `genesis-browser.test.mjs` Genesis #597's real rewards. Every browser wait polls `data-*`
state; each bet is predicted from the exposed bet seed with the engine itself. The fixtures are never
shipped in the playable build. Set `MINE_CHROMIUM` to use
an installed Chromium and run one viewport per process with `MINE_SIZE`.

## Originality and credits

All art (the mine shaft, rock faces, coins, gem, pickaxe, cart, jar and lantern), all sound and all
text are original to this game and drawn or synthesised in code. The Friend sprite comes from the
canonical on-chain artwork through the SDK reader. SDK assets keep their LICENSE, NOTICE.md and asset
provenance. This is a developer-hosted preview, not an official Rare Friends production release.
