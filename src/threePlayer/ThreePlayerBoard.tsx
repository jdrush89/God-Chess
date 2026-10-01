import { useMemo } from "react";
import { threePlayerHasAlternatingNeutralCells } from "../game/threePlayerDivineGeometry";
import {
  getThreePlayerTopology,
  type ThreePlayerTopology,
} from "../game/threePlayerTopology";
import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerPiece,
  ThreePlayerState,
} from "../game/threePlayerTypes";

const PIECES: Record<ThreePlayerPiece["type"], string> = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
};

const RENDER_PADDING = 0.6;

const distance = (
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
) => Math.hypot(ax - bx, ay - by);

const pieceFontSize = (
  descriptor: ThreePlayerTopology["cellDescriptors"][number],
  variant: ThreePlayerBoardVariant,
) => {
  if (variant === "three-player") return 0.64;
  const shape = descriptor.render.shape;
  if (shape.kind === "annular-sector") {
    const radial = shape.outerRadius - shape.innerRadius;
    const angular = 2 * ((shape.innerRadius + shape.outerRadius) / 2) *
      Math.sin((shape.endAngle - shape.startAngle) / 2);
    return Math.min(0.76, radial * 0.72, angular * 0.72);
  }
  const edges = shape.points.map((point, index) =>
    distance(point, shape.points[(index + 1) % shape.points.length])
  );
  return Math.min(0.76, Math.min(...edges) * 0.68);
};

const pieceName = (piece: ThreePlayerPiece) =>
  `${piece.owner} ${piece.type}${piece.controller && piece.controller !== piece.owner
    ? `, controlled by ${piece.controller}`
    : piece.controller
      ? ""
      : ", inert"}`;

const annularSectorPath = (
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
) => {
  const polar = (radius: number, angle: number) => [
    cx + radius * Math.sin(angle),
    cy + radius * Math.cos(angle),
  ];
  const [x1, y1] = polar(outer, start);
  const [x2, y2] = polar(outer, end);
  if (inner === 0) {
    return `M ${x1} ${y1} A ${outer} ${outer} 0 0 0 ${x2} ${y2} L ${cx} ${cy} Z`;
  }
  const [x3, y3] = polar(inner, end);
  const [x4, y4] = polar(inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 0 0 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 1 ${x4} ${y4} Z`;
};

export interface ThreePlayerBoardProps {
  state: Pick<
    ThreePlayerState,
    "config" | "board" | "players" | "bananas" | "pending" | "turn"
  >;
  selectedCell?: ThreePlayerCell;
  legalCells?: readonly ThreePlayerCell[];
  pathCells?: readonly ThreePlayerCell[];
  disabled?: boolean;
  preview?: boolean;
  onCell?: (cell: ThreePlayerCell) => void;
}

export function ThreePlayerBoard({
  state,
  selectedCell,
  legalCells = [],
  pathCells = [],
  disabled = false,
  preview = false,
  onCell,
}: ThreePlayerBoardProps) {
  const topology = useMemo(
    () => getThreePlayerTopology(state.config.boardVariant),
    [state.config.boardVariant],
  );
  const bounds = topology.renderBounds;
  const viewBox = {
    minX: bounds.minX - RENDER_PADDING,
    minY: bounds.minY - RENDER_PADDING,
    width: bounds.width + RENDER_PADDING * 2,
    height: bounds.height + RENDER_PADDING * 2,
  };
  const legal = new Set(legalCells);
  const path = new Set(pathCells);
  const variant = state.config.boardVariant;
  const enchantSourceChoice = (
    state.pending?.step === "enchant-enemy-move" ||
    state.pending?.step === "enchant-followup-move"
  ) && !selectedCell;

  return (
    <svg
      className={`three-board three-board-${variant} ${preview ? "preview" : ""}`}
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      role={preview ? "img" : "grid"}
      aria-label={`${variant} three-player board`}
      preserveAspectRatio="xMidYMid meet"
    >
      {topology.cellDescriptors.map((descriptor) => {
        const piece = state.board[descriptor.id];
        const banana = state.bananas.find(({ cell }) => cell === descriptor.id);
        const isLegal = legal.has(descriptor.id);
        const isSelected = descriptor.id === selectedCell;
        const visualClass = descriptor.geometricClass === 2 &&
          threePlayerHasAlternatingNeutralCells(variant)
          ? "neutral"
          : descriptor.geometricClass === 0
            ? "light"
            : descriptor.geometricClass === 1
              ? "dark"
              : descriptor.affinity;
        const cellClass = [
          "three-board-cell",
          visualClass,
          isLegal ? "legal" : "",
          piece && isLegal ? "legal-occupied" : "",
          isLegal && enchantSourceChoice ? "legal-source" : "",
          isLegal && !enchantSourceChoice ? "legal-destination" : "",
          isSelected ? "selected" : "",
          path.has(descriptor.id) ? "path" : "",
        ].filter(Boolean).join(" ");
        const label = [
          descriptor.id,
          piece ? pieceName(piece) : undefined,
          banana ? `banana placed by ${banana.owner}` : undefined,
        ].filter(Boolean).join(", ");
        const shared = {
          className: cellClass,
          "data-cell": descriptor.id,
        };
        const renderShape = descriptor.render.shape;
        const shape = renderShape.kind === "annular-sector"
          ? (
            <path
              {...shared}
              d={annularSectorPath(
                renderShape.cx,
                renderShape.cy,
                renderShape.innerRadius,
                renderShape.outerRadius,
                renderShape.startAngle,
                renderShape.endAngle,
              )}
            />
          )
          : (
            <polygon
              {...shared}
              points={renderShape.points.map(([x, y]) => `${x},${y}`).join(" ")}
            />
          );
        return (
          <g
            className="three-cell-hit"
            role={preview ? undefined : "gridcell"}
            aria-label={preview ? undefined : label}
            aria-disabled={disabled || (!isLegal && !piece)}
            tabIndex={preview || disabled ? undefined : 0}
            onClick={() => !preview && !disabled && onCell?.(descriptor.id)}
            onKeyDown={(event) => {
              if (
                !preview &&
                !disabled &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onCell?.(descriptor.id);
              }
            }}
            key={descriptor.id}
          >
            {shape}
            {piece && !preview && (
              <text
                className={`three-board-piece seat-${piece.controller ?? piece.owner} ${piece.controller ? "" : "inert"}`}
                x={descriptor.render.x}
                y={descriptor.render.y}
                style={{
                  "--piece-color":
                    state.players[piece.controller ?? piece.owner].displayColor,
                  fontSize: pieceFontSize(descriptor, variant),
                } as React.CSSProperties}
                aria-hidden="true"
              >
                {PIECES[piece.type]}
              </text>
            )}
            {banana && !preview && (
              <text
                className="three-board-banana"
                x={descriptor.render.x}
                y={descriptor.render.y}
                aria-hidden="true"
              >
                🍌
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
