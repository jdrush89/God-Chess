import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  CloudUpload,
  Eraser,
  LoaderCircle,
  MousePointer2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { AccountPortrait } from "../account/AccountPortrait";
import type { AccountProfile } from "../account/useAccount";
import { allSquares } from "../game/chess";
import { GODS } from "../game/gods";
import type { Color, GodId, Piece, PieceType, Square } from "../game/types";
import {
  createBlankCustomPuzzle,
  customPuzzleFingerprint,
  customPuzzleIsVerified,
  validateCustomPuzzle,
  type ActiveCustomPuzzle,
  type CustomPuzzleDraft,
  type CustomPuzzleMarketplaceEntry,
} from "./model";
import {
  loadCustomPuzzleDrafts,
  persistCustomPuzzleDrafts,
  upsertCustomPuzzleDraft,
} from "./storage";
import {
  loadCustomPuzzleMarketplace,
  publishCustomPuzzle,
} from "./marketplace";

type HubTab = "library" | "editor" | "marketplace";
type EditorTool = PieceType | "move" | "erase";

const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

const PIECE_TYPES: PieceType[] = [
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
];
const EDITOR_SQUARES = [...allSquares].sort((left, right) => {
  const rankDifference = Number(right[1]) - Number(left[1]);
  return rankDifference || left[0].localeCompare(right[0]);
});

const createPiece = (
  square: Square,
  type: PieceType,
  color: Color,
): Piece => ({
  id: `custom-${color}-${type}-${square}-${Date.now().toString(36)}`,
  type,
  color,
  controller: color,
  hasMoved: true,
  status: {},
});

const cloneDraft = (draft: CustomPuzzleDraft): CustomPuzzleDraft =>
  structuredClone(draft);

const puzzleObjectiveLabel = (puzzle: CustomPuzzleDraft | CustomPuzzleMarketplaceEntry["puzzle"]) =>
  puzzle.objective === "capture-king"
    ? `Capture the opposing King in ${puzzle.turnLimit} turn${puzzle.turnLimit === 1 ? "" : "s"}`
    : "Escape checkmate in one turn";

