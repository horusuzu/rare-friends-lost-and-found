# Rare Friends: Lost & Found

**Every Friend has something worth bringing home.**

Submission draft — not yet submitted. Replace the pending preview/source links after the builder's review and hosting.

- **Builder:** Genesis #597 holder / GitHub @horusuzu
- **Category:** Character Spotlight (primary); Economy Potential (secondary relevance)
- **Stack:** FriendSDK v0.1.2, React 19, TypeScript, original SVG map, Canvas postcard renderer.
- **Public playable preview:** Pending hosting.
- **Source:** Pending public repository. Local project: `rare-friends-lost-and-found`, game directory `games/lost-and-found`.

## What did you build?

A 90-second delivery adventure in which your own verified Generations NFT returns a lost object to its owner and makes a personalised postcard of the journey. Three short stories unfold around a music box, old seeds and a red scarf. Genesis #597, owned by the builder, is the fictional founder of the post office.

As a Genesis holder, I wanted Friends to have memories with their owners. This project makes the NFT the person doing something kind: carrying the parcel, choosing the route, reaching the destination and appearing on the keepsake. The town and its stories are original fiction, not official Rare Friends lore.

## Try it

1. Connect a browser wallet on Robinhood mainnet (4663), holding a hardwired Generations NFT, generation 1 or higher. Select your Friend using the SDK. Genesis alone does not satisfy this requirement.
2. Choose one of three parcels and read the owner's clue. Press **Take this delivery**.
3. Tap connected map stops or choose the route buttons. Keyboard: Tab and Enter. Press **Deliver here** at the address you infer from the clue.
4. On success, make a postcard. Long-press/right-click the PNG or take a screenshot. Sharing is manual; no NFT is minted.

All purchases are simulated. Connecting reads ownership; this preview needs no RF funding, private key, or transaction signature.

## Controls and rules

90 active seconds per delivery. Every connected-street move costs an additional 2.5 seconds. Wrong addresses cost 8 seconds. The optional wind shortcut from the square to the lighthouse succeeds when the marker is between 35% and 65%; a miss costs 6 seconds. It never wagers RF. Settings, SDK menus and hidden tabs pause the clock. Basic streets remain available as the alternative to the timing challenge.

Ratings: two or more wrong addresses = 1 star; one wrong address or fewer than 30 seconds remaining = 2 stars; otherwise 3 stars. Stars have no financial value. Timing and stars do not depend on purchases.

## Exact economy

All deliveries and standard postcards are free. A **2 simulated RF** purchase unlocks the gold-foil postcard stamp for the runtime session. This uses `client.buy(1n)` through the official confirmation UI; one retained inventory item represents the cosmetic unlock. The game prevents repeat purchases while unlocked. It exposes no play, settlement or redemption action.

The one-wei positive reward in `game.json` is an unused SDK schema placeholder, not a game prize or promised payout. There is no live RF spending or burn, no creator fee, and no claim that a simulated purchase counts as real Token Activity. Purchases, progress and collected-delivery indicators reset with the preview session.

Future RF integration would offer clearly priced cosmetic themes and community-authored special deliveries. Contract allocation, burns and any creator economics would require a later reviewed integration. They are not implemented or presented as current protocol behaviour.

## Checks and limitations

See `games/lost-and-found/VALIDATION.md` for exact results. Automated browser checks use the SDK's read-only fixture Friend #7730 at desktop and phone sizes. No mock identity is shipped. Actual connected-wallet play is pending the builder's eligible Generations NFT confirmation; screenshots do not prove this check has happened.

The first version is single-player. Recipients are fictional town characters associated with houses, not other wallets or claimed player NFTs. There are no shared rooms, live messages, automatic social posting, cloud saves or return-visit analytics. Saved postcards are PNG keepsakes, not transferable NFT assets. Browser image saving varies by device; screenshot capture is the fallback.

## Credits

FriendSDK code: upstream Apache-2.0; artwork terms: upstream `NOTICE.md`. Genesis #597 image: official Genesis contract `0x116EaA62241751E0c98dA43d458600c6C17cD361`, `tokenURI(597)`, fetched September 21, 2026. Playable sprites: canonical SDK reader for the selected NFT. Town illustrations, writing, game logic and postcard layouts: this project. Sounds: SDK procedural sound kit. Built with Codex.
