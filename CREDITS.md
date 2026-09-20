# Rare Friends: Lost & Found

A 90-second delivery adventure. Your verified Generations NFT brings a lost object home, then makes a keepsake postcard. Genesis #597 is the fictional post-office founder, using its authentic on-chain portrait with the holder's permission.

Work in progress. Purchases are simulated. Public builds keep the FriendSDK ownership gate.

## Run

Node 22+: `npm ci`, `npm run build`, then `node scripts/dev-game.mjs dev games/lost-and-found` from the repository root. Requires a browser wallet holding a hardwired Generations NFT (generation >= 1) on Robinhood mainnet (4663). Genesis alone is not an eligible playable Friend. No signatures or RF funding are required.

## Economy

All three deliveries are free. A 2 demo RF SDK `buy(1n)` unlocks the gold-foil postcard style for the current runtime session. One purchase only, no gameplay advantage. The unconsumed SDK inventory item represents this session unlock. No `play`, `settle`, or `redeem` actions are exposed. The positive one-wei prize in game.json is an unused schema requirement, not a promised reward. No live spending, burn, financial yield, NFT minting, persistent storage, or creator fees are implemented. Reloading resets progress and the preview ledger.

## Rules

90 real active seconds per delivery. Moving along a connected street costs an additional 2.5 seconds. Wrong-address attempts cost 8 seconds. The optional plaza shortcut reaches the lighthouse on a timing hit (35–65% of the meter); misses cost 6 seconds. Time stops when the SDK pauses, settings open, or the tab is hidden. Two or more wrong addresses award one star; less than 30 seconds left or one wrong address awards two; otherwise three. Stars have no monetary value.

## Assets

Original town SVG, UI and story by this project. Selected playable NFT artwork is read with the SDK's canonical sprite reader, not a test substitute. Genesis #597 SVG fetched on 2026-09-21 using `tokenURI(597)` from official Genesis contract `0x116EaA62241751E0c98dA43d458600c6C17cD361` on Robinhood mainnet. See upstream NOTICE.md for artwork terms and LICENSE for FriendSDK code. Audio uses the SDK's procedural sound kit.
