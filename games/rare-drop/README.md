# Rare Drop

A merge-drop puzzle starring your verified Rare Friends Generations NFT.
Drop orbs into the jar; two of a kind merge into the next size. The eleventh
and largest orb is your own Friend, drawn from its canonical on-chain pixels.
Built with FriendSDK 0.1.2, React and a deterministic Canvas physics engine.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+),
or the configured Genesis #597. The host checks current collection-specific
ownership on Robinhood Chain (4663). Wallet connection and read-only checks
require no transaction or signature. Choose Japanese or English, then start.

- Aim: move the pointer or drag on the jar; arrow keys or A / D; hold the ◀ ▶ buttons.
- Drop: tap / click the jar, Space / Enter / ↓, or the DROP button. A short cooldown follows each drop.
- Merge: two orbs of the same tier merge into the next tier. Two Friend orbs merge and vanish for a bonus.
- Tiers: Drop → Seed → Sprout → Clover → Shell → Moon → Planet → Ringed → Sun → Galaxy → **Your Friend**.
  Only the first five tiers are dropped; the rest are earned by merging.
- Score: creating tier *n* earns the *n*-th triangular number (1, 3, 6 … 66); two Friends vanishing earn 132.
- Game over: an orb resting above the dashed line for two seconds fills the jar.
  Newly dropped orbs have a 1.2-second grace period.
- Pause: P, Escape or the pause button. Losing focus pauses play.
- Best score and best tier are stored locally per SDK session identity. Storage failures do not block play.

No entry fee, purchases, RF rewards or redemption promises. Scores have no monetary
value. The required game.json chance-game schema is unused by this arcade mode;
no purchase, play or settlement action is called. The SDK host uses local preview
mode. There is no audio. Reduced-motion preference disables merge ring effects and
the blinking warning line.

## X score sharing

On the result screen choose **Share score on X**. A native dialog in the trusted
host previews the score, the largest tier reached, the selected NFT and the game
URL; a user-clicked link opens X. Review and publish on X yourself. The game can
only send a bounded score, tier (1–11) and language; the host fixes the title and
URL per game. No automatic post, wallet address or transaction is involved.

## Development and verification

From the repository root with dependencies installed:

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-drop
node node_modules/typescript/bin/tsc -p games/rare-drop/tsconfig.json
node scripts/dev-game.mjs check games/rare-drop
node --test --experimental-test-coverage games/rare-drop/engine.test.mjs
node games/rare-drop/browser.test.mjs
node scripts/dev-game.mjs build games/rare-drop --outdir release-drop
```

Browser tests use SDK-only wallet fixtures, never shipped with the playable build.
Optionally set DROP_CHROMIUM to an installed Chromium/Chrome executable.

## Assets and scope

The Friend orb and dropper use the canonical sprite read through the SDK Friend
reader. Orb motifs, jar and interface are drawn by this component. The merge-drop
genre is a common puzzle format; no third-party game logo, music or extracted
assets are included. SDK assets retain their LICENSE, NOTICE.md and asset
provenance. This is a standalone developer-hosted preview, not an official Rare
Friends production release.
