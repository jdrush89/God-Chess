import type {
  CSSProperties,
  ReactNode,
  SVGProps,
} from "react";
import type { AchievementId, AchievementProgress } from "./achievements";
import type { Color, PieceType } from "./game/types";

export const PIECE_THEME_IDS = ["classic", "mushroom", "gargoyle"] as const;

export type PieceThemeId = (typeof PIECE_THEME_IDS)[number];

export const DEFAULT_PIECE_THEME_ID: PieceThemeId = "classic";

export const PIECE_THEME_OPTIONS: ReadonlyArray<{
  id: PieceThemeId;
  name: string;
  description: string;
  unlockAchievementId?: AchievementId;
  unlockDescription?: string;
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
  {
    id: "gargoyle",
    name: "Gargoyle",
    description: "Winged stone guardians carved for every rank.",
    unlockAchievementId: "consistency",
    unlockDescription: "Complete the Consistency challenge.",
  },
];

export const pieceThemeIsUnlocked = (
  theme: PieceThemeId,
  completedAchievements: AchievementProgress["completed"],
) => {
  const option = PIECE_THEME_OPTIONS.find((candidate) => candidate.id === theme);
  return !option?.unlockAchievementId ||
    Boolean(completedAchievements[option.unlockAchievementId]);
};

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
          className="mushroom-piece-finial-stem"
          d="M38 21 L35 10 M50 17 V5 M62 21 L66 10"
        />
        <circle className="mushroom-piece-finial" cx="34" cy="8" r="4.5" />
        <circle className="mushroom-piece-finial" cx="50" cy="4.5" r="5" />
        <circle className="mushroom-piece-finial" cx="67" cy="8" r="4.5" />
        <path
          className="mushroom-piece-cap"
          d="M9 42 Q17 19 31 16 Q50 10 69 16 Q83 19 91 42 L81 54 L71 44 L60 57 L50 45 L40 57 L29 44 L19 54 Z"
        />
        <path className="mushroom-piece-gill" d="M15 41 Q50 29 85 41 Q70 52 50 53 Q30 52 15 41 Z" />
        <path className="mushroom-piece-collar" d="M34 55 L42 64 L50 55 L58 64 L66 55" />
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

const GargoyleBase = ({ children }: { children?: ReactNode }) => (
  <>
    <path
      className="gargoyle-piece-base"
      d="M20 91 Q50 82 80 91 L75 98 H25 Z"
    />
    <path
      className="gargoyle-piece-base-shadow"
      d="M28 91 Q50 87 72 91 L68 95 H32 Z"
    />
    {children}
  </>
);

const GargoyleEyes = ({
  left = 44,
  right = 56,
  y = 37,
}: {
  left?: number;
  right?: number;
  y?: number;
}) => (
  <>
    <path className="gargoyle-piece-brow" d={`M${left - 5} ${y - 4} L${left + 3} ${y - 2}`} />
    <path className="gargoyle-piece-brow" d={`M${right + 5} ${y - 4} L${right - 3} ${y - 2}`} />
    <circle className="gargoyle-piece-eye" cx={left} cy={y} r="2.1" />
    <circle className="gargoyle-piece-eye" cx={right} cy={y} r="2.1" />
  </>
);

