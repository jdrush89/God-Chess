import { useMemo } from "react";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
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
    "config" | "board" | "players" | "bananas"
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
  const legal = new Set(legalCells);
  const path = new Set(pathCells);
  const variant = state.config.boardVariant;

  return (
    <svg
      className={`three-board three-board-${variant} ${preview ? "preview" : ""}`}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      role={preview ? "img" : "grid"}
      aria-label={`${variant} three-player board`}
      preserveAspectRatio="xMidYMid meet"
    >
      {topology.cellDescriptors.map((descriptor) => {
        const piece = state.board[descriptor.id];
        const banana = state.bananas.find(({ cell }) => cell === descriptor.id);
        const isLegal = legal.has(descriptor.id);
        const isSelected = descriptor.id === selectedCell;
        const cellClass = [
          "three-board-cell",
          descriptor.affinity,
          isLegal ? "legal" : "",
          piece && isLegal ? "legal-occupied" : "",
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
