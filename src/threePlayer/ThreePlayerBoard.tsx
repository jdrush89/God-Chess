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
import {
  THREE_PLAYER_PIECE_SYMBOLS,
  threePlayerPieceStatusLabels,
} from "./presentation";

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

const hexagonPoints = (cx: number, cy: number, radius: number) =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 6 + index * Math.PI / 3;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(" ");

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
  onInspectCell?: (cell: ThreePlayerCell) => void;
}

export function ThreePlayerBoard({
  state,
  selectedCell,
  legalCells = [],
  pathCells = [],
  disabled = false,
  preview = false,
  onCell,
  onInspectCell,
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
  const previewingEffect = state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home";

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
        const isEffectPreview = previewingEffect && isLegal;
        const isMoveTarget = isLegal && !isEffectPreview;
        const isSelected = descriptor.id === selectedCell;
        const statusLabels = piece ? threePlayerPieceStatusLabels(piece) : [];
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
          isMoveTarget ? "legal" : "",
          piece && isMoveTarget ? "legal-occupied" : "",
          isMoveTarget && enchantSourceChoice ? "legal-source" : "",
          isMoveTarget && !enchantSourceChoice ? "legal-destination" : "",
          isEffectPreview ? "effect-preview" : "",
          isSelected ? "selected" : "",
          path.has(descriptor.id) ? "path" : "",
        ].filter(Boolean).join(" ");
        const label = [
          descriptor.id,
          piece ? pieceName(piece) : undefined,
          statusLabels.length ? statusLabels.join(", ") : undefined,
          banana ? `banana placed by ${banana.owner}` : undefined,
        ].filter(Boolean).join(", ");
        const shared = {
          className: cellClass,
          "data-cell": descriptor.id,
        };
        const renderShape = descriptor.render.shape;
        const fontSize = pieceFontSize(descriptor, variant);
        const hexedBy = piece?.status.hexedBy;
        const markerRadius = fontSize * 0.16;
        const markerX = descriptor.render.x + fontSize * 0.38;
        const markerY = descriptor.render.y - fontSize * 0.36;
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
            tabIndex={preview || (disabled && !onInspectCell) ? undefined : 0}
            onClick={() => {
              if (preview) return;
              onInspectCell?.(descriptor.id);
              if (!disabled) onCell?.(descriptor.id);
            }}
            onKeyDown={(event) => {
              if (
                !preview &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onInspectCell?.(descriptor.id);
                if (!disabled) onCell?.(descriptor.id);
              }
            }}
            key={descriptor.id}
          >
            {shape}
            {isMoveTarget && !piece && (
              <circle
                className="move-target-dot"
                cx={descriptor.render.x}
                cy={descriptor.render.y}
                r={pieceFontSize(descriptor, variant) * 0.14}
                aria-hidden="true"
              />
            )}
            {piece && !preview && (
              <text
                className={`three-board-piece seat-${piece.controller ?? piece.owner} ${piece.controller ? "" : "inert"}`}
                x={descriptor.render.x}
                y={descriptor.render.y}
                style={{
                  "--piece-color":
                    state.players[piece.controller ?? piece.owner].displayColor,
                  fontSize,
                } as React.CSSProperties}
                aria-hidden="true"
              >
                {THREE_PLAYER_PIECE_SYMBOLS[piece.type]}
              </text>
            )}
            {piece && hexedBy && !preview && (
              <g
                className="three-status-marker"
                data-status="hexedBy"
                role="img"
                aria-label={`Hexed by ${state.players[hexedBy].name}`}
              >
                <title>{`Hexed by ${state.players[hexedBy].name}`}</title>
                <polygon points={hexagonPoints(markerX, markerY, markerRadius)} />
                <circle cx={markerX} cy={markerY} r={markerRadius * 0.25} />
              </g>
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
