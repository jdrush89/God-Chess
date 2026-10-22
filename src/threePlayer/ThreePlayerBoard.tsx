import { useMemo } from "react";
import { useBoardDrag } from "../components/useBoardDrag";
import { threePlayerHasAlternatingNeutralCells } from "../game/threePlayerDivineGeometry";
import {
  getThreePlayerTopology,
  threePlayerCellCoordinate,
  type ThreePlayerTopology,
} from "../game/threePlayerTopology";
import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerPiece,
  ThreePlayerState,
} from "../game/threePlayerTypes";
import { THREE_PLAYER_SEATS } from "../game/threePlayerTypes";
import {
  THREE_PLAYER_PIECE_SYMBOLS,
  threePlayerPieceStatusLabels,
} from "./presentation";

const RENDER_PADDING = 0.6;
const YALTA_COORDINATE_PADDING = 1.25;
const ENLARGED_PIECE_VARIANTS = new Set<ThreePlayerBoardVariant>([
  "three-hexagonal",
  "triad",
]);
const ENLARGED_PIECE_SCALE = 1.8;
const ENLARGED_PIECE_INRADIUS_LIMIT = 1.42;

const distance = (
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
) => Math.hypot(ax - bx, ay - by);

const polygonInradius = (
  center: readonly [number, number],
  points: readonly (readonly [number, number])[],
) => Math.min(...points.map((point, index) => {
  const next = points[(index + 1) % points.length];
  const edgeLength = distance(point, next);
  return Math.abs(
    (next[0] - point[0]) * (point[1] - center[1]) -
      (point[0] - center[0]) * (next[1] - point[1]),
  ) / edgeLength;
}));

