import { threePlayerPieceAffinity } from "./threePlayerConfig";
import { getThreePlayerTopology } from "./threePlayerTopology";
import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerOrbAffinity,
  ThreePlayerPiece,
  ThreePlayerSeat,
  ThreePlayerState,
} from "./threePlayerTypes";

const topologyFor = (state: Pick<ThreePlayerState, "config">) =>
  getThreePlayerTopology(state.config.boardVariant);

const topologyPathIds = new Map<ThreePlayerBoardVariant, ReadonlySet<string>>();

export const threePlayerPathIdBelongsToVariant = (
  variant: ThreePlayerBoardVariant,
  pathId: string,
) => {
  let pathIds = topologyPathIds.get(variant);
  if (!pathIds) {
    const topology = getThreePlayerTopology(variant);
    pathIds = new Set([
      ...topology.cells.flatMap((cell) => [
        ...topology.rookTraces(cell).map((trace) => trace.id),
        ...topology.bishopTraces(cell).map((trace) => trace.id),
        ...topology.knightTraces(cell).map((trace) => trace.id),
        ...topology.kingNeighbors(cell).map((target) =>
          `step:${cell}:${target}`
        ),
        ...(["white", "red", "black"] as const).flatMap((seat) => {
          const advances = topology.pawnRules(seat, cell).advances;
          return [...new Set(advances.map((advance) => advance.to))]
            .flatMap((target) =>
              advances
                .filter((advance) => advance.to === target)
                .map((advance, index) =>
                  `pawn:${cell}:${target}:${advance.group}:${index}`
                )
            );
        }),
      ]),
      ...(["white", "red", "black"] as const).flatMap((seat) =>
        topology.castling(seat).map((candidate) =>
          `castle:${candidate.id}`
        )
      ),
    ]);
    topologyPathIds.set(variant, pathIds);
  }
  return pathIds.has(pathId);
};

export const threePlayerCells = (
  state: Pick<ThreePlayerState, "config">,
) => topologyFor(state).cells;

export const threePlayerCellAffinity = (
  state: Pick<ThreePlayerState, "config">,
  cell: ThreePlayerCell,
): ThreePlayerOrbAffinity =>
  topologyFor(state).cellById.get(cell)?.affinity ?? "light";

export const threePlayerDivinePieceAffinity = (
  state: Pick<ThreePlayerState, "completedTurns">,
  piece: Pick<ThreePlayerPiece, "owner">,
) => threePlayerPieceAffinity(state, piece);

export const threePlayerAdjacentCells = (
  state: Pick<ThreePlayerState, "config">,
  cell: ThreePlayerCell,
) => [...topologyFor(state).kingNeighbors(cell)];

export const threePlayerOrthogonalCells = (
  state: Pick<ThreePlayerState, "config">,
  cell: ThreePlayerCell,
) => [...topologyFor(state).orthogonalNeighbors(cell)];

export const threePlayerDiagonalCells = (
  state: Pick<ThreePlayerState, "config">,
  cell: ThreePlayerCell,
) => [...topologyFor(state).diagonalNeighbors(cell)];

export const threePlayerDistance = (
  state: Pick<ThreePlayerState, "config">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
) => topologyFor(state).distance(from, to) ?? Number.POSITIVE_INFINITY;

export const threePlayerLinePaths = (
  state: Pick<ThreePlayerState, "config">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  kind?: "rook" | "bishop",
) => [...topologyFor(state).linePaths(from, to, kind)];

export const threePlayerPathById = (
  state: Pick<ThreePlayerState, "config">,
  pathId: string,
  destination?: ThreePlayerCell,
) => topologyFor(state).path(pathId, destination);

