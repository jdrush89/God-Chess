import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

export const BOARD_ZOOM_MIN = 1;
export const BOARD_ZOOM_MAX = 3;
export const BOARD_ZOOM_STEP = 0.25;

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardViewportSize {
  width: number;
  height: number;
}

export interface BoardTransform {
  scale: number;
  x: number;
  y: number;
}

const RESET_TRANSFORM: BoardTransform = {
  scale: BOARD_ZOOM_MIN,
  x: 0,
  y: 0,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const clampBoardTransform = (
  transform: BoardTransform,
  viewport: BoardViewportSize,
): BoardTransform => {
  const scale = clamp(transform.scale, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX);
  if (viewport.width <= 0 || viewport.height <= 0 || scale === BOARD_ZOOM_MIN) {
    return { scale, x: 0, y: 0 };
  }
  return {
    scale,
    x: clamp(transform.x, viewport.width * (1 - scale), 0),
    y: clamp(transform.y, viewport.height * (1 - scale), 0),
  };
};

export const zoomBoardAtPoint = (
  transform: BoardTransform,
  requestedScale: number,
  point: BoardPoint,
  viewport: BoardViewportSize,
): BoardTransform => {
  const scale = clamp(requestedScale, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX);
  const ratio = scale / transform.scale;
  return clampBoardTransform({
    scale,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  }, viewport);
};

interface ActivePointer extends BoardPoint {
  pointerType: string;
}

interface DragGesture {
  pointerId: number;
  start: BoardPoint;
  origin: BoardTransform;
  moved: boolean;
}

interface PinchGesture {
  pointerIds: [number, number];
  distance: number;
  midpoint: BoardPoint;
  origin: BoardTransform;
}

export interface BoardViewportProps {
  children: ReactNode;
  label: string;
  resetKey?: string | number;
  className?: string;
}

const pointerDistance = (first: BoardPoint, second: BoardPoint) =>
  Math.hypot(second.x - first.x, second.y - first.y);

const pointerMidpoint = (first: BoardPoint, second: BoardPoint): BoardPoint => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
});

