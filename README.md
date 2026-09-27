# God Chess

A local two-player strategy game that combines legal chess movement with a
snake-drafted pantheon of gods, shared orb economies, resting turns, status
effects, and ability upgrades. Play locally, against a difficulty-adjustable
AI, or online through host-authoritative WebRTC rooms with five-character codes.

Play the latest version at [jdrush89.github.io/God-Chess](https://jdrush89.github.io/God-Chess/).

## Printables

- [God boards](https://jdrush89.github.io/God-Chess/printables/god-chess-god-boards.pdf) - one full-color US Letter landscape board per god.
- [Marker tokens](https://jdrush89.github.io/God-Chess/printables/god-chess-marker-tokens.pdf) - cut-out rest, ability-level, orb, and status markers.

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
