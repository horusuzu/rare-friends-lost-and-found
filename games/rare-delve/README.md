# Rare Delve

An original turn-based dungeon-crawling roguelike starring your verified Rare Friends NFT.
Your Friend lives in a small town above **Lantern Hollow**, a ten-floor cave that is dug anew on
every dive. Walk the grid in eight directions, fight what lurks there, guess what the unmarked
bottles and scrolls do, keep your belly full, and carry the **Heart Lantern** home from floor 10.
The hero is your own Friend, drawn from its canonical on-chain sprite. Built with FriendSDK 0.1.2,
React and a deterministic TypeScript engine rendered to a scrolling 15 × 11-tile (240 × 176) canvas;
phones in portrait get 13 columns of bigger tiles and as many rows as fill the screen.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+), or the
configured Genesis #597. The host checks current collection-specific ownership on Robinhood
Chain (4663). Wallet connection and read-only checks need no transaction or signature.
Choose **New game** (はじめから) or **Continue** (つづきから, which shows the floor of a suspended
dive). Japanese is the default; switch to English at any time.

Every action in the dungeon is one turn: when you act, every monster acts. Nothing moves while
you think.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move / attack by walking into a monster | 8-way pad (diagonals included) | Arrow keys or WASD (hold two for a diagonal), Q E Z C, numpad 1–9 |
| Wait one turn and search for traps | centre of the pad (・) | `.`, Space or numpad 5 |
| A: attack ahead, confirm, go down stairs | A | Enter, F or J |
| B: back, cancel, close the map | B | X, Backspace or K |
| Bag (item menu) | 道具 / Bag | I |
| Full map | 地図 / Map | M |
| Turn in place (free) | 向き / Turn, then a direction | T, then a direction |
| Pause / suspend | Ⅱ | P or Escape |

Holding a direction keeps walking and stops by itself when you are hurt, something happens
(an item, a trap, a message) or the step is blocked. Diagonal steps cannot cut wall corners.
Menu rows can be tapped directly. The game pauses when the page loses focus and whenever the
runtime's `paused` prop is set.

## The town loop

The town menu offers four places:

- **Dive** (ランタン洞に もぐる): start at floor 1 at **level 1** with a full belly. Your bag and
  equipment come with you, plus free provisions from the shop (level 1: a Small Bun; level 2: a
  bun and a Mendleaf; level 3: two buns and a Mendleaf). The bag holds 20 items.
- **Shop counter** (お店のカウンター): sell anything you carry, and spend gold to raise the shop
  to level 2 (400 G) and level 3 (1 200 G) for better provisions. Sell prices: gear
  `price + enchantment × ⌈price / 4⌉` (at least 1), wands `price + 10 × charges`, darts
  `price × count`, everything else its listed price. Treasures (Geode 120, Ember Opal 300) exist to be sold.
- **Storage chest** (そうこ): keeps up to 8 items safe between dives, even when you fall.
- **Bag** (もちもの): equip or unequip a weapon and a shield before you go. In town every item is
  appraised.

A dive ends one of three ways. **Clear**: pick up the Heart Lantern on floor 10; you keep your bag
and gear, and carried gold goes into the purse with a 1 000 G bonus. **Home**: read a Homeward
Scroll to return the same way, without the bonus. **Death**: everything carried (bag, equipped gear and carried gold) is lost; the
purse, the chest and the shop level are safe. A result screen shows the floor, turns, level and cause.

## Floors

Each floor is 40 × 28 tiles: six or eight lit rooms on a grid, joined by a random spanning tree of
dark corridors plus a few loops. Layouts come from the dive seed, so a suspended dive resumes on
the same floor. Rooms light up whole when you enter them; in corridors you see one tile around.
Explored tiles stay on the map (dimmed when out of sight); monsters show only while seen. A corner
minimap and a full-screen map show rooms, corridors, stairs, items and visible monsters.

- Monsters per floor: `2–4 + ⌊floor × 0.65⌋`, about half asleep at first. A new one wanders in out
  of sight every 30–52 turns (at most 18 on a floor).
- Items: 4–6 per floor (one more from floor 5), plus 1–3 piles of gold worth `(8–24) × (floor + 2)`.
- Traps: `min(6, 1 + ⌊floor / 2⌋ + 0–1)`, hidden until stepped on or found by waiting next to them,
  never beside a doorway. Floor 10 holds the Heart Lantern on its pedestal and has no pitfalls.

## Monsters and quirks

