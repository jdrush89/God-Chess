import type {
  CSSProperties,
  ReactNode,
  SVGProps,
} from "react";
import type { Color, PieceType } from "./game/types";

export const PIECE_THEME_IDS = ["classic", "mushroom"] as const;

export type PieceThemeId = (typeof PIECE_THEME_IDS)[number];

export const DEFAULT_PIECE_THEME_ID: PieceThemeId = "classic";

export const PIECE_THEME_OPTIONS: ReadonlyArray<{
  id: PieceThemeId;
  name: string;
  description: string;
}> = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional chess symbols.",
  },
  {
    id: "mushroom",
    name: "Mushroom",
    description: "Hand-sculpted fungal pieces with distinct silhouettes.",
  },
];

export const CLASSIC_PIECE_SYMBOLS: Record<
  Color,
  Record<PieceType, string>
> = {
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

const PIECE_THEME_STORAGE_KEY = "god-chess-piece-theme";

export const normalizePieceThemeId = (value: unknown): PieceThemeId =>
  PIECE_THEME_IDS.includes(value as PieceThemeId)
    ? value as PieceThemeId
    : DEFAULT_PIECE_THEME_ID;

export const applyPieceTheme = (theme: PieceThemeId) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.pieceTheme = normalizePieceThemeId(theme);
};

export const loadPieceThemePreference = (): PieceThemeId => {
  if (typeof window === "undefined") return DEFAULT_PIECE_THEME_ID;
  try {
    return normalizePieceThemeId(
      window.localStorage.getItem(PIECE_THEME_STORAGE_KEY),
    );
  } catch (error) {
    console.error("Unable to load the piece theme.", error);
    return DEFAULT_PIECE_THEME_ID;
  }
};

export const savePieceThemePreference = (theme: PieceThemeId) => {
  const normalized = normalizePieceThemeId(theme);
  applyPieceTheme(normalized);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PIECE_THEME_STORAGE_KEY, normalized);
  } catch (error) {
    console.error("Unable to save the piece theme.", error);
  }
};

const MushroomStem = ({ children }: { children?: ReactNode }) => (
  <>
    <path
      className="mushroom-piece-base"
      d="M25 91 Q50 81 75 91 L70 98 H30 Z"
    />
    <path
      className="mushroom-piece-stem"
      d="M38 44 Q39 65 33 87 Q50 94 67 87 Q61 65 62 44 Z"
    />
    <path
      className="mushroom-piece-stem-shade"
      d="M50 48 Q47 69 43 87 Q50 90 57 87 Q53 66 54 48 Z"
    />
    {children}
  </>
);

const MushroomSpots = ({ wide = false }: { wide?: boolean }) => (
  <>
    <ellipse className="mushroom-piece-spot" cx={wide ? 30 : 37} cy="31" rx="4" ry="2.5" />
    <ellipse className="mushroom-piece-spot" cx={wide ? 63 : 59} cy="24" rx="3" ry="2" />
    <ellipse className="mushroom-piece-spot" cx={wide ? 73 : 67} cy="35" rx="2.5" ry="1.8" />
  </>
);