export function BoardViewport({
  children,
  label,
  resetKey,
  className = "",
}: BoardViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<BoardTransform>(RESET_TRANSFORM);
  const transformRef = useRef(transform);
  const activePointers = useRef(new Map<number, ActivePointer>());
  const dragGesture = useRef<DragGesture | undefined>(undefined);
  const pinchGesture = useRef<PinchGesture | undefined>(undefined);
  const suppressClicksUntil = useRef(0);

  const viewportSize = useCallback((): BoardViewportSize => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    };
  }, []);

  const commitTransform = useCallback((next: BoardTransform) => {
    const clamped = clampBoardTransform(next, viewportSize());
    transformRef.current = clamped;
    setTransform(clamped);
  }, [viewportSize]);

  const reset = useCallback(() => {
    activePointers.current.clear();
    dragGesture.current = undefined;
    pinchGesture.current = undefined;
    commitTransform(RESET_TRANSFORM);
  }, [commitTransform]);

  const zoomTo = useCallback((requestedScale: number, point?: BoardPoint) => {
    const size = viewportSize();
    commitTransform(zoomBoardAtPoint(
      transformRef.current,
      requestedScale,
      point ?? { x: size.width / 2, y: size.height / 2 },
      size,
    ));
  }, [commitTransform, viewportSize]);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      const actualPinchGesture = event.ctrlKey || event.metaKey;
      if (!actualPinchGesture && transformRef.current.scale === BOARD_ZOOM_MIN) {
        return;
      }
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? rect.height
          : 1;
      const factor = Math.exp(-event.deltaY * deltaMultiplier * 0.002);
      zoomTo(transformRef.current.scale * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  useEffect(() => {
    const reclamp = () => commitTransform(transformRef.current);
    const viewport = viewportRef.current;
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && viewport) {
      observer = new ResizeObserver(reclamp);
      observer.observe(viewport);
    }
    window.addEventListener("resize", reclamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reclamp);
    };
  }, [commitTransform]);

  const localPointer = (
    event: Pick<ReactPointerEvent<HTMLDivElement>, "clientX" | "clientY">,
  ): BoardPoint => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const beginPinch = () => {
    const touches = [...activePointers.current.entries()]
      .filter(([, pointer]) => pointer.pointerType === "touch");
    if (touches.length < 2) return;
    const [[firstId, first], [secondId, second]] = touches;
    dragGesture.current = undefined;
    pinchGesture.current = {
      pointerIds: [firstId, secondId],
      distance: Math.max(1, pointerDistance(first, second)),
      midpoint: pointerMidpoint(first, second),
      origin: transformRef.current,
    };
    suppressClicksUntil.current = Number.POSITIVE_INFINITY;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = localPointer(event);
    activePointers.current.set(event.pointerId, {
      ...point,
      pointerType: event.pointerType,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (
      event.pointerType === "touch" &&
      [...activePointers.current.values()].filter(
        (pointer) => pointer.pointerType === "touch",
      ).length >= 2
    ) {
      beginPinch();
      return;
    }
    if (transformRef.current.scale > BOARD_ZOOM_MIN) {
      dragGesture.current = {
        pointerId: event.pointerId,
        start: point,
        origin: transformRef.current,
        moved: false,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = activePointers.current.get(event.pointerId);
    if (!active) return;
    const point = localPointer(event);
    activePointers.current.set(event.pointerId, {
      ...point,
      pointerType: active.pointerType,
    });

    const pinch = pinchGesture.current;
    if (pinch?.pointerIds.includes(event.pointerId)) {
      const first = activePointers.current.get(pinch.pointerIds[0]);
      const second = activePointers.current.get(pinch.pointerIds[1]);
      if (!first || !second) return;
      event.preventDefault();
      const midpoint = pointerMidpoint(first, second);
      const scale = clamp(
        pinch.origin.scale * pointerDistance(first, second) / pinch.distance,
        BOARD_ZOOM_MIN,
        BOARD_ZOOM_MAX,
      );
      const boardPoint = {
        x: (pinch.midpoint.x - pinch.origin.x) / pinch.origin.scale,
        y: (pinch.midpoint.y - pinch.origin.y) / pinch.origin.scale,
      };
      commitTransform({
        scale,
        x: midpoint.x - boardPoint.x * scale,
        y: midpoint.y - boardPoint.y * scale,
      });
      return;
    }

    const drag = dragGesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    suppressClicksUntil.current = Number.POSITIVE_INFINITY;
    event.preventDefault();
    commitTransform({
      ...drag.origin,
      x: drag.origin.x + deltaX,
      y: drag.origin.y + deltaY,
    });
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const pinch = pinchGesture.current;
    const endedPinch = Boolean(pinch?.pointerIds.includes(event.pointerId));
    const drag = dragGesture.current;
    const dragged = Boolean(
      drag && drag.pointerId === event.pointerId && drag.moved,
    );
    activePointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (endedPinch) {
      pinchGesture.current = undefined;
      suppressClicksUntil.current = performance.now() + 450;
      const remaining = [...activePointers.current.entries()][0];
      if (!cancelled && remaining && transformRef.current.scale > BOARD_ZOOM_MIN) {
        dragGesture.current = {
          pointerId: remaining[0],
          start: remaining[1],
          origin: transformRef.current,
          moved: false,
        };
      } else {
        dragGesture.current = undefined;
      }
      return;
    }

    if (dragGesture.current?.pointerId === event.pointerId) {
      dragGesture.current = undefined;
    }
    if (dragged) suppressClicksUntil.current = performance.now() + 450;
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (performance.now() >= suppressClicksUntil.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const atMinimum = transform.scale <= BOARD_ZOOM_MIN;
  const atMaximum = transform.scale >= BOARD_ZOOM_MAX;
  const isReset = atMinimum && transform.x === 0 && transform.y === 0;

  return (
    <section className={`board-zoom ${className}`.trim()} aria-label={label}>
      <div className="board-zoom-controls" role="group" aria-label={`${label} zoom controls`}>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={atMinimum}
          onClick={() => zoomTo(transformRef.current.scale - BOARD_ZOOM_STEP)}
        >
          −
        </button>
        <span className="board-zoom-value" aria-label="Current board zoom">
          {Math.round(transform.scale * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={atMaximum}
          onClick={() => zoomTo(transformRef.current.scale + BOARD_ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="board-zoom-reset"
          aria-label="Reset board zoom"
          disabled={isReset}
          onClick={reset}
        >
          Reset
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`board-zoom-viewport ${transform.scale > BOARD_ZOOM_MIN ? "zoomed" : ""}`}
        data-board-scale={transform.scale}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onLostPointerCapture={(event) => finishPointer(event, true)}
        onClickCapture={onClickCapture}
      >
        <div
          className="board-zoom-content"
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