Twelve original species, each with its own pixel art:

| Monster | Floors | Quirk |
| --- | --- | --- |
| Dustbun ほこりん | 1–3 | drifts at random |
| Drowsy Newt ねぼけイモリ | 1–4 | sleeps until woken |
| Pebble Crab こいしガニ | 2–5 | hard shell, acts every other turn |
| Coin Mite コインダニ | 2–7 | steals carried gold and warps away; beat it to get the gold back |
| Glimmoth ひかりガ | 3–6 | acts twice a turn |
| Rust Slug さびナメクジ | 4–8 | its touch may lower your shield's enchantment |
| Twig Archer えだゆみ | 4–9 | shoots along straight lines (8 directions, up to 8 tiles) |
| Twin Jelly ふえるゼリー | 5–9 | may split in two when struck |
| Gulp Toad まるのみガエル | 5–10 | swallows floor items (dropped again when it falls) |
| Thorn Wasp トゲバチ | 6–10 | its sting may drain strength |
| Muddle Bat まどいコウモリ | 7–10 | flits about; its bite may confuse |
| Magma Tortoise ようがんガメ | 8–10 | slow, hits very hard |

Monsters wake and give chase when they see you (or come within two steps), follow a distance
field around walls and each other, and never cut wall corners.

## Combat formulas

- Hero attack = `level + ⌊strength / 2⌋ + weapon power + enchantment`; defence = shield power + enchantment.
- Damage = `max(1, round(attack × random 0.88–1.12 − defence × soak))`, with soak 0.5 for your
  blows and 0.6 for monster blows. You hit 92 % of the time, monsters 85 % (always, if you are asleep).
- EXP: total for level L is the sum of gaps starting at 8 and growing ×1.34 per level (cap 30).
  Each level adds 5 max HP (base 25). Strength starts at 8.
- Thrown items fly up to 10 tiles and hit 85 %: Iron Darts deal 6, other items 1–2 and land near
  the target; thrown Drowse or Muddle Draughts put the target to sleep or confuse it.
- Wands (2–5 charges) fire along your facing: Gust blows a monster away, Lullaby puts it to sleep,
  Switch swaps places, Molasses slows it. An empty wand does nothing.

## Identification

Draughts, scrolls and wands start **unidentified** on every dive, with looks shuffled per dive
seed: bottles by colour (e.g. あかの びん / Red Bottle), scrolls by two nonsense syllables (「ラノ」の巻物),
wands by wood (カシのつえ / Oak Wand). The bag and floor messages show the look until the kind is
known. A kind becomes known when you drink or read it, when a wand hits something, when a thrown
Drowse or Muddle Draught takes effect, or with a **Scroll of Insight**. Kinds you carry down from
town are known from the start. Knowledge lasts for the dive.

## Balance

Difficulty is tuned with two scripted players over 40 seeded first dives (no shop upgrades):
`bot.mjs` fights and explores but never aims items; `bot-skilled.mjs` also throws darts and potions,
zaps wands at dangerous monsters, burns crowds and test-drinks unknown bottles. The skilled player
clears roughly one first dive in six to eight, a few dives end on floors 1–3, and most deaths come
from floor 5 on (Thorn Wasps, Gulp Toads, Twig Archers, Muddle Bats, Magma Tortoises). Hunger rarely
kills but punishes clearing every room. `engine-bot.test.mjs` keeps these bands; `node
games/rare-delve/balance-sim.mjs 60` prints a fuller report.

## Hunger, regeneration and traps

- The belly starts at 100 % and drops 1 % every 9 turns. Warnings appear at 20 % and 10 %; at 0 %
  you lose 1 HP per turn instead. A Small Bun fills 50 %, a Big Loaf fills completely.
- While fed and hurt you regenerate: each turn max HP is added to a pool, and every 150 points heal
  1 HP (at most 1 HP per turn).
- **Trip Snare** drops a random bag item nearby; **Pitfall** drops you to the next floor for 5
  damage (never below 1 HP); **Clapper Trap** wakes every monster on the floor. Waiting searches the
  eight tiles around you.

## Gold (simulated)

**Gold is a free, simulated in-game currency. It is not RF, has no monetary value and cannot be
redeemed.** It is labelled on the title screen, in the shop and in the footer. No purchase, play,
settlement or redemption action is ever called; the required `game.json` chance-game schema is an
unused placeholder.

## Saves and suspend

