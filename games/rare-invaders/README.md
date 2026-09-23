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

## Mobile layout and X score sharing

Portrait, compact landscape and the 960 × 640 reference size keep game controls
separate from the wallet toolbar. Touch controls support held fire and movement;
safe-area padding and dynamic viewport height accommodate phone browser chrome.

On the result screen choose **Share score on X**. A native dialog in the trusted
host previews the score, selected NFT and game URL; a user-clicked link opens X.
Review and publish on X yourself. No automatic post, wallet address or transaction
is involved. Scores are local/self-reported, with no anti-cheat or online ranking.

This fork adds a bounded `shareScore(score, wave, status, language)` bridge method.
Only the Rare Invaders preview host enables it. The host sets the NFT identity and
fixed public game URL; the sandbox cannot supply destinations. The original
`allow-scripts` iframe restriction remains in force. The dialog pauses the game,
and a bridge reset clears the dialog. These are fork extensions, not upstream
SDK v0.1.2 capabilities.

Additional checks:

```sh
node --test tests/frame-bridge.test.mjs tests/score-share.test.mjs
node games/rare-invaders/mobile-share.test.mjs
node games/rare-invaders/genesis-browser.test.mjs
```

Mobile browser checks emulate 320×568, 390×844, 844×390 and 960×640. They verify
controls remain on-screen, held fire increases score, a full run ends, the X draft
matches that score, an intercepted composer opens, and replay works. No test
publishes to X. Physical iOS/Android hardware testing is not claimed. Use an
injected-wallet browser (on mobile, typically your wallet's in-app browser).
