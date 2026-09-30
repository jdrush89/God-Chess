# God Chess

A divine strategy game that combines legal chess movement with snake-drafted
pantheons, shared orb economies, resting turns, status effects, and ability
upgrades. Play a two-player duel locally, challenge a difficulty-adjustable AI,
share a four-player cross-board in free-for-all or 2v2, solve prepared divine
puzzles, or play host-authoritative two-player and four-player online matches
through WebRTC rooms with five-character codes.

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

## Local four-player

Choose **Four-player local** from the new-game menu to configure a shared-device
match on the fixed 14×14 cross-board. North is always displayed at the top,
east at the right, south at the bottom, and west at the left; the four 3×3
corners are outside the playable board.

- Choose free-for-all or 2v2. Team games require exactly two seats on Team A
  and two on Team B, in any seat arrangement.
- Turns are clockwise by default. Team games can alternate teams when adjacent
  teammates would otherwise act consecutively.
- Choose last surviving player/team or the optional first-King-captured victory
  rule.
- Checkmate is resolved when the checked seat's turn begins, after intervening
  players have had a chance to disrupt it. If no complete chess or divine
  action can escape, the latest player to attack that King receives the capture.
- With takeover disabled, an eliminated seat’s remaining pieces become inert
  but stay capturable. With takeover enabled, the capturer controls those
  pieces; Gods and upgrades never transfer.
- Configure every seat as Human or Divine AI. At least one local Human is
  required, and each AI seat has its own level from 1–10.
- All twelve Gods are drafted exactly once in seat order
  `1-2-3-4, 4-3-2-1, 1-2-3-4`. AI seats draft, act, and upgrade automatically
  until the next Human decision.
- Local and cloud saves include the full four-player state and stable snapshot
  undo history. In mixed games, undo rewinds a completed AI chain together with
  the preceding Human turn.

## Four-player online

Choose **Online versus**, then **Four-player**, to host or join a multiparty
room. The existing two-player online flow remains available under
**Two-player**.

- A room supports 2–4 connected Human participants. The host assigns every
  Human to exactly one north/east/south/west seat; all unassigned seats become
  Divine AI.
- The host configures free-for-all or any exact 2v2 team layout, clockwise or
  alternating-team turns, victory mode, takeover, and a separate AI level from
  1–10 for every AI seat. Assignment or configuration changes clear readiness,
  and every connected Human must be assigned and ready before starting.
- Duplicate display names are allowed. Participants are tracked by private
  identifiers rather than by their names.
- All clients share the same cross-board, pantheons, history, and God/ability
  inspection. Only the participant assigned to the active seat can submit an
  action, and guests wait for the host’s canonical revision before acting
  again.
- The host validates every draft, ability, move, choice, and upgrade; runs all
  AI seats; owns stable undo snapshots; and broadcasts canonical state. Peer
  payloads, seat claims, revisions, and action IDs are never trusted.
- If a guest disconnects after the match starts, the room pauses before any
  further Human or AI action and reserves that seat. The original participant
  can rejoin with the opaque reconnect token issued privately by the host.
  Display names alone cannot reclaim a seat.
- While paused, the host may permanently replace the disconnected seat with a
  chosen AI level and resume. A replaced participant cannot reclaim that seat.
- Online four-player undo is available only when every currently connected
  Human has enabled **Allow undo**. Any participant may request the prior stable
  snapshot once consent is unanimous. Disconnecting or reconnecting clears the
  affected participant’s consent; AI replacement removes that participant from
  the consent set.
- Host disconnect ends the room. Guest departure before start removes them
  from the lobby; departure after start uses the pause/reconnect behavior above.
- Save & Quit is unavailable in live online rooms. Saved games are not used to
  migrate or resume a room.

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

## Four-player architecture

The repository keeps four-player gameplay parallel to the existing two-player
contracts. The deterministic core is used by the local UI, AI, saves, and the
session boundaries intended for the later multiparty-networking layer.

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
  pieces, piece-only takeover, victory, rest, and upgrade cycles. Eliminating a
  controller returns hired pieces to a living original owner, chains takeover
  for already-eliminated owners, and resolves stealth pieces under the same
  rules. Opponent-turn effects count hostile turns, so allied turns do not
  consume them.
- `src/game/fourPlayerPersistence.ts` exposes a strict clone/type-guard boundary
  used by saves and future online snapshots. Malformed or
  configuration-inconsistent serialized states are rejected before loading.
- `src/game/fourPlayerAi.ts` plans deterministic draft, ability, movement,
  choice, and upgrade action sequences for multiple enemies or teams with
  per-seat difficulty budgets.
- `src/fourPlayer/` contains the shared-device setup, cross-board, seat panels,
  action UI, animations, AI turn loop, save integration, and snapshot undo.
- `src/game/fourPlayerSession.ts` defines transport-neutral revisioned actions,
  strict state snapshots, and seat authorization.
- `src/multiplayer/types.ts` defines the exact versioned `classic` and
  `four-player` message protocol and validates every decoded application
  payload.
