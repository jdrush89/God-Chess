import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerOrbAffinity as OrbAffinity,
  ThreePlayerPiece,
  ThreePlayerSeat,
} from "./threePlayerTypes";
import { createCircularTopology } from "./threePlayerTopologies/circular";
import {
  createThreeHexagonalTopology,
  createTriadTopology,
} from "./threePlayerTopologies/hex";
import {
  createThreeHalfTopology,
  createYaltaTopology,
} from "./threePlayerTopologies/joined";

export type ThreePlayerStandardPieceType = ThreePlayerPiece["type"];
export type ThreePlayerTraceKind = "rook" | "bishop";
export type ThreePlayerAdjacencyKind = "rook" | "bishop" | "king" | "knight";

export interface ThreePlayerRenderCoordinate {
  x: number;
  y: number;
  size: number;
}

export interface ThreePlayerTopologyCell {
  id: ThreePlayerCell;
  ordinal: number;
  sourceIndex: number;
  render: ThreePlayerRenderCoordinate;
  geometricClass: 0 | 1 | 2;
  affinity: OrbAffinity;
  axial?: { q: number; r: number };
  half?: ThreePlayerSeat;
  local?: { file: number; rank: number };
  circular?: { sector: number; ring: number };
}

export interface ThreePlayerDirectedTrace {
  id: string;
  kind: ThreePlayerTraceKind;
  origin: ThreePlayerCell;
  direction: string;
  cells: readonly ThreePlayerCell[];
  context?: string;
}

export interface ThreePlayerPath {
  traceId: string;
  context?: string;
  cells: readonly ThreePlayerCell[];
}

export interface ThreePlayerKnightTrace {
  id: string;
  origin: ThreePlayerCell;
  target: ThreePlayerCell;
  path: readonly ThreePlayerCell[];
  context?: string;
}

export interface ThreePlayerPawnAdvance {
  group: string;
  to: ThreePlayerCell;
  path: readonly ThreePlayerCell[];
  double: boolean;
  initialOnly: boolean;
  initialDouble: boolean;
  promotes: boolean;
  context?: string;
}

export interface ThreePlayerPawnCapture {
  group: string;
  to: ThreePlayerCell;
  promotes: boolean;
  context?: string;
}

export interface ThreePlayerPawnMetadata {
  advances: readonly ThreePlayerPawnAdvance[];
  captures: readonly ThreePlayerPawnCapture[];
  promotion: boolean;
  initialDouble: boolean;
}

export interface ThreePlayerCastlingDescriptor {
  id: string;
  seat: ThreePlayerSeat;
  side: "king" | "queen";
  kingFrom: ThreePlayerCell;
  rookFrom: ThreePlayerCell;
  kingTo: ThreePlayerCell;
  rookTo: ThreePlayerCell;
  empty: readonly ThreePlayerCell[];
  kingPath: readonly ThreePlayerCell[];
}

export interface ThreePlayerInitialPlacement {
  cell: ThreePlayerCell;
  sourceIndex: number;
  seat: ThreePlayerSeat;
  type: ThreePlayerStandardPieceType;
  pieceId: string;
  pawnGroup?: string;
}

export interface ThreePlayerTopology {
  variant: ThreePlayerBoardVariant;
  cells: readonly ThreePlayerCell[];
  cellSet: ReadonlySet<ThreePlayerCell>;
  cellDescriptors: readonly ThreePlayerTopologyCell[];
  cellById: ReadonlyMap<ThreePlayerCell, ThreePlayerTopologyCell>;
  initialPlacements: readonly ThreePlayerInitialPlacement[];
  castlingBySeat: Readonly<Record<ThreePlayerSeat, readonly ThreePlayerCastlingDescriptor[]>>;
  cellFromSourceIndex(sourceIndex: number): ThreePlayerCell | undefined;
  sourceIndex(cell: ThreePlayerCell): number | undefined;
  rookTraces(from: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  rookRays(from: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  bishopTraces(from: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  bishopRays(from: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  kingNeighbors(from: ThreePlayerCell): readonly ThreePlayerCell[];
  kingTargets(from: ThreePlayerCell): readonly ThreePlayerCell[];
  knightTraces(from: ThreePlayerCell): readonly ThreePlayerKnightTrace[];
  knightTargets(from: ThreePlayerCell): readonly ThreePlayerCell[];
  pawnMetadata(seat: ThreePlayerSeat, from: ThreePlayerCell): ThreePlayerPawnMetadata;
  pawnRules(seat: ThreePlayerSeat, from: ThreePlayerCell): ThreePlayerPawnMetadata;
  isPromotionCell(seat: ThreePlayerSeat, cell: ThreePlayerCell): boolean;
  castling(seat: ThreePlayerSeat): readonly ThreePlayerCastlingDescriptor[];
  adjacent(from: ThreePlayerCell, kind?: ThreePlayerAdjacencyKind): readonly ThreePlayerCell[];
  paths(
    from: ThreePlayerCell,
    to: ThreePlayerCell,
    kind?: ThreePlayerTraceKind,
  ): readonly ThreePlayerPath[];
  distance(from: ThreePlayerCell, to: ThreePlayerCell): number | undefined;
}

export const hexCellAffinity = (
  geometricClass: 0 | 1 | 2,
  q: number,
  r: number,
): OrbAffinity => {
  if (geometricClass === 0) return "light";
  if (geometricClass === 1) return "dark";
  return Math.abs(q + r) % 2 === 0 ? "light" : "dark";
};

let topologies: Readonly<Record<ThreePlayerBoardVariant, ThreePlayerTopology>> | undefined;

export const threePlayerTopologies = () => {
  if (!topologies) {
    topologies = {
      "three-player": createYaltaTopology(),
      "three-hexagonal": createThreeHexagonalTopology(),
      triad: createTriadTopology(),
      "three-circular": createCircularTopology(),
      "three-half": createThreeHalfTopology(),
    };
  }
  return topologies;
};

export const getThreePlayerTopology = (
  variant: ThreePlayerBoardVariant,
): ThreePlayerTopology => threePlayerTopologies()[variant];