function MushroomPieceArt({ type }: { type: PieceType }) {
  if (type === "pawn") {
    return (
      <MushroomStem>
        <path
          className="mushroom-piece-cap"
          d="M22 45 Q24 16 50 14 Q76 16 78 45 Q69 52 50 52 Q31 52 22 45 Z"
        />
        <path className="mushroom-piece-gill" d="M27 44 Q50 35 73 44 Q63 52 50 52 Q37 52 27 44 Z" />
        <MushroomSpots />
      </MushroomStem>
    );
  }

  if (type === "rook") {
    return (
      <MushroomStem>
        <path
          className="mushroom-piece-cap"
          d="M20 19 H34 V29 H43 V18 H57 V29 H66 V19 H80 L77 48 Q50 57 23 48 Z"
        />
        <path className="mushroom-piece-gill" d="M25 45 Q50 38 75 45 Q64 53 50 53 Q36 53 25 45 Z" />
        <MushroomSpots wide />
      </MushroomStem>
    );
  }

  if (type === "bishop") {
    return (
      <MushroomStem>
        <path
          className="mushroom-piece-cap"
          d="M50 8 Q73 27 72 45 Q63 54 50 55 Q37 54 28 45 Q27 27 50 8 Z"
        />
        <path className="mushroom-piece-gill" d="M32 44 Q50 37 68 44 Q62 53 50 55 Q38 53 32 44 Z" />
        <path className="mushroom-piece-cut" d="M60 17 L41 45" />
        <MushroomSpots />
      </MushroomStem>
    );
  }

  if (type === "knight") {
    return (
      <>
        <path
          className="mushroom-piece-base"
          d="M22 91 Q49 80 78 91 L72 98 H28 Z"
        />
        <path
          className="mushroom-piece-stem"
          d="M32 88 Q43 70 39 52 Q36 37 49 23 Q60 12 76 16 L68 28 Q81 32 75 45 Q68 57 58 54 L54 47 Q57 69 68 88 Q50 95 32 88 Z"
        />
        <path
          className="mushroom-piece-cap"
          d="M29 58 Q26 34 47 18 Q60 8 78 15 L70 27 Q56 26 51 40 Q47 52 54 65 Z"
        />
        <path className="mushroom-piece-cut" d="M38 53 Q43 31 63 20" />
        <circle className="mushroom-piece-eye" cx="67" cy="34" r="2.2" />
      </>
    );
  }

  if (type === "queen") {
    return (
      <MushroomStem>
        <path
          className="mushroom-piece-cap"
          d="M12 42 Q19 17 50 15 Q81 17 88 42 L79 53 L70 45 L60 55 L50 46 L40 55 L30 45 L21 53 Z"
        />
        <path className="mushroom-piece-gill" d="M18 42 Q50 32 82 42 Q69 51 50 51 Q31 51 18 42 Z" />
        <path className="mushroom-piece-collar" d="M37 54 L43 61 L50 55 L57 61 L63 54" />
        <MushroomSpots wide />
      </MushroomStem>
    );
  }

  return (
    <MushroomStem>
      <path
        className="mushroom-piece-cap"
        d="M15 43 Q20 16 50 14 Q80 16 85 43 Q74 55 50 55 Q26 55 15 43 Z"
      />
      <path className="mushroom-piece-gill" d="M21 43 Q50 32 79 43 Q68 53 50 55 Q32 53 21 43 Z" />
      <path className="mushroom-piece-crown" d="M35 18 L31 10 L42 13 L50 4 L58 13 L69 10 L65 18" />
      <path className="mushroom-piece-cross" d="M47 13 V2 M41 7 H53" />
      <MushroomSpots wide />
    </MushroomStem>
  );
}

export function MushroomPieceSvg({
  type,
  className = "",
  style,
  ...svgProps
}: {
  type: PieceType;
  className?: string;
  style?: CSSProperties;
} & Omit<SVGProps<SVGSVGElement>, "type">) {
  return (
    <svg
      {...svgProps}
      className={`mushroom-piece-glyph ${className}`.trim()}
      viewBox="0 0 100 100"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <MushroomPieceArt type={type} />
    </svg>
  );
}

export function PieceThemeSymbol({
  type,
  classicColor,
  className = "",
  style,
}: {
  type: PieceType;
  classicColor: Color;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`piece-theme-symbol piece-theme-${classicColor === "white" ? "light" : "dark"} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    >
      <span className="classic-piece-glyph">
        {CLASSIC_PIECE_SYMBOLS[classicColor][type]}
      </span>
      <MushroomPieceSvg type={type} />
    </span>
  );
}

applyPieceTheme(loadPieceThemePreference());
