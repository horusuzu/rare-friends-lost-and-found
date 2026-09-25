# Rare Mine

An original idle-and-tap mining game starring your verified Rare Friends NFT. Your Friend swings a
pickaxe at the rock face of a lantern-lit mine shaft. Every strike throws sparks and chips and pops
coins that arc into a mine cart, where they clink onto a growing pile. When the pile looks good you
choose: **Withdraw** it to your safe jar, or **Bet** the whole pot on a 45 % chance to double it.
Lose, and the whole stake is **burned**.

Rare Mine targets the Vibeathon **Token Activity** category (most RF burned or spent). **Everything
here is a simulated preview: the coins are "RF (preview)", not real RF**, and no wallet transaction
is ever made. Built with FriendSDK 0.1.2, React, a deterministic TypeScript engine and a 256 × 160
pixel canvas.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+), or the
configured Genesis #597. The host checks current collection-specific ownership on Robinhood Chain
(4663); wallet connection and read-only checks need no transaction or signature. Press **Start
mining** (採掘をはじめる), or **Continue** (つづきから) to reopen your saved mine. Japanese is the
default; switch to English at any time.

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Extra strike (builds the combo) | tap the mine | Space or Enter |
| Withdraw the pot | 引き出す / Withdraw | W |
| Open the bet (odds first) | 倍かけ / Double or burn | B |
| Confirm / cancel the bet | かける / やめる | Y / N (or Esc) |
| Reveal a rolling bet at once | tap the spinning coin | Space, Enter or a tap |
| Sound on/off | ♪ | M |
| Pause | Ⅱ | P or Esc |

The game pauses when the page loses focus and whenever the runtime's `paused` prop is set; paused,
nothing is mined and no input is taken.

## Mining

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

## Withdraw or bet

The two equal buttons are always on screen once the mine opens. **Withdraw is never hidden**: it
stays available beside the odds and is only disabled while a staked pot is rolling.

- **Withdraw (引き出す)**: the whole pot moves to your safe balance with a coin rain into the jar.
  It is safe forever and ends any streak.
- **Bet (倍かけ)**: stakes the whole current pot. The odds are shown **before** anything is staked:
  「勝率45%・勝てば2倍・負ければ全額バーン」 (45 % to win · win ×2 · lose = the whole stake burns),
  with the exact stake, win and burn amounts. Confirm, then a coin spins with a rising drum roll for
  1.6 s (0.3 s with reduced motion; tap to reveal at once).
  - **Win**: the pot doubles and stays at risk. Bet again for a double-up streak (×2, ×4, ×8 …) or
    withdraw. The streak is capped at 20 wins, after which only Withdraw is offered.
  - **Lose**: the whole stake burns with flames and "🔥 N burned"; the burned total grows.

### Odds and expected value

- P(win) = 0.45, payout ×2, so **EV = 0.45 × 2 = 0.9 × stake**: on average **10 % of every bet
  burns**. Measured over 100 000 bet draws: 44.9 %.
- A streak of *k* wins turns a pot *P* into `P × 2^k` with probability `0.45^k`; its expected value
  is `P × 0.9^k`. A ×16 streak (4 wins) happens 4.1 % of the time.
- Mining pauses while the odds are on screen and during the suspense, so the stake is exactly the
  pot you saw.

The outcome is drawn from a separate seeded bet stream **when you confirm**, and the game is saved
already settled. The suspense only delays the reveal; reloading cannot undo a burn.

## Stats

Safe balance, total mined, total withdrawn, **total burned**, best streak and bets won / lost. The
engine keeps two identities that are checked in tests and on every save load:
`mined + winnings = withdrawn + burned + pot` and `staked = winnings + burned`.

After your first bet, **Share on X** posts through the trusted host share bridge (the same one
Rare Invaders, Rare Drop and Rare Rush use): your burned total and best streak, e.g. 「🔥1200 RF（プレビュー）
をバーン！ 最高×16（4連勝）」. The host fixes the title and URL; game code cannot supply either.

## Simulated economy and the live integration gap

**RF (preview) is a simulated currency. It is not RF, has no monetary value and cannot be
redeemed.** It is labelled on the title screen, on the mine itself, in the stats panel and in the
footer ("シミュレーション・本物のRFではありません"). The bet never calls the SDK's buy, play,
settle or redeem actions: it is resolved by a seeded local RNG. The required `game.json`
chance-game block is an unused placeholder (one outcome, no payout), like Rare Delve's.

A live version would need a Rare Friends contract that the SDK v0.1.2 chance-game API does not
provide:

- a **variable stake** (the whole pot, not a fixed consumable price) paid in RF from the canonical
  NFT wallet with an exact approval;
- a verifiable 45 % win chance from the oracle RNG, with the result settled on-chain before any
  reveal (the local design already fixes the outcome at confirmation and only animates it);
- a **2× payout funded from a reserved bankroll**, so every open bet's maximum prize is backed
  before it is accepted;
- a **burn** of lost stakes (transfer to a burn address or `burn()`), which is what the Token
  Activity category measures;
- mining itself would have to stay off-chain and unbacked, or be replaced by an RF deposit, since
  free mined coins cannot become real RF.

## Sound

Synthesised with WebAudio only; no audio files. Coin clinks are 2–4 inharmonic metal partials with a
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

Compact JSON (about 150 bytes) written with `client.saveLocal`, the SDK's per-game, per-NFT local
preview storage, namespaced by collection and token (Genesis and Generations saves never mix). It
holds both RNG streams, the pot, streak, safe balance, rock, all stats and the sound setting. The
game saves every 20 strikes, on every withdraw, bet confirmation and sound toggle, and on pause.
Every field is validated on load, including the ledger identities and the rock/strike counts; a
malformed or foreign save is ignored with a notice.

## Known limits

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
MINE_SIZE='[[390,844]]' node games/rare-mine/browser.test.mjs
MINE_SIZE='[390]' node games/rare-mine/genesis-browser.test.mjs
node scripts/dev-game.mjs build games/rare-mine --outdir release-mine
```

Engine modules (`rng`, `economy`, `game`, `save`) are pure and deterministic; `art`, `layout`,
`particles`, `render`, `sound`, `panels.tsx` and `index.tsx` are presentation. The browser test
predicts each bet from the exposed bet seed with the engine itself and checks the UI agrees; it uses
the SDK's wallet fixtures, which are never shipped in the playable build. Set `MINE_CHROMIUM` to use
an installed Chromium and run one viewport per process with `MINE_SIZE`.

## Originality and credits

All art (the mine shaft, rock faces, coins, gem, pickaxe, cart, jar and lantern), all sound and all
text are original to this game and drawn or synthesised in code. The Friend sprite comes from the
canonical on-chain artwork through the SDK reader. SDK assets keep their LICENSE, NOTICE.md and asset
provenance. This is a developer-hosted preview, not an official Rare Friends production release.