export function CustomPuzzleHub({
  initialTab,
  account,
  accountControl,
  onBack,
  onPlay,
}: {
  initialTab: "editor" | "marketplace";
  account?: AccountProfile;
  accountControl: ReactNode;
  onBack: () => void;
  onPlay: (puzzle: ActiveCustomPuzzle) => void;
}) {
  const [tab, setTab] = useState<HubTab>(
    initialTab === "marketplace" ? "marketplace" : "library",
  );
  const [drafts, setDrafts] = useState(loadCustomPuzzleDrafts);
  const [editing, setEditing] = useState<CustomPuzzleDraft>();
  const [pieceColor, setPieceColor] = useState<Color>("white");
  const [tool, setTool] = useState<EditorTool>("queen");
  const [selectedBoardSquare, setSelectedBoardSquare] = useState<Square>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [marketplace, setMarketplace] =
    useState<CustomPuzzleMarketplaceEntry[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [publishingId, setPublishingId] = useState<string>();

  const saveDrafts = useCallback((next: CustomPuzzleDraft[]) => {
    try {
      persistCustomPuzzleDrafts(next);
      setDrafts(next);
      return true;
    } catch (saveError) {
      console.error("Unable to save custom puzzle drafts.", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save custom puzzle drafts.",
      );
      return false;
    }
  }, []);

  const openEditor = (draft?: CustomPuzzleDraft) => {
    setEditing(cloneDraft(draft ?? createBlankCustomPuzzle()));
    setMessage(undefined);
    setError(undefined);
    setSelectedBoardSquare(undefined);
    setTab("editor");
  };

  const updateEditing = (
    update: (draft: CustomPuzzleDraft) => CustomPuzzleDraft,
  ) => {
    setEditing((current) => {
      if (!current) return current;
      const next = update(cloneDraft(current));
      if (next.verifiedFingerprint !== customPuzzleFingerprint(next)) {
        next.verifiedFingerprint = undefined;
        next.verifiedTurnsUsed = undefined;
      }
      return next;
    });
    setMessage(undefined);
    setError(undefined);
  };

  const persistEditing = () => {
    if (!editing) return undefined;
    const next = {
      ...editing,
      title: editing.title.trim() || "Untitled puzzle",
      updatedAt: new Date().toISOString(),
    };
    const saved = upsertCustomPuzzleDraft(drafts, next);
    if (!saveDrafts(saved)) return undefined;
    setEditing(next);
    setMessage("Puzzle saved on this device.");
    return next;
  };

  const testDraft = () => {
    if (!editing) return;
    const errors = validateCustomPuzzle(editing);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    const saved = persistEditing();
    if (saved) onPlay({ puzzle: saved, localDraftId: saved.id });
  };

  const loadMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    setError(undefined);
    try {
      setMarketplace(await loadCustomPuzzleMarketplace(friendsOnly));
    } catch (loadError) {
      console.error("Unable to load custom puzzle marketplace.", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load custom puzzle marketplace.",
      );
    } finally {
      setMarketplaceLoading(false);
    }
  }, [friendsOnly]);

  useEffect(() => {
    if (tab === "marketplace") void loadMarketplace();
  }, [loadMarketplace, tab]);

  const publishDraft = async (draft: CustomPuzzleDraft) => {
    if (!account) {
      setError("Sign in before uploading a puzzle.");
      return;
    }
    if (!customPuzzleIsVerified(draft) || !draft.verifiedTurnsUsed) {
      setError("Complete this exact puzzle before uploading it.");
      return;
    }
    setPublishingId(draft.id);
    setError(undefined);
    try {
      const uploadedPuzzleId = await publishCustomPuzzle({
        puzzle: draft,
        turnsUsed: draft.verifiedTurnsUsed,
        puzzleId: draft.uploadedPuzzleId,
      });
      const updated = {
        ...draft,
        uploadedPuzzleId,
        updatedAt: new Date().toISOString(),
      };
      const savedLocally = saveDrafts(upsertCustomPuzzleDraft(drafts, updated));
      setEditing((current) =>
        current?.id === updated.id ? updated : current
      );
      if (savedLocally) {
        setMessage(
          draft.uploadedPuzzleId
            ? "Marketplace puzzle updated."
            : "Puzzle uploaded to the marketplace.",
        );
      }
    } catch (publishError) {
      console.error("Unable to publish custom puzzle.", publishError);
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Unable to publish custom puzzle.",
      );
    } finally {
      setPublishingId(undefined);
    }
  };

  const editorErrors = useMemo(
    () => editing ? validateCustomPuzzle(editing) : [],
    [editing],
  );

  const setPiece = (square: Square, piece?: Piece) => {
    updateEditing((draft) => {
      if (piece) draft.board[square] = piece;
      else delete draft.board[square];
      return draft;
    });
  };

  const placeCurrentTool = (square: Square) => {
    if (tool === "move") {
      if (selectedBoardSquare) {
        movePiece(selectedBoardSquare, square);
        setSelectedBoardSquare(undefined);
      } else if (editing?.board[square]) {
        setSelectedBoardSquare(square);
      }
      return;
    }
    if (tool === "erase") {
      setPiece(square);
    } else {
      setPiece(square, createPiece(square, tool, pieceColor));
    }
  };

  const movePiece = (source: Square, destination: Square) => {
    if (source === destination || !editing?.board[source]) return;
    updateEditing((draft) => {
      draft.board[destination] = draft.board[source];
      delete draft.board[source];
      return draft;
    });
  };

  const handleDrop = (
    event: DragEvent<HTMLButtonElement>,
    destination: Square,
  ) => {
    event.preventDefault();
    const source = event.dataTransfer.getData("application/god-chess-square");
    if (source && allSquares.includes(source)) {
      movePiece(source, destination);
      setSelectedBoardSquare(undefined);
      return;
    }
    const pieceType = event.dataTransfer.getData("application/god-chess-piece");
    const color = event.dataTransfer.getData("application/god-chess-color");
    if (
      PIECE_TYPES.includes(pieceType as PieceType) &&
      (color === "white" || color === "black")
    ) {
      setPiece(
        destination,
        createPiece(destination, pieceType as PieceType, color),
      );
    }
  };

  return (
    <div className="custom-puzzle-view">
      <section className="custom-puzzle-shell">
        {accountControl}
        <button className="puzzle-select-back" onClick={onBack}>
          <ArrowLeft size={17} />
          Puzzle types
        </button>
        <p className="eyebrow">CUSTOM PUZZLES</p>
        <h1>Create and challenge</h1>
        <p className="puzzle-select-intro">
          Build classic God Chess positions, prove your solution, and share them with other players.
        </p>
        <div className="custom-puzzle-tabs" role="tablist">
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            <Save size={16} /> My puzzles
          </button>
          <button
            className={tab === "editor" ? "active" : ""}
            onClick={() => editing ? setTab("editor") : openEditor()}
          >
            <Pencil size={16} /> Editor
          </button>
          <button
            className={tab === "marketplace" ? "active" : ""}
            onClick={() => setTab("marketplace")}
          >
            <Store size={16} /> Marketplace
          </button>
        </div>
        {error && <div className="save-error-banner" role="alert">{error}</div>}
        {message && <div className="custom-puzzle-success" role="status"><Check size={16} />{message}</div>}

        {tab === "library" && (
          <div className="custom-puzzle-library">
            <div className="custom-puzzle-section-heading">
              <div>
                <h2>Your puzzle drafts</h2>
                <p>Drafts stay on this device until you upload them.</p>
              </div>
              <button className="primary-button" onClick={() => openEditor()}>
                <Plus size={16} /> New puzzle
              </button>
            </div>
            {drafts.length === 0 ? (
              <div className="custom-puzzle-empty">
                <Store size={30} />
                <strong>No custom puzzles yet</strong>
                <span>Create a position and test it against the Divine AI.</span>
              </div>
            ) : (
              <div className="custom-puzzle-card-grid">
                {drafts.map((draft) => (
                  <article className="custom-puzzle-card" key={draft.id}>
                    <div>
                      <span className="custom-puzzle-badge">
                        {draft.playerColor} to move
                      </span>
                      <h3>{draft.title}</h3>
                      <p>{puzzleObjectiveLabel(draft)}</p>
                    </div>
                    <div className="custom-puzzle-card-status">
                      {customPuzzleIsVerified(draft)
                        ? <span className="verified"><Check size={14} /> Verified</span>
                        : <span>Test required before upload</span>}
                      {draft.uploadedPuzzleId && <span>Published</span>}
                    </div>
                    <div className="custom-puzzle-card-actions">
                      <button onClick={() => openEditor(draft)}>
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        onClick={() => onPlay({
                          puzzle: draft,
                          localDraftId: draft.id,
                        })}
                        disabled={validateCustomPuzzle(draft).length > 0}
                      >
                        <Play size={15} /> Play
                      </button>
                      <button
                        onClick={() => void publishDraft(draft)}
                        disabled={
                          publishingId === draft.id ||
                          !customPuzzleIsVerified(draft)
                        }
                      >
                        {publishingId === draft.id
                          ? <LoaderCircle className="spin" size={15} />
                          : <CloudUpload size={15} />}
                        {draft.uploadedPuzzleId ? "Update" : "Upload"}
                      </button>
                      <button
                        className="danger-text-button"
                        aria-label={`Delete ${draft.title}`}
                        onClick={() => {
                          if (!window.confirm(`Delete "${draft.title}" from this device?`)) return;
                          saveDrafts(drafts.filter((candidate) => candidate.id !== draft.id));
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "editor" && editing && (
          <div className="custom-puzzle-editor">
            <div className="custom-editor-main">
              <div className="custom-piece-toolbar">
                <div className="custom-color-switch" aria-label="Piece color">
                  {(["white", "black"] as const).map((color) => (
                    <button
                      key={color}
                      className={pieceColor === color ? "active" : ""}
                      onClick={() => setPieceColor(color)}
                    >
                      {color}
                    </button>
                  ))}
                </div>
                <div className="custom-piece-palette">
                  <button
                    className={tool === "move" ? "active" : ""}
                    onClick={() => {
                      setTool("move");
                      setSelectedBoardSquare(undefined);
                    }}
                  >
                    <MousePointer2 size={24} />
                    <small>move</small>
                  </button>
                  {PIECE_TYPES.map((pieceType) => (
                    <button
                      key={pieceType}
                      className={tool === pieceType ? "active" : ""}
                      aria-label={`Place ${pieceColor} ${pieceType}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/god-chess-piece", pieceType);
                        event.dataTransfer.setData("application/god-chess-color", pieceColor);
                      }}
                      onClick={() => {
                        setTool(pieceType);
                        setSelectedBoardSquare(undefined);
                      }}
                    >
                      <span className={`custom-piece-symbol ${pieceColor}`}>
                        {PIECE_SYMBOLS[pieceColor][pieceType]}
                      </span>
                      <small>{pieceType}</small>
                    </button>
                  ))}
                  <button
                    className={tool === "erase" ? "active" : ""}
                    onClick={() => {
                      setTool("erase");
                      setSelectedBoardSquare(undefined);
                    }}
                  >
                    <Eraser size={24} />
                    <small>erase</small>
                  </button>
                </div>
                <p>Drag a piece onto the board, or select a tool and click a square. Drag placed pieces to move them.</p>
              </div>
              <div className="custom-editor-board" aria-label="Custom puzzle board">
                {EDITOR_SQUARES.map((square) => {
                  const piece = editing.board[square];
                  const file = square.charCodeAt(0) - 96;
                  const rank = Number(square[1]);
                  return (
                    <button
                      key={square}
                      type="button"
                      className={`custom-editor-square ${(file + rank) % 2 === 0 ? "light" : "dark"} ${selectedBoardSquare === square ? "selected" : ""}`}
                      data-square={square}
                      onClick={() => placeCurrentTool(square)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setPiece(square);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(event, square)}
                    >
                      {piece && (
                        <span
                          className={`custom-piece-symbol ${piece.color}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/god-chess-square", square);
                          }}
                        >
                          {PIECE_SYMBOLS[piece.color][piece.type]}
                        </span>
                      )}
                      {square[1] === "1" && <small className="file-label">{square[0]}</small>}
                      {square[0] === "a" && <small className="rank-label">{square[1]}</small>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="custom-editor-config">
              <label>
                Puzzle title
                <input
                  value={editing.title}
                  maxLength={60}
                  onChange={(event) => updateEditing((draft) => {
                    draft.title = event.target.value;
                    return draft;
                  })}
                />
              </label>
              <div className="custom-config-row">
                <label>
                  Solver
                  <select
                    value={editing.playerColor}
                    onChange={(event) => updateEditing((draft) => {
                      draft.playerColor = event.target.value as Color;
                      return draft;
                    })}
                  >
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </label>
                <label>
                  Objective
                  <select
                    value={editing.objective}
                    onChange={(event) => updateEditing((draft) => {
                      draft.objective = event.target.value as CustomPuzzleDraft["objective"];
                      if (draft.objective === "escape-check") draft.turnLimit = 1;
                      return draft;
                    })}
                  >
                    <option value="capture-king">Capture opposing King</option>
                    <option value="escape-check">Escape checkmate</option>
                  </select>
                </label>
                <label>
                  Player turns
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={editing.objective === "escape-check"}
                    value={editing.objective === "escape-check" ? 1 : editing.turnLimit}
                    onChange={(event) => updateEditing((draft) => {
                      draft.turnLimit = Math.min(10, Math.max(1, Number(event.target.value) || 1));
                      return draft;
                    })}
                  />
                </label>
              </div>
              {(["white", "black"] as const).map((color) => (
                <section className="custom-player-config" key={color}>
                  <h3>{color} gods and orbs</h3>
                  <div className="custom-god-picker">
                    {GODS.map((god) => {
                      const selected = editing.players[color].gods.includes(god.id);
                      return (
                        <button
                          key={god.id}
                          type="button"
                          className={selected ? "selected" : ""}
                          onClick={() => updateEditing((draft) => {
                            const gods = draft.players[color].gods;
                            if (gods.includes(god.id)) {
                              draft.players[color].gods = gods.filter(
                                (godId) => godId !== god.id,
                              );
                            } else if (gods.length < 3) {
                              draft.players[color].gods = [...gods, god.id];
                            }
                            return draft;
                          })}
                        >
                          <span style={{ color: god.accent }}>{god.symbol}</span>
                          {god.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="custom-config-row">
                    {(["white", "black"] as const).map((orbColor) => (
                      <label key={orbColor}>
                        {orbColor} orbs
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={editing.players[color].orbs[orbColor]}
                          onChange={(event) => updateEditing((draft) => {
                            draft.players[color].orbs[orbColor] = Math.min(
                              20,
                              Math.max(0, Number(event.target.value) || 0),
                            );
                            return draft;
                          })}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              {editorErrors.length > 0 && (
                <div className="custom-editor-validation">
                  <strong>Before testing:</strong>
                  <ul>{editorErrors.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
              <div className="custom-editor-actions">
                <button className="secondary-button" onClick={persistEditing}>
                  <Save size={16} /> Save draft
                </button>
                <button
                  className="primary-button"
                  onClick={testDraft}
                  disabled={editorErrors.length > 0}
                >
                  <Play size={16} /> Test puzzle
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void publishDraft(editing)}
                  disabled={
                    publishingId === editing.id ||
                    !customPuzzleIsVerified(editing)
                  }
                >
                  <CloudUpload size={16} />
                  {editing.uploadedPuzzleId ? "Update upload" : "Upload"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "marketplace" && (
          <div className="custom-marketplace">
            <div className="custom-puzzle-section-heading">
              <div>
                <h2>Puzzle marketplace</h2>
                <p>Play positions created and verified by the God Chess community.</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void loadMarketplace()}
                disabled={marketplaceLoading}
              >
                <RefreshCw size={15} /> Refresh
              </button>
            </div>
            <div className="custom-marketplace-filters">
              <button
                className={!friendsOnly ? "active" : ""}
                onClick={() => setFriendsOnly(false)}
              >
                <Store size={15} /> All puzzles
              </button>
              <button
                className={friendsOnly ? "active" : ""}
                onClick={() => setFriendsOnly(true)}
                disabled={!account}
              >
                <Users size={15} /> Friends
              </button>
            </div>
            {marketplaceLoading ? (
              <div className="custom-puzzle-empty">
                <LoaderCircle className="spin" size={30} />
                <strong>Loading marketplace</strong>
              </div>
            ) : marketplace.length === 0 ? (
              <div className="custom-puzzle-empty">
                <Store size={30} />
                <strong>{friendsOnly ? "No friend puzzles yet" : "No published puzzles yet"}</strong>
                <span>{friendsOnly ? "Uploaded puzzles from accepted friends appear here." : "Be the first to upload a verified puzzle."}</span>
              </div>
            ) : (
              <div className="custom-puzzle-card-grid">
                {marketplace.map((entry) => (
                  <article className="custom-puzzle-card" key={entry.id}>
                    <div className="custom-marketplace-creator">
                      <AccountPortrait
                        portraitId={entry.creatorPortraitId}
                        className="custom-marketplace-portrait"
                        alt=""
                      />
                      <span>
                        <strong>{entry.creatorDisplayName}</strong>
                        <small>@{entry.creatorPublicId}</small>
                      </span>
                    </div>
                    <div>
                      <span className="custom-puzzle-badge">
                        {entry.puzzle.playerColor} to move
                      </span>
                      <h3>{entry.puzzle.title}</h3>
                      <p>{puzzleObjectiveLabel(entry.puzzle)}</p>
                    </div>
                    {entry.ownedByMe && entry.friendCompletions.length > 0 && (
                      <div className="custom-friend-completions">
                        <strong>Friends who solved it</strong>
                        <div>
                          {entry.friendCompletions.map((friend) => (
                            <span key={friend.publicId} title={friend.displayName}>
                              <AccountPortrait
                                portraitId={friend.portraitId}
                                className="custom-marketplace-portrait"
                                alt=""
                              />
                              {friend.displayName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="custom-puzzle-card-actions">
                      <button
                        className="primary-button"
                        onClick={() => onPlay({
                          puzzle: entry.puzzle,
                          marketplacePuzzleId: entry.id,
                        })}
                      >
                        <Play size={15} />
                        {entry.completedByMe ? "Play again" : "Play puzzle"}
                      </button>
                      {entry.completedByMe && (
                        <span className="verified"><Check size={14} /> Solved</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
