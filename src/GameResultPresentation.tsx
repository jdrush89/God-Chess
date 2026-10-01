import { Crown, RotateCcw, Settings, Undo2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";

interface GameResultPresentationProps {
  open: boolean;
  eyebrow: string;
  title: string;
  description: string;
  newGameLabel: string;
  undoEnabled: boolean;
  canUndo: boolean;
  onOpenChange: (open: boolean) => void;
  onUndo: () => void;
  onOpenUndoSettings?: () => void;
  onNewGame: () => void;
}

export function GameResultPresentation({
  open,
  eyebrow,
  title,
  description,
  newGameLabel,
  undoEnabled,
  canUndo,
  onOpenChange,
  onUndo,
  onOpenUndoSettings,
  onNewGame,
}: GameResultPresentationProps) {
  const titleId = useId();
  const descriptionId = useId();
  const seeBoardRef = useRef<HTMLButtonElement>(null);
  const viewResultRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreBoardFocus = useRef(false);

  useEffect(() => {
    if (open) {
      seeBoardRef.current?.focus();
    } else if (restoreBoardFocus.current) {
      restoreBoardFocus.current = false;
      viewResultRef.current?.focus();
    }
  }, [open]);

  const seeBoard = () => {
    restoreBoardFocus.current = true;
    onOpenChange(false);
  };
  const undo = () => {
    if (!canUndo) return;
    onOpenChange(false);
    onUndo();
  };

  const undoControl = canUndo ? (
    <button className="secondary-button" onClick={undo}>
      <Undo2 size={16} /> Undo
    </button>
  ) : !undoEnabled && onOpenUndoSettings ? (
    <button className="secondary-button" onClick={onOpenUndoSettings}>
      <Settings size={16} /> Enable undo
    </button>
  ) : (
    <button className="secondary-button" disabled>
      <Undo2 size={16} /> Undo unavailable
    </button>
  );

  if (!open) {
    return (
      <aside className="finished-result-control" role="status" aria-label="Match finished">
        <span>
          <strong>Match finished</strong>
          <small>{title}</small>
        </span>
        <button
          className="primary-button"
          onClick={() => onOpenChange(true)}
          ref={viewResultRef}
        >
          View result
        </button>
        {undoControl}
      </aside>
    );
  }

  return (
    <div
      className="modal-backdrop game-result-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          seeBoard();
          return;
        }
        if (event.key !== "Tab") return;
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        ) ?? [])];
        if (!controls.length) return;
        const first = controls[0];
        const last = controls.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <section
        className="gameover-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
      >
        <div className="victory-crown"><Crown size={38} /></div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId} aria-live="assertive">{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="game-result-actions">
          <button className="primary-button" onClick={seeBoard} ref={seeBoardRef}>
            See board
          </button>
          {undoControl}
          <button className="secondary-button" onClick={onNewGame}>
            <RotateCcw size={16} /> {newGameLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