Saves are compact JSON written with `client.saveLocal` (the SDK's per-game, per-NFT local preview
storage, 32 KB limit). The game saves when a dive starts, on every staircase, every 50 turns, after
shop and chest changes and when a dive ends. **Pause → Suspend & save** (中断して セーブ) stores the
dive exactly as it stands (floor seed, fog, monsters, items, traps, identification and the random
state) and returns to the title; **Continue** resumes on the same tile and turn. A dive is settled
the moment it ends, so reloading cannot undo a death. Every field is validated on load; a malformed
or foreign save is ignored with a notice, and a failed write shows a message without blocking play.
Generations and Genesis saves are separate.

## Sound, motion and accessibility

Short synthesised square- and triangle-wave cues (WebAudio, no audio files) with a mute button (♪).
Reduced motion follows the system preference and can be toggled in the pause menu; it stops the
idle bob, the lantern glow and the damage flash. Menus are real buttons with the current choice
marked, the HP bar exposes `role="meter"`, and all pad and header controls are at least 44 px.
Layouts are checked at 320 × 568, 390 × 844, 844 × 390, 960 × 640 and 1100 × 900 with no page overflow.
The AudioContext is created and resumed on the first touchend, pointer-up, click or key press (iOS
only unlocks audio from those), including after iOS interrupts it.

## Phones

The camera is presentation only (the engine never sees it). `viewFor` in `render.ts` sizes it to the
stage: wide boxes and anything wider than 560 px keep the reference 15 × 11 tiles; a phone's portrait
stage gets 13 columns (tiles about 15 % larger, 26–32 px on 360–430 px phones) and as many whole rows
as fill its height (11–23), so the map uses the space that used to be empty above and below it. The
town backdrop stands on the bottom edge under a taller sky. The 8-way pad, A/B and Bag/Map/Turn stay
in the lower thumb zone in portrait and beside the view in landscape. Text in play is at least 12 px
(the simulated-gold note wraps rather than truncates); the map canvas takes no browser gestures
(`touch-action: none`), the view has no double-tap zoom, there is no long-press menu or text
selection, and the documents have `overscroll-behavior: none`. The game pauses on blur,
`visibilitychange` and `pagehide`. `host.css` makes the host toolbar one 48 px row (44 px targets,
12 px text) and edge to edge on phones, with a `100vh` fallback for `100dvh`. `mobile.test.mjs` checks
360 × 640, 375 × 667, 390 × 664, 430 × 740 and 664 × 390 with phone emulation (touch, DPR 3, mobile
UA): no scroll in either document, the view at least 50 % of the viewport height in portrait (60 %
landscape) with enlarged tiles, every pad control a 44 px target (48 px for A/B) below or beside the
view and above the host toolbar, the town, bag and map overlays, a touch step and pause.

## Development and verification

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-delve
node node_modules/typescript/bin/tsc -p games/rare-delve/tsconfig.json
node scripts/dev-game.mjs check games/rare-delve
node --test games/rare-delve/engine-*.test.mjs
DELVE_SIZE='[[390,844]]' node games/rare-delve/browser.test.mjs
DELVE_SIZE='[390]' node games/rare-delve/genesis-browser.test.mjs
DELVE_SIZE='[[390,664]]' node games/rare-delve/mobile.test.mjs
node scripts/dev-game.mjs build games/rare-delve --outdir release-delve
```

Engine modules (`rng`, `data`, `dungeon`, `items`, `monsters`, `combat`, `actions`, `turn`, `run`,
`game`, `save`) are pure and deterministic; `art`, `render`, `sound`, `controls`, `panels.tsx` and
`index.tsx` are presentation. The browser test walks real floors by rebuilding the layout from the
exposed dive seed with the engine itself, and uses the SDK's wallet fixtures, which are never
shipped in the playable build. Set `DELVE_CHROMIUM` to use an installed Chromium and run one
viewport per process with `DELVE_SIZE`.

## Originality and credits

Rare Delve is inspired by the roguelike genre in general: turn-based grid movement, random floors,
unidentified items, hunger and permanent loss on death. All names, monsters, items, maps, text,
pixel art, sound cues and interface are original to this game. It uses no names, characters or
assets from any other game series or company (including Torneko, Dragon Quest, Chunsoft,
Square Enix or Shiren), and no extracted, traced or pixel-copied art, music or text. The Friend
sprite comes from the canonical on-chain artwork through the SDK reader. SDK assets keep their
LICENSE, NOTICE.md and asset provenance. This is a developer-hosted preview, not an official
Rare Friends production release.
