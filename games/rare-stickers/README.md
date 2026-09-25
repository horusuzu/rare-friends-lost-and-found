# Rare Cards / レアトレカ

A trading-card game for your verified Rare Friends NFT. Open packs that turn your own Friend
into cards in eight finishes, keep them in a nine-pocket binder, trade card designs with other
holders, and battle them with five-card decks — each player burning an RF ticket to enter.
Built with FriendSDK 0.1.2, React and Canvas.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+), or the
configured Genesis #597. The host checks current collection-specific ownership on Robinhood
Chain (4663). Japanese and English.

- **Cards:** every card is a sticker of a Friend in one of eight finishes — Matte, Patch
  (embroidered), Puffy (raised), Clear, Glitter, Holo, Prism (burst backdrop with diamond rainbow
  foil) and Gold Foil. Rarer finishes are stronger. Each card shows its element (Sun, Moon or Star),
  HP, attack and defence, all derived from the card itself.
- **Free packs:** three a day (stock up to nine), one card of your own Friend each.
  Odds: Matte 30 %, Patch 18 %, Puffy 14 %, Clear 12 %, Glitter 11 %, Holo 7 %, Prism 5 %, Gold 3 %.
- **Binder:** nine pockets per page; tap (or Enter) to view a card large — shiny finishes glint as
  the pointer moves; Escape closes it.
- **Trade:** a card's trade code (`RF-XXXX-…`) passes its design to a friend, who pastes it in the
  Trade tab. Your own Friend comes only from packs; other Friends only from trades; a book never
  holds the same card twice.
- **Battle (asynchronous PvP by codes):** pick five cards in order. Issue a challenge — you burn
  one RF ticket and get a battle code (`RFB-…`) to send. Your friend pastes it, picks a deck, burns
  one ticket, and watches the battle; they get a reply code to send back, and pasting it shows you
  the same battle. Each round, cards trade blows (attack × element bonus − defence, a small random
  spread and 10 % criticals) until one falls; best of five wins. Sun beats Moon, Moon beats Star,
  Star beats Sun. Results are deterministic from both decks and the challenge nonce, so both sides
  see identical battles. A challenge can be answered once and a reply counted once.

## Sound

Short synthesised WebAudio cues (oscillators and filtered noise; no audio files): pack tear, card
flip and reveal by rarity (common, rare, and a bigger shimmer for holo/prism and gold foil), pocket
insert, page turn, trade-code copy and accept, battle hits by element (Sun, Moon, Star), criticals,
round win/lose, match win/lose/draw and the RF ticket burn.

- **♪ button** in the header (accessible name 効果音 / Sound effects, `aria-pressed` shows the state)
  or the **M** key (ignored while typing in a code field) turns sound on and off.
- The setting is saved with the binder (`sound` in the local save). Books saved before it existed
  load with sound on. The switch waits while the host menu is open or an RF action is pending,
  because the host refuses saves then.
- The AudioContext is created on the first tap or key press; nothing plays while the game is paused
  or the page is hidden. At most six cues play at once, each with a soft attack and release.

## $RAREFRIENDS (RF)

One consumable, the **RF ticket (2 RF)**, goes through the SDK chance game (`game.json`), with a
host confirmation for each buy, draw and redemption:

- **RF pack:** one ticket → the SDK outcome picks the card: Rare (puffy/clear/glitter) 60 %,
  Holo 30 %, Prism 7 %, Gold Foil 3 % with a 1 RF bonus that can be redeemed.
- **Battle entry:** both players burn one ticket per battle. **No RF changes hands**: the winner
  gets only the win in their record. There is no prize pool and no transfer between players.
  Because the SDK has no pure burn call, an entry ticket is still drawn (play → settle) like any
  ticket, so it carries the same 3 % chance of the 1 RF gold bonus; the screen says so. A half-opened
  RF pack is never spent as a battle entry.

Expected return is 0.03 RF per 2 RF ticket (≈ 98.5 % of RF stays spent). A ticket drawn but not
yet revealed is resumed by its play id. The binder and battle screens show RF spent and RF burned.

In this preview the RF balance (20 simulated RF), purchases, draws and burns come from the SDK's
simulated ledger: no real RF moves. Live, the same buy → play → settle calls would run on-chain
with wallet confirmations; RF paid for tickets goes to the game contract, so a true burn (sending
entry fees to an unrecoverable address) needs a contract-side change agreed with the Rare Friends
team. That phase is not part of this preview.

Known limits of code-based battles: the responder receives the challenger's ordered deck before
choosing their own, so a determined responder could pre-compute a favourable order (a commit–reveal
exchange would fix this at the cost of a third message). At most ten challenges can wait for
replies; a new one cannot be issued until some are settled.

Trade and battle codes carry card designs and decks with a CRC-16 checksum against typos. They are
not signed and not proofs of ownership; battles are friendly matches. Cards and records have no
monetary value. SDK v0.1.2 has no trading or matchmaking capability; real-time PvP, verified decks
and on-chain burns would need separately scoped integrations.

The binder (up to 150 cards, the record, open challenges, answered-challenge keys and the sound setting) is saved
locally for this browser and NFT session. An unreadable save stops the game rather than being
overwritten.

## Development and verification

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-stickers
node node_modules/typescript/bin/tsc -p games/rare-stickers/tsconfig.json
node scripts/dev-game.mjs check games/rare-stickers
node --test --experimental-test-coverage games/rare-stickers/album.test.mjs games/rare-stickers/cards.test.mjs games/rare-stickers/sound.test.mjs
node games/rare-stickers/browser.test.mjs
node games/rare-stickers/genesis-browser.test.mjs
node scripts/dev-game.mjs build games/rare-stickers --outdir release-stickers
```

Set STICKERS_CHROMIUM to a Chromium executable if the bundled Playwright browser is missing.

## Assets and scope

Friend art is the canonical sprite read through the SDK readers. Every finish, frame, backdrop,
name and battle effect is drawn or generated by this component; no third-party card, sticker or
brand assets or names are used. Reduced motion skips the pack and battle animations. Sound effects
are synthesised in the browser. This is a developer-hosted preview, not an official Rare Friends production release.