function GargoylePieceArt({ type }: { type: PieceType }) {
  if (type === "pawn") {
    return (
      <GargoyleBase>
        <path
          className="gargoyle-piece-wing"
          d="M39 55 L27 49 L30 64 L22 70 L39 77 Z M61 55 L73 49 L70 64 L78 70 L61 77 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M39 48 Q34 63 38 86 Q50 91 62 86 Q66 63 61 48 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M36 30 L32 19 L43 25 Q50 20 57 25 L68 19 L64 30 Q67 41 60 48 Q50 54 40 48 Q33 41 36 30 Z"
        />
        <path className="gargoyle-piece-detail" d="M44 43 Q50 48 56 43 M50 44 V39" />
        <GargoyleEyes left={45} right={55} y={36} />
      </GargoyleBase>
    );
  }

  if (type === "rook") {
    return (
      <GargoyleBase>
        <path
          className="gargoyle-piece-wing"
          d="M31 49 L13 43 L20 61 L10 69 L34 77 Z M69 49 L87 43 L80 61 L90 69 L66 77 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M22 17 H35 V29 H44 V16 H56 V29 H65 V17 H78 L74 47 L67 53 L70 87 Q50 93 30 87 L33 53 L26 47 Z"
        />
        <path
          className="gargoyle-piece-shadow"
          d="M33 55 H67 L64 83 Q50 89 36 83 Z"
        />
        <path className="gargoyle-piece-detail" d="M27 47 H73 M39 39 H61 M42 58 V79 M58 58 V79" />
        <GargoyleEyes left={42} right={58} y={38} />
      </GargoyleBase>
    );
  }

  if (type === "bishop") {
    return (
      <GargoyleBase>
        <path
          className="gargoyle-piece-wing"
          d="M42 46 L24 34 L28 59 L20 72 L42 82 Z M58 46 L76 34 L72 59 L80 72 L58 82 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M50 4 L70 31 L61 49 Q67 67 64 88 Q50 94 36 88 Q33 67 39 49 L30 31 Z"
        />
        <path className="gargoyle-piece-shadow" d="M40 55 Q50 61 60 55 L58 84 Q50 89 42 84 Z" />
        <path className="gargoyle-piece-slit" d="M60 16 L39 45" />
        <path className="gargoyle-piece-detail" d="M43 48 Q50 53 57 48 M50 58 V82" />
        <GargoyleEyes left={44} right={56} y={40} />
      </GargoyleBase>
    );
  }

  if (type === "knight") {
    return (
      <GargoyleBase>
        <path
          className="gargoyle-piece-wing"
          d="M43 55 L20 42 L27 64 L14 72 L43 84 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M30 87 Q38 67 36 53 Q34 38 46 24 L54 9 L62 24 Q79 23 88 37 L72 43 L82 52 L66 60 L57 53 Q56 70 70 87 Q50 94 30 87 Z"
        />
        <path
          className="gargoyle-piece-horn"
          d="M53 17 L42 5 L58 10 Z M69 27 L75 12 L80 29 Z"
        />
        <path className="gargoyle-piece-detail" d="M68 48 L78 49 M52 56 Q45 69 44 83" />
        <circle className="gargoyle-piece-eye" cx="69" cy="35" r="2.7" />
      </GargoyleBase>
    );
  }

  if (type === "queen") {
    return (
      <GargoyleBase>
        <path
          className="gargoyle-piece-wing"
          d="M40 48 L12 21 L17 54 L5 67 L40 82 Z M60 48 L88 21 L83 54 L95 67 L60 82 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M38 45 Q29 65 33 88 Q50 95 67 88 Q71 65 62 45 Z"
        />
        <path
          className="gargoyle-piece-stone"
          d="M27 22 L39 28 L43 9 L50 25 L57 9 L61 28 L73 22 L65 42 Q50 51 35 42 Z"
        />
        <circle className="gargoyle-piece-jewel" cx="50" cy="11" r="4.2" />
        <path className="gargoyle-piece-detail" d="M40 42 Q50 50 60 42 M40 59 L50 68 L60 59" />
        <GargoyleEyes left={43} right={57} y={36} />
      </GargoyleBase>
    );
  }

  return (
    <GargoyleBase>
      <path
        className="gargoyle-piece-wing"
        d="M36 50 L8 38 L17 61 L5 76 L39 84 Z M64 50 L92 38 L83 61 L95 76 L61 84 Z"
      />
      <path
        className="gargoyle-piece-stone"
        d="M33 43 Q25 64 30 88 Q50 96 70 88 Q75 64 67 43 L60 34 H40 Z"
      />
      <path
        className="gargoyle-piece-stone"
        d="M31 23 L41 28 L45 15 H55 L59 28 L69 23 L64 41 Q50 51 36 41 Z"
      />
      <path className="gargoyle-piece-cross" d="M50 17 V1 M41 8 H59" />
      <path className="gargoyle-piece-detail" d="M39 42 Q50 50 61 42 M36 58 H64 M42 58 V82 M58 58 V82" />
      <GargoyleEyes left={43} right={57} y={36} />
    </GargoyleBase>
  );
}

export function GargoylePieceSvg({
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
      className={`gargoyle-piece-glyph ${className}`.trim()}
      viewBox="0 0 100 100"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <GargoylePieceArt type={type} />
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
      <GargoylePieceSvg type={type} />
    </span>
  );
}

applyPieceTheme(loadPieceThemePreference());