export const threePlayerTravelPaths = (
  state: Pick<ThreePlayerState, "config" | "board">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
) => {
  const topology = topologyFor(state);
  const linePaths = topology.paths(from, to);
  if (linePaths.length) return [...linePaths];
  const knightPaths = topology.knightTraces(from)
    .filter((trace) => trace.target === to)
    .map((trace) => ({
      traceId: trace.id,
      origin: from,
      destination: to,
      context: trace.context,
      cells: trace.path,
    }));
  if (knightPaths.length) return knightPaths;
  const piece = state.board[from];
  if (piece?.type === "pawn") {
    const pawnPaths = topology.pawnRules(piece.owner, from).advances
      .filter((advance) => advance.to === to)
      .map((advance, index) => ({
        traceId: `pawn:${from}:${to}:${advance.group}:${index}`,
        origin: from,
        destination: to,
        context: advance.context,
        cells: advance.path,
      }));
    if (pawnPaths.length) return pawnPaths;
  }
  return topology.kingNeighbors(from).includes(to)
    ? [{
      traceId: `step:${from}:${to}`,
      origin: from,
      destination: to,
      cells: [to],
    }]
    : [];
};

export const threePlayerCrossedCells = (
  state: Pick<ThreePlayerState, "config" | "board">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  pathId?: string,
) => {
  const topology = topologyFor(state);
  const moving = state.board[from];
  const castlingPath = pathId && moving?.type === "king"
    ? topology.castling(moving.owner)
      .find((candidate) =>
        `castle:${candidate.id}` === pathId &&
        candidate.kingFrom === from &&
        candidate.kingTo === to
      )
    : undefined;
  const path = castlingPath
    ? {
      traceId: `castle:${castlingPath.id}`,
      origin: from,
      destination: to,
      cells: castlingPath.kingPath.filter((cell) => cell !== from),
    }
    : pathId
      ? topology.path(pathId, to) ??
        threePlayerTravelPaths(state, from, to)
          .find((candidate) => candidate.traceId === pathId)
    : threePlayerTravelPaths(state, from, to)[0];
  if (!path) return [];
  return path.cells.at(-1) === to
    ? [...path.cells.slice(0, -1)]
    : [...path.cells];
};

export const threePlayerHasLineOfSight = (
  state: Pick<ThreePlayerState, "config" | "board">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  pathId?: string,
) => {
  if (from === to) return true;
  const topology = topologyFor(state);
  const paths = pathId
    ? [topology.path(pathId, to)].filter(Boolean)
    : topology.linePaths(from, to);
  return paths.some((path) =>
    path && path.cells.slice(0, -1).every((cell) => !state.board[cell])
  );
};

export const threePlayerHomeCell = (
  state: Pick<ThreePlayerState, "config">,
  seat: ThreePlayerSeat,
) => topologyFor(state).homeCell(seat);

export const threePlayerAdvancement = (
  state: Pick<ThreePlayerState, "config">,
  seat: ThreePlayerSeat,
  cell: ThreePlayerCell,
) => topologyFor(state).advancement(seat, cell) ?? 0;

export const threePlayerAdvanceClass = (
  state: Pick<ThreePlayerState, "config">,
  seat: ThreePlayerSeat,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
) => topologyFor(state).classifyAdvance(seat, from, to);

export const threePlayerFrontCells = (
  state: Pick<ThreePlayerState, "config">,
  seat: ThreePlayerSeat,
  from: ThreePlayerCell,
) => [...topologyFor(state).frontCells(seat, from)];

export const threePlayerFormationDestination = (
  state: Pick<ThreePlayerState, "config">,
  anchorFrom: ThreePlayerCell,
  anchorTo: ThreePlayerCell,
  cell: ThreePlayerCell,
  context?: string,
) => topologyFor(state).formationTransform(
  anchorFrom,
  anchorTo,
  cell,
  context,
);

export const threePlayerAreas = (
  state: Pick<ThreePlayerState, "config">,
  from: ThreePlayerCell,
  level: 2 | 3,
) => {
  const topology = topologyFor(state);
  return level === 2
    ? [
      ...topology.areas(from, "1x2"),
      ...topology.areas(from, "2x1"),
    ]
    : [...topology.areas(from, "2x2")];
};

export const threePlayerSharesTrace = (
  state: Pick<ThreePlayerState, "config">,
  first: ThreePlayerCell,
  second: ThreePlayerCell,
  kind: "rook" | "bishop",
) => topologyFor(state).linePaths(first, second, kind).length > 0;
