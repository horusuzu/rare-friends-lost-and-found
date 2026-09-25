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
- Sound: the ♪ button or M turns sound effects on and off (see below).

No entry fee, purchases, RF rewards or redemption promises. Scores have no monetary
value. The required game.json chance-game schema is unused by this arcade mode;
no purchase, play or settlement action is called. The SDK host uses local preview
mode. Reduced-motion preference disables moving star effects.

## Phones

Checked with touch-phone emulation at 360×640, 375×667, 390×664, 430×740 and 664×390
(`mobile.test.mjs`). In portrait the field fills the width above one row of 56 px thumb keys
(◀ ▶, FIRE, shield); in landscape the field takes the full height in the middle, with ◀ ▶ under
the left thumb and shield and FIRE under the right. Keys respond to press-and-hold with several
fingers at once and let go on `pointercancel`/`touchcancel`. The canvas backing store follows the
screen density (integer 1–3×, pixelated), so the pixel art stays sharp. Taps never select text,
flash or open the long-press menu, and the page never scrolls or bounces. Hiding the page (app
switch, lock) pauses the run; the host bar below is one compact 48 px row.

## Sound

Short synthesised WebAudio cues (oscillators and filtered noise; no audio files): shot, enemy hit
and explosion, player hit, shield, wave clear, game over, sector clear and a new best. The engine
stays pure; `soundsFor(previous, next)` in `sound.ts` reads what changed between two frames.

- **♪ button** next to the language switch (accessible name 効果音 / Sound effects, `aria-pressed`
  shows the state), or **M** (not used by play controls).
- The setting is saved with the best score (`{"version":1,"best":…,"sound":…}`). Saves from before
  the setting load with sound on; an unreadable sound value keeps the best score and plays sound.
  The switch waits while the host menu is open, because the host refuses saves then.
- The AudioContext is created on the first tap or key press; nothing plays while paused (P, Escape,
  the pause button, the host menu or lost focus) or while the page is hidden. At most six cues play
  at once, so rapid fire never piles up; each tone has a soft attack and release.

## Development and verification

From the repository root with dependencies installed:

```sh
node scripts/dev-game.mjs dev games/rare-invaders
node node_modules/typescript/bin/tsc -p games/rare-invaders/tsconfig.json
node scripts/dev-game.mjs check games/rare-invaders
node --test games/rare-invaders/engine.test.mjs games/rare-invaders/sound.test.mjs
node games/rare-invaders/browser.test.mjs
node games/rare-invaders/mobile.test.mjs   # phone sizes with touch emulation
node scripts/dev-game.mjs build games/rare-invaders --outdir release-invaders
```

Browser tests use SDK-only wallet fixtures, never shipped with the playable build.
Optionally set INVADERS_CHROMIUM to an installed Chromium/Chrome executable.
They exercise launch, firing and score changes, shield cooldown, pause/resume,
wallet overlay pause preservation, the ♪ toggle (click, M, saved across a reload, 44px and clear of
the header controls) and narrow-screen overflow at 390px and 1100px. Set INVADERS_SIZE (for example
`[[320,568]]`) to run one viewport per process.

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
