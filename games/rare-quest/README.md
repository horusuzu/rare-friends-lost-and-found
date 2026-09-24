# Rare Quest

An original handheld-era monster-collecting RPG starring your verified Rare Friends NFT.
Walk a small grid world in a four-shade green palette, meet wild monsters in the tall grass,
battle them turn by turn, befriend them with ribbons, rest at the Rest House and win the
Jade Badge from the dojo master. Your partner is not handed to you by a professor: it is your
own Friend, drawn from its canonical on-chain sprite. Built with FriendSDK 0.1.2, React and a
deterministic TypeScript engine rendered to a 160 × 144 canvas.

## Play

Connect through the SDK host and choose an owned Generations NFT (generation 1+), or the
configured Genesis #597. The host checks current collection-specific ownership on Robinhood
Chain (4663). Wallet connection and read-only checks need no transaction or signature.
Choose **New game** (はじめから) or **Continue** (つづきから) when a save exists. Japanese or
English can be switched at any time.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move / move cursor | D-pad | Arrow keys or WASD |
| A: talk, confirm, advance text | A | Z or Enter |
| B: back, cancel | B | X or Backspace |
| Menu (party, items, notes, save) | MENU | M or Space |
| Pause | Ⅱ | P or Escape |

Menu entries and battle commands can also be tapped directly. The game pauses when the page
loses focus and whenever the runtime's `paused` prop is set.

## World

- **Moegi Village** (start): your home (Grandma heals the team), the Nemunoki Lab (Dr. Yuzu
  explains types and gives 5 ribbons once: there is no starter monster, because your partner
  is your Friend), signs and villagers.
- **Sprout Trail**: patches of tall grass, including across the path. Each step in tall grass has a 12 %
  chance of a wild monster (levels 2–6).
- **Jade Town**: the **Rest House** (Hana heals the team and becomes your return point; the
  clerk sells items for acorns) and the **Jade Dojo**, where Master Kohaku waits.

## Your partner

The Friend's type and base stats come deterministically from its collection and token id
(FNV-1a hash): one of six types, base HP/ATK/DEF/SPD of 50 plus a 60-point hash-weighted spread.
It starts at level 5 and learns Dot Tackle, a type move, then stronger moves at levels 8, 13 and 20.

## Monsters and types

Ten wild species plus one dojo-only species, all original (names, art and notes):
Mossball, Capmochi (SPROUT) · Yamyam, Lanternbo (EMBER) · Brinebub, Polkadrop (TIDE) ·
Vanebird, Glitchmoth (GALE) · Pillowstone (STONE) · Dotton (PIXEL) · Grovelet (SPROUT, dojo).

| Attacker | Strong (×2) against | Resisted (×0.5) by |
| --- | --- | --- |
| SPROUT | TIDE, STONE | EMBER, GALE, SPROUT |
| EMBER | SPROUT, GALE | TIDE, STONE, EMBER |
| TIDE | EMBER, STONE | SPROUT, TIDE |
| GALE | SPROUT, PIXEL | STONE |
| STONE | EMBER, GALE | SPROUT |
| PIXEL | — | STONE |

Fourteen moves have a type, power (40–80), accuracy (85–100 %) and PP (10–35).

## Battle rules

- Commands: **FIGHT / ITEM / PARTY / RUN**. The faster monster acts first (ties go to you).
- Damage = `power × ATK/DEF × (level + 10) / 60`, × 1.5 for a same-type move (STAB), × type
  effectiveness, × a random 85–100 %, rounded down, + 1 (minimum 1). Accuracy is rolled per move.
- Stats: HP = `base × level / 25 + level + 12`; other stats = `base × level / 20 + 5`.
  Levelling recomputes stats and raises current HP by the max-HP gain.
- EXP = `species yield × foe level / 4` (× 1.5 against the master) to the monster that is out.
  The level curve is `level³ / 2`; the cap is level 50. A monster with four moves forgets its
  oldest move to learn a new one.
