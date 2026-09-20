# Rare Friends: Our Little Island / 島ぐらし

A phone-first companion and island-building game. Your verified Generations NFT lives with you: choose food, take walks, make choices on outings, bring materials and postcards home, and build a small island together. This replaces the former 90-second delivery prototype after its holder playtest.

## Play loop

- Name your Friend. Each NFT has a stable favorite food; favorites earn more friendship.
- Feed, walk, talk, or sleep. Sleep advances the game one day and restores energy. No real-time wait or neglect penalty.
- Visit the shore, woods, or bakery plaza. Two choices per location give different materials and friendship; return home to bank them and keep a postcard.
- Build a flower garden, a bridge to the fourth destination, or a shared bench. Flowers grow after sleep and appear in the room; the bench improves walks.
- Eight collectible postcards, a bounded journal, friendship stages and contextual greetings retain memories of the actual selected Friend.

## Run and build

Node 22+: `npm ci`, `npm run build`, then `node scripts/dev-game.mjs dev games/lost-and-found` for development. For public home-screen packaging: `node scripts/build-island-life.mjs /path/to/NEW-empty-directory`. Use a new dedicated output directory each build (the PWA packager adds nonstandard files after the SDK build).

Requires a browser wallet holding a Generations NFT of generation >= 1 on Robinhood mainnet (4663). Genesis alone is not eligible. Ownership is freshly verified by the SDK; no signatures or real RF funding are needed. The opaque iframe sandbox remains intact.

## Persistence and mobile

Preview state is saved through a bounded host bridge to this browser's localStorage, scoped to the trusted game URL, verified NFT and canonical wallet. Local saves do not prove ownership. Switching identities closes the bridge. Failed saves visibly block further changes until retry. Corrupted saves are retained until the player explicitly starts a new life. This is local, editable preview data, not cloud storage or on-chain assets.

The public build includes a standalone web-app manifest, icons and a scope-limited, network-first shell cache. Add it through the browser's Home Screen / Install menu. Ownership still requires an online RPC and an injected wallet; an installed browser context without a compatible wallet cannot play. Use the wallet-enabled browser in that case. No WalletConnect, mobile wallet relay or cross-device synchronization is implemented. Browser/app storage partitions can differ; no automatic migration is promised.

## Economy

Core care, materials, construction and memory collection are free simulated progression. Optional gold room-frame styling integrates the SDK's `buy(1n)` with a 2 demo RF session cosmetic. It never modifies growth, friendship, materials or saves. The runtime simulated ledger resets on reload; the purchased unconsumed item represents that session's cosmetic entitlement. No play/settle/redeem actions, RF payouts, real spending, minting or creator fees. `game.json`'s positive one-wei reward is an unused SDK schema requirement, not a promised reward. Production inventory/cosmetics require a future integration reviewed with the Rare Friends team.

## Validation and assets

`node --test games/lost-and-found/life.test.mjs games/lost-and-found/pwa.test.mjs`
`node games/lost-and-found/life-browser.test.mjs`
`npx tsc -p games/lost-and-found/tsconfig.json`

Original room, scenery, app icon and stories. Canonical selected NFT sprites from FriendSDK. Existing delivery model/artwork remain reference files but are not the active experience. FriendSDK code: LICENSE. Artwork: NOTICE.md. No third-party game characters, logos or proprietary assets are used.
