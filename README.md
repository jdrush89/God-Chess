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

Puzzle mode includes five anonymized positions won in one divine turn and ten
positions won across two player turns. The puzzle picker does not reveal the
intended god or ability. Each position includes an optional hint, restart and
next-puzzle controls, and level 10 Divine AI responses between player turns.
Puzzle positions are not added to local or cloud saves.

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
