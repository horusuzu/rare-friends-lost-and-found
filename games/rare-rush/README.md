# Rare Rush

A one-button thrill-coaster run starring your verified Rare Friends Generations NFT.
Launch from zero to 200 km/h, dive down steel drops under Mt. Fuji, fly off the
crests and scream your way to the next checkpoint. The view is first-person from the
second row, VR-style: the nose tips over each crest and the rail falls away. Your Friend
rides the front seat, drawn from its canonical on-chain pixels, arms up when screaming. Built with FriendSDK 0.1.2, React and a
deterministic Canvas coaster engine.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+),
or the configured Genesis #597. The host checks current collection-specific
ownership on Robinhood Chain (4663). Wallet connection and read-only checks
require no transaction or signature. Choose Japanese or English, then board.

- **One control:** hold Space / ↓ / Enter, the HOLD button, or anywhere on the ride.
- **Launch:** hold to build air pressure; it peaks after 1.2 s, then falls. Release at the
  peak for a perfect launch (about 216 km/h); an early or late release launches slower.
- **Dive:** holding makes the car heavier. Hold on downhills to gain speed; let go on the way
  up to keep it. Release over a crest at speed to fly.
- **Landing:** land along the slope for +12 % speed and 100 points; a steep landing costs
  45 % of your speed. Slow cars are pulled up hills by a chain lift, so the ride never stops.
- **Track:** endless smooth hills that grow taller; every fourteenth crest is the 79 m giant.
  Sparks arc over crests (10 points), boost gates in every sixth valley add 50 km/h.
- **Turbo:** glowing turbo capsules float past every fourth crest; stock up to three (you start
  with one). Fire with the TURBO button, Shift, ↑ or T: +72 km/h at once, then 1.6 s of push
  with the top speed raised from 360 to 432 km/h, easing back afterwards.
- **Time:** 45 seconds, +15 seconds at every 1,000 m checkpoint. The ride ends at zero.
- **Scream meter:** fills with speed over 162 km/h, steep falls and perfect landings. Full
  meter = six seconds of Scream Mode: double points and extra push.
- Score: 1 point per metre plus bonuses. Pause with P, Escape or the pause button; losing focus pauses.
- Best score, distance and top speed are stored locally per SDK session identity.

No entry fee, purchases, RF rewards or redemption promises. Scores have no monetary
value. The required game.json chance-game schema is unused; no purchase, play or
settlement action is called. The SDK host uses local preview mode.

Sound is a synthesised wind rush that follows your speed (no audio files), with a
mute button. Reduced-motion preference removes screen shake, banking, rumble, speed
streaks, the turbo flash and spinning sparks.

## X score sharing

On the result screen choose **Share score on X**. The trusted host previews the score,
top speed (km/h), the selected NFT and the fixed game URL; a user-clicked link opens X.
Review and publish on X yourself. The game only sends score, top speed (1–450) and language.

## Development and verification

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-rush
node node_modules/typescript/bin/tsc -p games/rare-rush/tsconfig.json
node scripts/dev-game.mjs check games/rare-rush
node --test --experimental-test-coverage games/rare-rush/engine.test.mjs
node games/rare-rush/browser.test.mjs
node scripts/dev-game.mjs build games/rare-rush --outdir release-rush
```

Browser tests use SDK-only wallet fixtures, never shipped with the playable build.
Optionally set RUSH_CHROMIUM to an installed Chromium/Chrome executable.

## Assets and scope

The Friend in the car uses the canonical sprite read through the SDK Friend reader.
The sky, mountain, rail, car, sparks and interface are drawn by this component's code.
The ride is inspired by launch coasters and big-drop coasters in general; it uses no
third-party park, ride or game names, logos, music or extracted assets. SDK assets keep
their LICENSE, NOTICE.md and asset provenance. This is a standalone developer-hosted
preview, not an official Rare Friends production release.
