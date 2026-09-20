# Validation — September 21, 2026

## Game

- Build and SDK game-boundary/schema validation: PASS.
- Strict TypeScript check for the new game: PASS.
- Delivery model: 9 tests PASS. Lines 98.51%, branches 98.25%, functions 100%. Line/function thresholds enforced at 80%. This is **model-only coverage**, not whole-UI coverage.
- Automated browser journeys: PASS at 1100 × 900 and 390 × 844 browser viewports, with the actual SDK sandbox/runtime and its read-only mocked wallet/RPC. Selected fixture Friend #7730 is not the builder's claimed NFT.
- Browser journeys cover starting a delivery, navigating connected stops, wrong-address feedback, successful delivery, a decoded 1200 × 800 PNG postcard, dialog isolation, returning home, purchase cancellation without charge, one confirmed 2 demo RF cosmetic purchase, preventing a second cosmetic purchase, settings pause, time expiration, English/Japanese switching and horizontal bounds.
- No wallet signatures or funds were used. The test helper rejects unexpected network requests and signing methods.

## Upstream SDK

- Full Node 22 suite: 114 PASS, 0 FAIL, 2 SKIP (optional local-contract/Anvil setup absent).
- An initial Node 26 run had one watch-output test failure (empty asset response during rebuild). The runner suite and then the full suite passed on the documented Node 22 runtime. No upstream runtime code was modified to hide the failure.
- The newly downloaded Chromium 153 headless shell stalled at launch on this Mac. Browser journeys passed using existing Chrome for Testing 149 via the test-only `LOST_FOUND_CHROMIUM` executable override. The game bundle has no dependency on that path.

## Independent review

One narrowly scoped code reviewer examined wallet boundaries, stale asynchronous actions, duplicate-purchase protection, paused state and terminal routes while the main agent ran visual/browser checks. It found a keyboard-accessible Settings/postcard overlap that could strand the return action. Background controls are now inert during dialogs, focus stays in the dialog, and Escape closes it. The browser test checks the inert background and keyboard containment. No ownership bypass or signer access was found.

This review had a concrete benefit: one modal-state bug caught and fixed. Token-cost savings were not measured or claimed.

## Still unverified / deliberately absent

- Real connected-wallet play with the builder's hardwired Generations NFT is pending. Genesis #597 alone is insufficient under the SDK rules.
- Real no-wallet build blocks access at the SDK connection gate; this is distinct from a successful wallet playtest.
- Public hosting, official submission, actual user retention and real RF consumption are not yet completed or measured.
- Mobile testing is Chromium at phone dimensions, not a physical iPhone/Safari wallet session.
- Cards can be saved through the browser image menu or screenshot. The sandbox has no automatic download/social-sharing bridge. Device-specific image saving still needs a real-device check.
- No live contracts, RF burn, automatic social posting, other players' messages, on-chain rewards, persistent progress, or production deployment.

See PROJECT.md for commands. Screenshots in `artifacts/` are clearly documented automated-test evidence.