- `src/multiplayer/fourPlayerRoom.ts` owns the multiparty host state machine,
  private reconnect bindings, canonical revisions, host-run AI, pause and
  replacement behavior, and unanimous connected-Human undo.
- `src/multiplayer/useFourPlayerOnlineGame.ts` exposes lobby and canonical game
  state to React while preserving the existing classic online hook.

## Three-player Layer 1 architecture

The deterministic three-player core is intentionally separate from the
two-player and four-player state APIs. Layer 1 contains drafting, topology,
ordinary chess legality, elimination, persistence, and transport-neutral
session validation. God ability execution, React setup/gameplay, AI strategy,
save-menu integration, and authoritative room orchestration remain Layer 2/3
work.

- `src/game/threePlayerTypes.ts` defines White, Red, and Black seats; original
  piece ownership versus current control; Human/AI/online controller metadata;
  the nine-God draft; attack recency; completed-turn counters; and persisted
  stalemate pass-cycle state.
- `src/game/threePlayerTopology.ts` and `src/game/threePlayerTopologies/`
  describe boards as directed traces rather than rectangular coordinates.
  This supports center branches, wrapped circular lines, hex movement, and
  Three Half Chess pairwise embeddings without five separate move engines.
- `src/game/threePlayerChess.ts` applies ordinary chess movement, attacks,
  self-check prevention against both opponents, castling where defined,
  en passant where defined, and promotion over those topology contracts.
- `src/game/threePlayerEngine.ts` exports `createThreePlayerGame`,
  `threePlayerReducer`, and `availableThreePlayerActions`.
- `src/game/threePlayerPersistence.ts` exports `isThreePlayerState` and
  `prepareThreePlayerState`; `src/game/threePlayerSession.ts` adds strict
  revisioned action/snapshot, participant authorization, reconnect, and
  unanimous-undo foundations.

White, Red, then Black move in that fixed order. The draft claims nine of the
twelve Gods in order
`White, Red, Black, Black, Red, White, White, Red, Black`, giving every seat
three Gods and leaving three unused.

The board definitions follow Green Chess's rule text, diagrams, and “Try the
rules” position data:

- [Three-Player Chess](https://greenchess.net/rules.php?v=three-player) has 96
  cells and three standard 16-piece armies on joined 8x4 thirds. Rook and
  bishop traces bend through the center, bishops can branch there, and knight
  destinations preserve distinct one-plus-two orthogonal step orderings.
  Standard-like castling and en passant are supported.
- [Three Hexagonal Chess](https://greenchess.net/rules.php?v=three-hexagonal)
  has 217 cells and 28 pieces per seat: 19 pawns, two rooks, two knights, three
  bishops, a queen, and a king. It uses six rook and six bishop directions,
  twelve knight destinations, two pawn-forward directions, and the documented
  three-cell queenside castling.
- [Triad Chess](https://greenchess.net/rules.php?v=triad) has 144 cells and 24
  pieces per seat: 12 pawns, three each of rooks/knights/bishops, two queens,
  and a king. Pawns advance toward the opposite wall. Castling is unavailable.
- [Three Circular Chess](https://greenchess.net/rules.php?v=three-circular)
  has 24 sectors and four rings. Wrapped traces stop before returning to their
  origin, so full-loop null moves are never emitted. Each seat's two pawn
  groups travel in opposite directions toward the nearest enemy base.
  Castling is unavailable.
- [Three Half Chess](https://greenchess.net/rules.php?v=three-half) has three
  simultaneous 8x4 halves. Each pair is evaluated as one conventional 8x8
  board; a move may use one pairwise embedding but cannot mix paths from two.
  The visual ordering of the halves has no rules effect. Standard castling is
  retained within a seat's home half.

En passant is enabled wherever a variant defines an initial two-cell pawn
advance and an opposing pawn capture path through the crossed cell. The
opportunity lasts through the next actual move; an automatically skipped
stalemated seat does not consume a turn or expire it.

Hex geometry retains all three cell-color classes. Classes zero and one map
consistently to light and dark; class two is divided by a deterministic parity
in canonical axial coordinates to provide a balanced God Chess light/dark
pattern.

Checkmate is evaluated when the checked seat's turn begins, so an intervening
seat may remove the threat. If several enemies still check the King, durable
attack recency credits the most recent hostile attacker. The match either ends
on that first mate or eliminates the seat and continues. Takeover transfers
surviving piece control only; otherwise eliminated pieces stay inert and
capturable.

In first-checkmate mode, ordinary stalemate ends the match as a draw. In
continuation mode, a stalemated seat is skipped rather than eliminated and is
reconsidered after another move changes the position. If every surviving seat
is successively unable to act against one unchanged position, the result is a
draw. Skips do not count as completed turns.

White-owned pieces are always light and Black-owned pieces are always dark.
Red-owned pieces begin light and alternate after each completed Red turn.
Affinity is derived from the persisted Red completed-turn counter and original
owner, so it does not toggle on a stalemate skip and remains deterministic
through takeover, reconnect, undo, and replay.

Shared three-player and hex-board references:
[three-player rules](https://greenchess.net/rules.php?type=three-player) and
[hex-board rules](https://greenchess.net/rules.php?type=hex-board).
