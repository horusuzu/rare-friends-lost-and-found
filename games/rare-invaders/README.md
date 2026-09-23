# Rare Invaders

A five-wave arcade shooter starring your verified Rare Friends Generations NFT.
Built with FriendSDK 0.1.2, React and a deterministic Canvas game engine.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+).
Or choose Genesis #597. The host checks current collection-specific ownership
on Robinhood Chain (4663), including activated Genesis. Wallet connection and read-only checks require no
transaction or signature. Choose Japanese or English, then launch.

- Move: arrow keys or A / D; touch players hold the left/right buttons.
- Fire: hold Space or the FIRE button.
- Shield: Shift or the diamond button; lasts two seconds with an eight-second cooldown.
- Pause: P, Escape or the pause button. Losing focus pauses play.
- Clear five waves with three lives. An enemy reaching your line ends the run.
- Best score is stored locally per SDK session identity. Storage failures do not block play.

No entry fee, purchases, RF rewards or redemption promises. Scores have no monetary
value. The required game.json chance-game schema is unused by this arcade mode;
no purchase, play or settlement action is called. The SDK host uses local preview
mode. There is no audio. Reduced-motion preference disables moving star effects.

## Development and verification

From the repository root with dependencies installed:

```sh
node scripts/dev-game.mjs dev games/rare-invaders
node node_modules/typescript/bin/tsc -p games/rare-invaders/tsconfig.json
node scripts/dev-game.mjs check games/rare-invaders
node --test games/rare-invaders/engine.test.mjs
node games/rare-invaders/browser.test.mjs
node scripts/dev-game.mjs build games/rare-invaders --outdir release-invaders
```

Browser tests use SDK-only wallet fixtures, never shipped with the playable build.
Optionally set INVADERS_CHROMIUM to an installed Chromium/Chrome executable.
They exercise launch, firing and score changes, shield cooldown, pause/resume,
wallet overlay pause preservation and narrow-screen overflow at 390px and 1100px.

## Assets and scope

The player's canonical sprite is read through the SDK Friend reader. Enemy motifs,
star field and interface are drawn in this component. SDK assets retain their
LICENSE, NOTICE.md and asset provenance. This is a standalone developer-hosted
preview, not an official Rare Friends production release. Existing island gameplay
and its submission are independent of this shooter.
