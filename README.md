# God Chess

A local two-player strategy game that combines legal chess movement with a
snake-drafted pantheon of gods, shared orb economies, resting turns, status
effects, and ability upgrades. Play locally, against a difficulty-adjustable
AI, solve prepared divine puzzles, or play online through host-authoritative
WebRTC rooms with five-character codes.

Play the latest version at [playgodchess.com](https://playgodchess.com/).

## Printables

- [God boards](https://playgodchess.com/printables/god-chess-god-boards.pdf) - one full-color US Letter landscape board per god.
- [Marker tokens](https://playgodchess.com/printables/god-chess-marker-tokens.pdf) - cut-out rest, ability-level, orb, and status markers.

Regenerate both PDFs with `npm run printables`. God boards use the dedicated
1792×1008 portraits in `print-assets/gods`; the smaller `src/assets/gods`
versions are reserved for the web game.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. The game begins by randomly assigning colors,
then walks both players through the `1-2-2-1` draft.

## Puzzle mode

Puzzle mode has a dedicated difficulty browser with five Easy positions won in
one divine turn and ten Medium positions won across two player turns. The
puzzle cards do not reveal the intended god or ability. Each position includes
an optional hint, restart and next-puzzle controls, and level 10 Divine AI
responses between player turns. Completion check marks are stored in local
storage while signed out and in the player's account while signed in; puzzle
positions themselves are not added to local or cloud saves.

### Puzzle god index

`PUZZLE_GOD_USAGE` and `PUZZLE_GOD_INDEX` in `src/game/puzzles.ts` are derived
from each prepared position and its tested solution actions. The table below is
covered by a regression test so changes to puzzle rosters or required abilities
must update this documentation.

| Puzzle | Player gods | Opponent gods | Required by tested solution |
|---|---|---|---|
| Position One | Chiron, Teles, Midas | Ares, Chiron, Anubis | Chiron (charge) |
| Position Two | Kangus Kong, Teles, Death | Ares, Chiron, Anubis | Kangus Kong (rage) |
| Position Three | Death, Midas, Salem | Ares, Chiron, Anubis | Death (resurrect) |
| Position Four | Leonidas, Teles, Midas | Ares, Chiron, Anubis | Leonidas (escort) |
| Position Five | Quetzacoatl, Teles, Salem | Ares, Chiron, Anubis | Quetzacoatl (air-strike) |
| Position Six | Teles, Chiron, Medusa | Ares, Anubis, Salem | Teles (lure); Chiron (charge) |
| Position Seven | Midas, Death, Salem | Ares, Chiron, Anubis | Midas (leverage); Death (resurrect) |
| Position Eight | Chiron, Kangus Kong, Midas | Ares, Anubis, Salem | Chiron (mount); Kangus Kong (rage) |
| Position Nine | Anubis, Quetzacoatl, Teles | Ares, Chiron, Salem | Anubis (monument); Quetzacoatl (air-strike) |
| Position Ten | Midas, Chiron, Salem | Ares, Anubis, Medusa | Midas (leverage); Chiron (charge) |
| Position Eleven | Midas, Quetzacoatl, Anubis | Ares, Chiron, Salem | Midas (leverage); Quetzacoatl (air-strike) |
| Position Twelve | Death, Chiron, Teles | Ares, Anubis, Salem | Death (marked); Chiron (charge) |
| Position Thirteen | Quetzacoatl, Leonidas, Midas | Ares, Chiron, Anubis | Quetzacoatl (air-lift); Leonidas (escort) |
| Position Fourteen | Quetzacoatl, Chiron, Artemis | Ares, Anubis, Salem | Quetzacoatl (flight); Chiron (charge) |
| Position Fifteen | Ares, Chiron, Salem | Artemis, Anubis, Medusa | Ares (pick-a-fight); Chiron (charge) |

## Accounts and cloud saves

God Chess supports optional Supabase email/password accounts. Signed-out players
continue using saves stored only in their browser. Signed-in players use a
separate set of cloud saves and their account display name is reused for online
rooms and games against the Divine AI.

1. Create a Supabase project.
2. Open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. In Supabase Authentication settings, add the deployed site URL and local
   development URL to the allowed redirect URLs:
   - `https://playgodchess.com/`
   - `https://www.playgodchess.com/`
   - `https://jdrush89.github.io/God-Chess/`
   - `http://localhost:5173/`
4. Copy `.env.example` to `.env.local` and enter the project URL and
   publishable key for local development.
5. Add these GitHub repository variables for Pages deployments:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase row-level-security policies restrict profiles and saves to their
authenticated owner. Passwords and sessions are managed by Supabase and are
never stored in the game database or browser save records.

## Commands

- `npm run dev` starts the development server.
- `npm test` runs the game-engine tests.
- `npm run build` type-checks and creates a production build.
- `npm run printables` regenerates the printable god boards and marker sheets.

Every push to `main` runs the test suite, builds the game, and deploys the
result to GitHub Pages.

## Gameplay

Each divine turn starts by choosing one of your non-resting gods, then one of
that god's three abilities. Free abilities are the main way to generate white
and black orbs; paid abilities spend the shared reserves shown beside each
player. Board highlights guide every source, destination, target, graveyard,
and multi-step choice.

After all six drafted gods have acted, rest tokens clear and each player
upgrades one ability. Capture the opposing king to win.

## Four-player core

The repository includes a deterministic four-player rules foundation for later
setup/UI and multiparty-networking layers. It does not yet replace or widen the
current two-player `GameState`, reducer, AI, save, or WebRTC contracts.

- `src/game/geometry.ts` contains shared geometry primitives. The existing
  `src/game/chess.ts` API remains the 8x8 compatibility facade.
- `src/game/fourPlayerChess.ts` defines the 14x14 cross board: the central 8x8
  plus a 3x8 arm on every side, with the four 3x3 corners excluded.
- Four-player coordinates use files `a` through `n` and ranks `1` through `14`.
  North moves toward decreasing ranks, east toward decreasing files, south
  toward increasing ranks, and west toward increasing files.
- `src/game/fourPlayerTypes.ts` separates seat, team, original owner, current
  controller, display color, light/dark orb affinity, and local/AI/online
  control metadata.
- `src/game/fourPlayerConfig.ts` validates FFA or exact 2v2 teams, distinct
  display colors, two light and two dark affinities, clockwise or alternating
  team turns, victory mode, and takeover.
- `src/game/fourPlayerEngine.ts` exports `createFourPlayerGame`,
  `fourPlayerReducer`, and the deterministic `FourPlayerAction` boundary. It
  implements the 12-God snake draft, all God abilities, elimination, inert
  pieces, piece-only takeover, victory, rest, and upgrade cycles.
- `src/game/fourPlayerPersistence.ts` exposes the clone/type-guard boundary
  intended for the later save and online protocol layers.

The four-player layer intentionally has no final setup screen, board rendering,
AI search integration, save-list integration, or multiparty transport yet.
