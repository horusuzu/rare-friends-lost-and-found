# Rare Friends: Our Little Island

**A Friend to come home to. An island you grow together.**

Draft — not yet filed. The first delivery prototype passed a holder playtest technically, but failed its emotional goal. This revision replaces it with ongoing care and island life; a second holder playtest is pending.

- Builder: Genesis #597 holder / GitHub @horusuzu
- Focus: Character Spotlight
- Stack: FriendSDK v0.1.2, React, TypeScript, original SVG and Canvas art, installable web-app metadata.
- Public preview: https://horusuzu.github.io/rare-friends-lost-and-found/
- Source: https://github.com/horusuzu/rare-friends-lost-and-found (`games/lost-and-found`)

## The experience

Your own verified Generations NFT becomes a companion. Give it a name, discover its favorite food, go for walks, and choose how to spend time at the beach, forest, bakery plaza or lighthouse. Each outing offers two choices with different materials and friendship gains. Bring home a personal postcard, grow flowers, build a shared bench, and construct a bridge to reach the lighthouse.

The room changes as you live together. The Friend remembers previous outings in its greeting; its journal and eight collectible postcards record your choices. Sleeping advances the game to the next morning and grows the garden. No countdown or neglect penalty demands attention. Stories and scenery are original fiction, not official Rare Friends lore.

## Try it

Connect a compatible browser wallet holding a Generations NFT (generation >=1) on Robinhood mainnet, chain 4663. Select your Friend in the SDK. Genesis alone is insufficient. No signatures or funds are needed.

The interface is Japanese-first: おうち = Home, おでかけ = Outings, 島づくり = Build, 思い出 = Memories. On Home, choose ごはん to feed or おやすみ to advance a day. Visit the shore, pick a choice, and return home with materials. Build 小さな花畑 (garden), sleep, and pick the flowers; build 灯台への橋 (bridge) to unlock the fourth destination. Settings lets you rename the Friend.

## Real reward piggy bank

The room connects the companion experience to actual on-chain rewards: claimable RF/WETH and canonical NFT-wallet holdings appear separately, with timestamps and errors instead of invented zeroes. A linked Genesis #597 is displayed only for its verified owner. Claims and activation remain on the official portfolio; care does not increase yield. No earnings forecasts or real-money transactions are part of the game.

## Persistence and mobile

Bounded local saves cross the opaque iframe through an explicit preview-only SDK bridge. The trusted host chooses a game/NFT/canonical-wallet namespace; child code cannot select another key. Fresh ownership verification remains mandatory at each session. Saves never grant ownership or real assets. Storage errors remain visible and retryable.

Add the public page to the home screen through a supported browser. The shell cache excludes external RPC, POST requests and wallet data. This is not a native-store release or a guarantee of offline play: an injected wallet and online ownership reads remain required. Installed contexts without a wallet must use the wallet-enabled browser. Local data does not automatically transfer between browsers or devices.

## Economy and limits

Care, materials, building and postcards are free simulated progression. The optional gold room frame costs 2 demo RF through SDK `buy(1n)`, grants no progression advantage, and lasts only for the runtime session. Repeat cosmetic purchases are disabled once owned. Reload resets the simulated RF ledger and cosmetic, while local care saves remain. The unused one-wei reward in game.json is a schema placeholder, not a payout. No play/settle/redeem actions, real spending, financial return, minting or creator fees.

Production cosmetics/inventory would need a separately reviewed RF integration. There is no cloud sync, multiplayer, automatic posting, mobile wallet relay, measured retention or claim of real token activity.

## Run, checks and credits

See `games/lost-and-found/README.md` for build instructions and `VALIDATION.md` for evidence and limitations. Automated tests use SDK fixture #7730; no mock wallet or identity bypass is shipped. FriendSDK is Apache-2.0; canonical artwork follows NOTICE.md. Room, island scenery, stories and app icon are original. Built with Codex.