const basePieceFontSize = (
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

const pieceFontSize = (
  descriptor: ThreePlayerTopology["cellDescriptors"][number],
  variant: ThreePlayerBoardVariant,
) => {
  const baseSize = basePieceFontSize(descriptor, variant);
  if (!ENLARGED_PIECE_VARIANTS.has(variant)) return baseSize;
  const shape = descriptor.render.shape;
  if (shape.kind !== "polygon") return baseSize;
  const inradius = polygonInradius(
    [descriptor.render.x, descriptor.render.y],
    shape.points,
  );
  return Math.min(
    baseSize * ENLARGED_PIECE_SCALE,
    inradius * ENLARGED_PIECE_INRADIUS_LIMIT,
  );
};

const statusMarkerGeometry = (
  descriptor: ThreePlayerTopology["cellDescriptors"][number],
  variant: ThreePlayerBoardVariant,
  fontSize: number,
) => {
  const shape = descriptor.render.shape;
  if (ENLARGED_PIECE_VARIANTS.has(variant) && shape.kind === "polygon") {
    const edges = shape.points.map((point, index) =>
      distance(point, shape.points[(index + 1) % shape.points.length])
    );
    const inradius = polygonInradius(
      [descriptor.render.x, descriptor.render.y],
      shape.points,
    );
    return {
      radius: Math.min(...edges) * 0.1,
      x: descriptor.render.x + inradius * 0.58,
      y: descriptor.render.y - inradius * 0.63,
    };
  }
  return {
    radius: fontSize * 0.16,
    x: descriptor.render.x + fontSize * 0.38,
    y: descriptor.render.y - fontSize * 0.36,
  };
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
  provisionalSource?: ThreePlayerCell;
  provisionalDestination?: ThreePlayerCell;
  legalCells?: readonly ThreePlayerCell[];
  sourceCells?: readonly ThreePlayerCell[];
  pathCells?: readonly ThreePlayerCell[];
  disabled?: boolean;
  preview?: boolean;
  onCell?: (cell: ThreePlayerCell) => void;
  onInspectCell?: (cell: ThreePlayerCell) => void;
}

export function ThreePlayerBoard({
  state,
  selectedCell,
  provisionalSource,
  provisionalDestination,
  legalCells = [],
  sourceCells = [],
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
  const variant = state.config.boardVariant;
  const yaltaCoordinateGuides = useMemo(() => {
    if (variant !== "three-player" || preview) return [];
    const center = [
      topology.renderBounds.minX + topology.renderBounds.width / 2,
      topology.renderBounds.minY + topology.renderBounds.height / 2,
    ] as const;
    const normalized = (x: number, y: number) => {
      const length = Math.hypot(x, y) || 1;
      return [x / length, y / length] as const;
    };
    return THREE_PLAYER_SEATS.map((seat) => {
      const cells = topology.cellDescriptors.filter(
        (descriptor) => descriptor.half === seat && descriptor.local,
      );
      const sectorCenter = cells.reduce(
        ([x, y], descriptor) => [
          x + descriptor.render.x / cells.length,
          y + descriptor.render.y / cells.length,
        ],
        [0, 0],
      );
      const outward = normalized(
        sectorCenter[0] - center[0],
        sectorCenter[1] - center[1],
      );
      const backRank = cells
        .filter((descriptor) => descriptor.local?.rank === 3)
        .sort((left, right) =>
          left.local!.file - right.local!.file
        );
      const backCenter = backRank.reduce(
        ([x, y], descriptor) => [
          x + descriptor.render.x / backRank.length,
          y + descriptor.render.y / backRank.length,
        ],
        [0, 0],
      );
      const files = backRank.map((descriptor) => {
        const coordinate = threePlayerCellCoordinate(variant, descriptor.id)!;
        const inward = cells.find((candidate) =>
          candidate.local?.file === descriptor.local?.file &&
          candidate.local?.rank === 2
        )!;
        const edgeDirection = normalized(
          descriptor.render.x - inward.render.x,
          descriptor.render.y - inward.render.y,
        );
        return {
          label: coordinate.file,
          x: descriptor.render.x + edgeDirection[0] * 0.58,
          y: descriptor.render.y + edgeDirection[1] * 0.58,
        };
      });
      const ranks = cells
        .filter((descriptor) => descriptor.local?.file === 0)
        .sort((left, right) =>
          right.local!.rank - left.local!.rank
        )
        .map((descriptor) => {
          const inward = cells.find((candidate) =>
            candidate.local?.file === 1 &&
            candidate.local?.rank === descriptor.local?.rank
          )!;
          const edgeDirection = normalized(
            descriptor.render.x - inward.render.x,
            descriptor.render.y - inward.render.y,
          );
          const coordinate = threePlayerCellCoordinate(variant, descriptor.id)!;
          return {
            label: String(coordinate.rank),
            x: descriptor.render.x + edgeDirection[0] * 0.58,
            y: descriptor.render.y + edgeDirection[1] * 0.58,
          };
        });
      return {
        seat,
        name: `${seat[0].toUpperCase()}${seat.slice(1)}`,
        x: backCenter[0] + outward[0] * 1.05,
        y: backCenter[1] + outward[1] * 1.05,
        files,
        ranks,
      };
    });
  }, [preview, topology, variant]);
  const bounds = topology.renderBounds;
  const renderPadding = yaltaCoordinateGuides.length
    ? YALTA_COORDINATE_PADDING
    : RENDER_PADDING;
  const viewBox = {
    minX: bounds.minX - renderPadding,
    minY: bounds.minY - renderPadding,
    width: bounds.width + renderPadding * 2,
    height: bounds.height + renderPadding * 2,
  };
  const legal = new Set(legalCells);
  const sources = new Set(sourceCells);
  const path = new Set(pathCells);
  const enchantSourceChoice = (
    state.pending?.step === "enchant-enemy-move" ||
    state.pending?.step === "enchant-followup-move"
  ) && !selectedCell;
  const previewingEffect = state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home";
  const drag = useBoardDrag<ThreePlayerCell>({
    attribute: "data-cell",
    canDrag: (cell) =>
      !preview &&
      !disabled &&
      Boolean(state.board[cell]) &&
      (
        cell === selectedCell ||
        cell === provisionalSource ||
        sources.has(cell)
      ),
    onDragStart: (cell) => {
      if (cell !== selectedCell && cell !== provisionalSource) onCell?.(cell);
    },
    onDrop: (cell) => onCell?.(cell),
  });

  return (
    <>
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
        const isSource = isMoveTarget && (
          sources.has(descriptor.id) ||
          (sources.size === 0 && enchantSourceChoice)
        );
        const isSelected = descriptor.id === selectedCell;
        const isProvisionalSource = descriptor.id === provisionalSource;
        const isProvisionalDestination = descriptor.id === provisionalDestination;
        const isDraggedSource = drag.draggingSource === descriptor.id;
        const statusLabels = piece ? threePlayerPieceStatusLabels(piece) : [];
        const coordinateLabel = threePlayerCellCoordinate(
          variant,
          descriptor.id,
        )?.label;
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
          isSource ? "legal-source" : "",
          isMoveTarget && !isSource ? "legal-destination" : "",
          isEffectPreview ? "effect-preview" : "",
          isSelected ? "selected" : "",
          isProvisionalSource ? "provisional-source" : "",
          isProvisionalDestination ? "provisional-destination" : "",
          path.has(descriptor.id) ? "path" : "",
        ].filter(Boolean).join(" ");
        const label = [
          descriptor.id,
          piece ? pieceName(piece) : undefined,
          statusLabels.length ? statusLabels.join(", ") : undefined,
          banana ? `banana placed by ${banana.owner}` : undefined,
          isSource ? "legal move source" : undefined,
          isProvisionalSource ? "provisional move source" : undefined,
          isProvisionalDestination
            ? "provisional move destination, not committed"
            : undefined,
          coordinateLabel,
        ].filter(Boolean).join(", ");
        const shared = {
          className: cellClass,
          "data-cell": descriptor.id,
        };
        const renderShape = descriptor.render.shape;
        const fontSize = pieceFontSize(descriptor, variant);
        const hexedBy = piece?.status.hexedBy;
        const marker = statusMarkerGeometry(descriptor, variant, fontSize);
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
              if (drag.consumeClick()) return;
              if (preview) return;
              onInspectCell?.(descriptor.id);
              if (!disabled) onCell?.(descriptor.id);
            }}
            onPointerDown={(event) => drag.onPointerDown(descriptor.id, event)}
            {...drag.pointerHandlers}
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
            {coordinateLabel && <title>{coordinateLabel}</title>}
            {shape}
            {isMoveTarget && !piece && (
              <circle
                className="move-target-dot"
                cx={descriptor.render.x}
                cy={descriptor.render.y}
                r={basePieceFontSize(descriptor, variant) * 0.14}
                aria-hidden="true"
              />
            )}
            {piece && !preview && !isDraggedSource && (
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
            {piece && hexedBy && !preview && !isDraggedSource && (
              <g
                className="three-status-marker"
                data-status="hexedBy"
                role="img"
                aria-label={`Hexed by ${state.players[hexedBy].name}`}
              >
                <title>{`Hexed by ${state.players[hexedBy].name}`}</title>
                <polygon points={hexagonPoints(marker.x, marker.y, marker.radius)} />
                <circle cx={marker.x} cy={marker.y} r={marker.radius * 0.25} />
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
      {yaltaCoordinateGuides.length > 0 && (
        <g
          className="three-yalta-coordinates"
          aria-label="Yalta board coordinates"
        >
          {yaltaCoordinateGuides.map((guide) => (
            <g
              key={guide.seat}
              aria-label={`${guide.name} sector coordinates`}
            >
              <text
                className="three-yalta-sector-label"
                x={guide.x}
                y={guide.y}
              >
                {guide.name}
              </text>
              {[...guide.files, ...guide.ranks].map((label, index) => (
                <text
                  className="three-yalta-coordinate-label"
                  x={label.x}
                  y={label.y}
                  key={`${label.label}-${index}`}
                >
                  {label.label}
                </text>
              ))}
            </g>
          ))}
        </g>
      )}
      </svg>
      {drag.preview && state.board[drag.preview.source] && (
        <div
          className="piece-drag-preview three-piece-drag-preview"
          style={{
            left: drag.preview.x,
            top: drag.preview.y,
            "--piece-color":
              state.players[
                state.board[drag.preview.source].controller ??
                  state.board[drag.preview.source].owner
              ].displayColor,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {THREE_PLAYER_PIECE_SYMBOLS[state.board[drag.preview.source].type]}
        </div>
      )}
    </>
  );
}
