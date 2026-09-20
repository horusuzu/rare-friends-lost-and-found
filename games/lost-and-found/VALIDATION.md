# Island-life validation — September 21, 2026

This record covers the replacement of the 90-second delivery prototype with persistent companion/island gameplay.

## Verified

- SDK build and game TypeScript check passed.
- 11 life-model tests passed; model-only coverage: 100% lines/functions, 97.30% branches, all three 80% thresholds enforced.
- 24 save bridge, frame bridge, ownership discovery, RPC batching/backoff and PWA metadata tests passed.
- Browser journeys passed at 390×844 and 1100×900: feed, beach choice, bring gifts home, postcard image, garden construction, sleep, harvest, rename, reload/reconnect, restore day/name/progress, no horizontal overflow.
- Optional cosmetic journey passed at both sizes: cancel purchase, confirm through SDK, show cosmetic, reload retains care while clearing the session cosmetic.
- Screenshots inspected at both sizes. Phone navigation sits above the trusted wallet toolbar.
- Browser fixtures use Friend #7730, never a claimed builder NFT. Test helper checks opaque sandbox, fresh ownership reads and absence of signing methods.
- Public-build smoke test: standalone manifest, decoded 512px icon and service-worker registration passed; no-wallet state has no playable iframe.
- Bounded preview saves distinguish games/NFTs/canonical wallets, reject malformed/oversized requests and report unavailable/quota errors. Stale bridge sessions cannot save. Local saves do not grant ownership.

The tested release was built from an isolated checkout of committed SDK sources plus this game's changes, preserving the previously verified RPC batching fix. Unrelated uncommitted reversions in the main working directory were not published or removed.

## Independent review

One child implemented and tested the save boundary while the parent built the game, then reviewed the game and packaging. Review caught three issues: accessible button names, disabled controls in focus trapping, and lock state after client replacement. All were fixed. PWA caches are scope-specific. The extra review had concrete correctness benefits; no token savings were measured.

Published GitHub Pages revision: `3e6698a`. Deployment succeeded; remote runtime.js, game.js, manifest and service worker match the tested release hashes.

## Limits

The previous delivery version was successfully played by the holder, who asked for more attachment and persistent life. This new version still awaits their playtest and is not yet filed as a contest entry.

Phone tests are Chromium viewport tests, not a physical iPhone wallet/home-screen installation. PWA metadata does not supply an injected mobile wallet. Online ownership verification remains required; no cloud synchronization, native store package or wallet relay is implemented. Browser data deletion removes local progress. Core game materials/results are simulated. No live RF transaction, payout, mint or production Rare Friends deployment occurred.

## Real reward piggy-bank revision

- Canonical API/ABIs checked against official config and contracts documentation. Same-block live read verifies the selected Friend and same-owner Genesis #597, its active weight, claimable RF/WETH and canonical wallet balances. Exact personal balances are intentionally not recorded in public source.
- 22 reward-reader, frame-bridge and local-save tests pass; reader coverage 100% lines/functions, 95.65% branches (80% enforced). Separate amount tests keep bigint precision and show nonzero dust as a lower-than-display-precision value.
- SDK/game typechecks and schema check pass. Read-only protocol research independently confirmed Genesis ABI differs by having no generation() call; code does not call it on Genesis. Independent code review found a configurable-token-label hardcode, corrected to the actual verified tokenId.
- No claims, signatures, activation changes, transfers or funds used.
- Reward browser journeys pass at 390×844 and 1100×900: separate Genesis/Generations amounts, refresh increase feedback, stale-value indication on RPC error, inactive positions, and trusted official-portfolio link. These screenshots use mocked amounts, not the holder's actual balances.
- Existing life/cosmetic/save/reload browser journeys also pass at both sizes after adding the piggy bank.