- When your monster faints you choose the next one; if all faint you return to the Rest House
  (or home before you have visited it) fully healed. Nothing is lost.
- **RUN** always succeeds when you are at least as fast; otherwise
  `25 % + 50 % × your SPD / foe SPD + 20 % per earlier attempt`. You cannot run from the master.
- The master uses Pillowstone Lv7, Lanternbo Lv8 and Grovelet Lv10, one after another.
  Winning awards the **Jade Badge** and 100 acorns.

## Befriending (capture)

Use a **Friend Ribbon** from ITEM on a wild monster:
`chance = species rate × (3 × maxHP − 2 × HP) / (3 × maxHP)`, so weakening it first helps
(rates 0.35–0.8). A befriended monster joins your party with its current HP. The party holds
six; with a full party the ribbon is not used. Ribbons cannot be used on the master's monsters.

## Items and acorns (simulated)

| Item | Effect | Price |
| --- | --- | --- |
| Friend Ribbon | befriend a wild monster | 20 acorns |
| Pep Herb | restore 20 HP (not a fainted monster) | 15 acorns |

You start with 3 ribbons, 2 herbs and 100 acorns. Wild wins pay `3 × foe level` acorns and
each of the master's monsters `40 + 10 × level`. **Everything is free and simulated. Acorns
are not RF, have no monetary value and cannot be redeemed.** No purchase, play, settlement or
redemption action is called; the required `game.json` chance-game schema is unused.

## Saves

**Menu → SAVE** writes a compact JSON save (well under 2 KB) with `client.saveLocal`
(the SDK's per-game, per-NFT local preview storage, 32 KB limit). Healing and winning the badge
also autosave. On load every field is validated (token, map, walkable position, species, levels,
EXP range, HP, moves/PP, items, acorns, flags, notes); a malformed save is ignored with a notice
and a failed write shows a message without blocking play. Generations and Genesis saves are separate.

## Sound, motion and accessibility

Short synthesised square-wave cues (WebAudio, no audio files) with a mute button (♪).
Reduced-motion preference removes the battle wipe, hit blinking, the bouncing text-box arrow and the
area-name banner. Menus and commands are real buttons with the current choice marked, HP bars expose
`role="meter"`, and touch targets are at least 44 px.

## Development and verification

```sh
npm run build
node scripts/dev-game.mjs dev games/rare-quest
node node_modules/typescript/bin/tsc -p games/rare-quest/tsconfig.json
node scripts/dev-game.mjs check games/rare-quest
node --test --experimental-test-coverage games/rare-quest/engine-*.test.mjs
QUEST_SIZE='[[390,844]]' node games/rare-quest/browser.test.mjs
QUEST_SIZE='[390]' node games/rare-quest/genesis-browser.test.mjs
node scripts/dev-game.mjs build games/rare-quest --outdir release-quest
```

Engine modules (`rng`, `data`, `mon`, `battle`, `world`, `story`, `game`, `save`) are pure and
deterministic; `art`, `render`, `sound` and `index.tsx` are presentation. Browser tests use the
SDK's wallet fixtures, which are never shipped in the playable build. Set `QUEST_CHROMIUM` to use
an installed Chromium; run one viewport per process with `QUEST_SIZE`.

## Originality and credits

Rare Quest is inspired by the handheld monster-collecting RPG genre in general: grid overworld,
tall grass, turn-based battles, befriending, a party and a badge. All names, monsters, moves,
items, maps, dialogue, pixel art, sound cues and interface are original to this game; it uses no
third-party game, company or character names, and no extracted, traced or pixel-copied assets,
music or text. The Friend sprite comes from the canonical on-chain artwork through the SDK reader.
SDK assets keep their LICENSE, NOTICE.md and asset provenance. This is a developer-hosted preview,
not an official Rare Friends production release.
