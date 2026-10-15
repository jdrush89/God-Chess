import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DRAG_THRESHOLD = 6;

interface BoardDragOptions<Cell extends string> {
  attribute: "data-square" | "data-cell";
  canDrag: (cell: Cell) => boolean;
  onDragStart: (cell: Cell) => void;
  onDrop: (cell: Cell) => void;
}

interface PendingDrag<Cell extends string> {
  pointerId: number;
  source: Cell;
  startX: number;
  startY: number;
  dragging: boolean;
}

export interface BoardDragPreview<Cell extends string> {
  source: Cell;
  x: number;
  y: number;
}

export const useBoardDrag = <Cell extends string>({
  attribute,
  canDrag,
  onDragStart,
  onDrop,
}: BoardDragOptions<Cell>) => {
  const pending = useRef<PendingDrag<Cell> | undefined>(undefined);
  const suppressClick = useRef(false);
  const callbacks = useRef({ canDrag, onDragStart, onDrop });
  callbacks.current = { canDrag, onDragStart, onDrop };
  const [preview, setPreview] = useState<BoardDragPreview<Cell>>();

  const onPointerDown = (
    cell: Cell,
    event: ReactPointerEvent<Element>,
  ) => {
    if (
      (event.button ?? 0) !== 0 ||
      !callbacks.current.canDrag(cell)
    ) return;
    pending.current = {
      pointerId: event.pointerId,
      source: cell,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<Element>) => {
    const current = pending.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      !current.dragging &&
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) >= DRAG_THRESHOLD
    ) {
      current.dragging = true;
      callbacks.current.onDragStart(current.source);
    }
    if (!current.dragging) return;
    event.preventDefault();
    setPreview({
      source: current.source,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const finish = (event: ReactPointerEvent<Element>) => {
    const current = pending.current;
    if (!current || current.pointerId !== event.pointerId) return;
    pending.current = undefined;
    setPreview(undefined);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!current.dragging) return;

    suppressClick.current = true;
    const hit = document.elementFromPoint?.(event.clientX, event.clientY) ??
      event.target;
    const target = hit instanceof Element
      ? hit.closest<HTMLElement>(`[${attribute}]`)
      : null;
    const destination = target?.getAttribute(attribute) as Cell | null;
    if (destination && destination !== current.source) {
      callbacks.current.onDrop(destination);
    }
  };

  const cancel = (event: ReactPointerEvent<Element>) => {
    const current = pending.current;
    if (!current || current.pointerId !== event.pointerId) return;
    pending.current = undefined;
    setPreview(undefined);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const consumeClick = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  return {
    preview,
    draggingSource: preview?.source,
    consumeClick,
    pointerHandlers: {
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
    },
    onPointerDown,
  };
};
