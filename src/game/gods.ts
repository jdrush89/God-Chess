import type { Ability, God, GodId, PieceType } from "./types";

const ability = (
  id: string,
  name: string,
  summary: string,
  kind: Ability["kind"],
  details: [string, string, string],
  cost?: Ability["cost"],
): Ability => ({ id, name, summary, kind, details, cost });

export const GODS: God[] = [
  {
    id: "quetzacoatl",
    name: "Quetzacoatl",
    epithet: "The Feathered Serpent",
    domain: "Sky",
    accent: "#62c8a9",
    symbol: "Q",
    abilities: [
      ability("flight", "Slither", "Move a piece. Gain orbs if you form a snake. A snake is 1 or more pieces that are diagonally adjacent to other pieces, and not orthogonally adjacent to any piece. Gain 1 white orb if the snake contains a white piece and 1 black orb if it contains a black piece.", "move", [
        "Gain 1 white orb if the snake contains a white piece and 1 black orb if it contains a black piece.",
        "If the snake is 2 or more pieces, gain an extra orb of your choice.",
        "Gain 1 orb per piece in the snake in addition to the extra from level 2. The orbs gained match the piece colors.",
      ]),
      ability("air-lift", "Air Lift", "Teleport the King to an empty space within 3 spaces.", "teleport", [
        "Range 3.",
        "The King may teleport within 4 spaces.",
        "The King may teleport within 5 spaces.",
      ], { white: 3 }),
      ability("air-strike", "Air Strike", "Move a piece that is adjacent to a friendly pawn. The piece picks up the pawn and may fly as it moves. The moved piece must land on an empty space, and the pawn must be dropped on an empty space along the flight path.", "multi-move", [
        "Pick up an adjacent friendly pawn and drop it on an empty crossed space.",
        "The passenger may instead capture the first enemy piece flown over.",
        "Also pick up an adjacent friendly knight or bishop. Either passenger may capture the first enemy piece flown over, but the other passenger must be dropped on an empty space along the movement path.",
      ], { black: 3 }),
    ],
  },
  {
    id: "chiron",
    name: "Chiron",
    epithet: "The Wise Centaur",
    domain: "Momentum",
    accent: "#d7a55d",
    symbol: "C",
    abilities: [
      ability("gallop", "Gallop", "Move a piece. If you move a knight, gain 1 white orb. If you capture a piece, gain 2 black orbs.", "move", [
        "Knights gain 1 white; captures gain 2 black.",
        "Increase each reward by 1: moving a knight gains 2 white orbs and capturing gains 3 black orbs.",
        "Increase each reward by 1 again: moving a knight gains 3 white orbs and capturing gains 4 black orbs.",
      ]),
      ability("mount", "Mount", "Move a knight. A friendly piece orthogonally adjacent to the knight may move with it. Choose an orthogonally adjacent spot to where the knight lands for the piece to dismount. The rider may not capture; the knight can. There must be space for a rider to come.", "move", [
        "Carry 1 adjacent ally.",
        "You may move up to 2 orthogonally adjacent friendly pieces with the knight and choose each dismount space.",
        "You may move up to 3 orthogonally adjacent friendly pieces with the knight and choose each dismount space.",
      ], { white: 1 }),
      ability("charge", "Charge", "Move a knight like a rook. You get a single move.", "move", [
        "Charge with one knight now.",
        "You can move any knight like a rook for 2 turns.",
        "You can move any knight like a rook until Chiron’s next turn.",
      ], { black: 4 }),
    ],
  },
  {
    id: "anubis",
    name: "Anubis",
    epithet: "The Eternal Architect",
    domain: "Fortification",
    accent: "#c7a44b",
    symbol: "A",
    abilities: [
      ability("construction", "Construction", "Move a piece. If you move 1 space, gain 1 black orb. You may choose not to move and gain 2 white orbs.", "move", [
        "Move 1 space for 1 black, or hold for 2 white.",
        "Gain 1 extra black orb if you move a pawn.",
        "Gain 1 extra black orb if you move a rook.",
      ]),
      ability("harden", "Harden", "Move a piece. Mark this piece as hardened. Hardened pieces can’t be captured and can’t move. Remove all hardened tokens after your opponent takes 2 turns.", "move", [
        "Harden for 2 enemy turns.",
        "When Harden would be removed, you may choose to remain hardened until Anubis’ next turn.",
        "You may remove the hardened marker early by moving the piece without capturing.",
      ], { white: 3 }),
      ability("monument", "Monument", "Sacrifice 3 pawns. Replace one of them with a rook.", "sacrifice", [
        "Sacrifice 3 pawns.",
        "Reduce the number of pawns required to 2.",
        "Reduce the number of pawns required to 1.",
      ], { black: 4 }),
    ],
  },
  {
    id: "teles",
    name: "Teles",
    epithet: "The Resonant",
    domain: "Influence",
    accent: "#72a9d8",
    symbol: "T",
    abilities: [
      ability("resonance", "Sing", "Move a piece. Gain 1 matching orb for every 2 pieces of that color orthogonally adjacent to the moved piece after moving.", "move", [
        "Gain 1 matching orb per 2 orthogonally adjacent pieces of that color.",
        "Gain 1 matching orb for every adjacent piece, including diagonals.",
        "Also gain 1 extra matching orb per 2 orthogonally adjacent pieces of that color.",
      ]),
      ability("lure", "Lure", "Choose one of your opponent’s pawns, knights, or bishops. Mark it as Lured. A Lured piece must be moved closer to your queen on the next turn if possible.", "target", [
        "Target pawns, knights, or bishops.",
        "You may also target rooks.",
        "You may also target queens.",
      ], { white: 2 }),
      ability("enchant", "Enchant", "Make one legal move with one of the opponent’s pawns, knights, or bishops, then make one legal move with one of your pieces.", "move", [
        "Control pawns, knights, or bishops.",
        "You may also move an opponent’s rook.",
        "You may also move an opponent’s queen.",
      ], { black: 4 }),
    ],
  },
  {
    id: "artemis",
    name: "Artemis",
    epithet: "The Moon Huntress",
    domain: "Ambush",
    accent: "#a7c9db",
    symbol: "R",
    abilities: [
      ability("take-cover", "Take Cover", "Move a piece. If the moved piece has a friendly piece directly in front of it after moving, gain 1 white orb. If you capture a piece, gain 2 black orbs.", "move", [
        "1 white for cover; captures gain 2 black.",
        "A friendly piece diagonally in front also qualifies for the 1 white orb.",
        "Gain 1 white orb for each friendly piece directly or diagonally in front.",
      ]),
      ability("stealth", "Stealth", "Plan a legal move with one of your pieces and remove that piece from the board. On your next turn, place the piece on the destination before taking an action, capturing any piece where it lands. The stealthed piece may not move again on your next turn.", "move", [
        "Return on the planned destination next turn.",
        "You can choose not to move to the planned location and return the piece to where it was. If you do, capture any piece that is currently there.",
        "You are allowed to move the piece again on your next turn.",
      ], { white: 2 }),
      ability("snipe", "Snipe", "Move a piece and then mark it as prepared. At the beginning of your next turn, that piece may capture any piece it is attacking without moving. If it captures with the prepared marker, it is stunned until the end of that turn. If you do not use the prepared shot, remove the marker.", "move", [
        "The prepared shot expires if it is not used on your next turn.",
        "Skipping the prepared shot does not remove the marker. It remains until Artemis’ next turn.",
        "The marker no longer expires when Artemis is called. It remains until the prepared shot is used.",
      ], { black: 3 }),
    ],
  },
  {
    id: "kangus",
    name: "Kangus Kong",
    epithet: "The Unbound",
    domain: "Chaos",
    accent: "#d9894c",
    symbol: "K",
    abilities: [
      ability("ritual-sacrifice", "Goad", "Move a piece. Until Kangus’ next turn, gain 2 of each orb if that piece is taken. If the moved piece is adjacent to a banana, gain 1 white orb.", "move", [
        "Until Kangus’ next turn, gain 2 of each orb if the piece is taken. Gain 1 white orb if it is adjacent to a banana.",
        "Gain 1 white orb for each adjacent banana.",
        "Gain 3 of each orb if the piece is taken.",
      ]),
      ability("banana-peel", "Banana Peel", "Move a piece, then leave a banana peel token in an orthogonally adjacent empty spot. It stays there until an opponent steps on it. That piece must stop moving.", "move", [
        "The banana stays until an opponent steps on it.",
        "You may throw the banana to any empty space within 2 spaces of the moved piece.",
        "Any opponent’s piece that steps on the banana is stunned for one turn. Stunned pieces cannot move or be moved by any abilities.",
      ], { white: 1 }),
      ability("rage", "Rage", "Choose a friendly piece and capture every piece on the 8 surrounding squares, including diagonals.", "target", [
        "Friendly pieces are also destroyed.",
        "You may choose not to capture friendly pieces.",
        "You may move the chosen piece 1 legal space before capturing adjacent pieces.",
      ], { black: 3 }),
    ],
  },
  {
    id: "death",
    name: "Death",
    epithet: "The Last Witness",
    domain: "Mortality",
    accent: "#9b86c8",
    symbol: "D",
    abilities: [
      ability("marked", "Marked", "Move a piece. At the end of Death’s next action, the Mark kills this piece and grants 3 black orbs. If the piece is captured or dies from another effect first, gain no Mark reward. A King cannot be killed by the Mark and grants no reward when it clears. You may choose to do nothing.", "move", [
        "The Mark grants 3 black orbs only if it kills a non-King piece at the end of Death’s next action.",
        "If you choose to do nothing, gain 1 white orb.",
        "You may execute the moved piece immediately for 5 black orbs instead; it does not also grant the delayed 3.",
      ]),
      ability("resurrect", "Resurrect", "Revive a piece from your graveyard. Place the piece in an empty spot adjacent to one of your Bishops. Requires a Bishop to use.", "revive", [
        "Revive 1 piece.",
        "You may spend 6 white orbs total to revive 2 pieces.",
        "Revived pieces do not need to spawn in empty spots and may capture a piece where they spawn.",
      ], { white: 4 }),
      ability("siphon", "Siphon", "Move a piece. It must end its move adjacent to an enemy piece. Steal up to 2 white orbs from the enemy player.", "move", [
        "Steal up to 2 white.",
        "Steal up to 2 white orbs from each of up to 2 adjacent enemy pieces.",
        "Steal up to 2 white orbs from each of up to 3 adjacent enemy pieces.",
      ], { black: 1 }),
    ],
  },
  {
    id: "leonidas",
    name: "Leonidas",
    epithet: "The Warrior King",
    domain: "Command",
    accent: "#cf6b5e",
    symbol: "L",
    abilities: [
      ability("royal-step", "Royal Step", "Move a piece. If you move the king, gain 1 black orb. If you move backwards, gain 1 white orb.", "move", [
        "King gains black; moving backward gains white.",
        "Also gain 1 black orb for moving a pawn.",
        "Also gain 1 white orb for moving sideways.",
      ]),
      ability("march-home", "March Home", "Teleport the King back to his starting space, capturing any piece that’s there.", "teleport", [
        "Recall the king.",
        "The King may take 1 adjacent piece with him. It stays in the same relative space and captures any piece there.",
        "The King may take any number of adjacent pieces with him.",
      ], { white: 2 }),
      ability("escort", "Escort", "Move the King 1 space, moving one adjacent friendly piece with him. The friendly piece captures any piece it lands on.", "move", [
        "Move 1 adjacent ally.",
        "The King may move all adjacent friendly pieces with him.",
        "The King and his escorts may move 2 spaces in any 1 direction.",
      ], { black: 2 }),
    ],
  },
  {
    id: "medusa",
    name: "Medusa",
    epithet: "The Veiled Gorgon",
    domain: "Sight",
    accent: "#78aa73",
    symbol: "M",
    abilities: [
      ability("captivate", "Captivate", "Move a piece. For each queen that piece is in line of sight with, gain 1 orb of the respective color. The queen is always in line of sight with herself.", "move", [
        "Gain 1 orb per visible queen.",
        "If the piece moves from out of a queen’s line of sight into that queen’s line of sight, gain 2 matching orbs from that queen instead.",
        "If the piece moves into a queen’s line of sight, gain 3 matching orbs from that queen instead.",
      ]),
      ability("slither", "Serpentine Step", "Move the queen or a pawn diagonally twice without capturing.", "multi-move", [
        "Move the queen or a pawn diagonally twice.",
        "The queen can move diagonally three times. A pawn still moves twice.",
        "The queen can move diagonally any number of times. A pawn still moves twice.",
      ], { white: 1 }),
      ability("stone-gaze", "Stone Gaze", "All pieces within line of sight of your Queen, friendly and enemy, can’t move for 2 turns. The Queen can’t move while any of them remain frozen.", "target", [
        "Stone all pieces in the Queen’s line of sight for 2 turns.",
        "Those pieces can’t move for 3 turns.",
        "Those pieces can’t move until Medusa’s next turn.",
      ], { black: 3 }),
    ],
  },
  {
    id: "salem",
    name: "Salem",
    epithet: "The Ashen Witch",
    domain: "Curses",
    accent: "#bb77b7",
    symbol: "S",
    abilities: [
      ability("hex", "Hex", "If there are no currently hexed living pieces, choose up to 2 enemy pieces to mark as hexed. Move a piece. Gain 1 orb matching the color of the space you landed on for each hexed piece in the same row or column.", "move", [
        "Maintain up to 2 hexes. Gain 1 matching orb per hexed piece aligned by row or column.",
        "When placing hexes, you can hex up to 3 pieces.",
        "Hexed pieces also count as aligned when they are on the same diagonal.",
      ]),
      ability("poison-cloud", "Poison Cloud", "Choose an opponent’s piece and mark it as poisoned. That piece may not move more than 3 spaces in a turn until it moves.", "target", [
        "Poison 1 piece.",
        "Choose a 1×2 or 2×1 area; every opponent’s piece in that area is poisoned.",
        "Choose a 2×2 area; every opponent’s piece in that area is poisoned.",
      ], { white: 3 }),
      ability("polymorph", "Polymorph", "Choose an opponent’s piece. Mark that piece as polymorphed. It moves like a pawn for 2 turns.", "target", [
        "Lasts 2 turns.",
        "The polymorph lasts 3 turns.",
        "The polymorph lasts until Salem’s next turn.",
      ], { black: 3 }),
    ],
  },
  {
    id: "midas",
    name: "Midas",
    epithet: "The Gilded Magnate",
    domain: "Commerce",
    accent: "#e1bd55",
    symbol: "I",
    abilities: [
      ability("barter", "Barter", "Move a piece. If it lands adjacent to an enemy piece, you may give the opponent 1 orb of your choice and take 2 orbs of the opposite color.", "move", [
        "Trade 1 for 2.",
        "When trading, also gain 1 orb matching the color of the space you landed on.",
        "When trading, take 3 orbs of the opposite color from your opponent instead of 2.",
      ]),
      ability("military-funding", "Military Funding", "Move 2 pawns.", "multi-move", [
        "Move 2 pawns.",
        "You may move any number of pawns, paying 1 white orb for each move past the first.",
        "If none of the moves this turn capture or promote, you may move the same pawn multiple times, still paying 1 white orb for each move past the first.",
      ], { white: 1 }),
      ability("leverage", "Leverage", "Move a piece, then choose an adjacent enemy pawn, bishop, or knight. Give that piece’s controller the 4 black orbs used to pay for this ability. Mark that piece as hired; you now control it.", "move", [
        "Hire pawns, bishops, or knights.",
        "You may hire a rook for 5 black orbs; give all 5 orbs to its controller.",
        "You may hire a queen for 6 black orbs; give all 6 orbs to its controller.",
      ], { black: 4 }),
    ],
  },
  {
    id: "ares",
    name: "Ares",
    epithet: "The Red Spear",
    domain: "Conflict",
    accent: "#d35f54",
    symbol: "X",
    abilities: [
      ability("threaten", "Threaten", "Move a piece. Gain 1 black orb if that piece is attacking an enemy piece. Gain 1 white orb if that piece is your farthest advanced piece; ties don’t count.", "move", [
        "Gain black for a threat and white for an uncontested lead.",
        "Ties count for the white-orb reward. Gain 1 extra white orb if the moved piece is the sole farthest advanced piece.",
        "Gain 1 black orb for each enemy piece being attacked instead of only 1 black orb.",
      ]),
      ability("pick-a-fight", "Pick a Fight", "Teleport a knight or bishop to an empty space where it is being attacked.", "move", [
        "Teleport a knight or bishop to an empty space where it is being attacked.",
        "It may instead teleport to an empty space where it attacks 2 enemy pieces.",
        "You may teleport any type of piece to an empty space where it is being attacked.",
      ], { white: 2 }),
      ability("cull-the-weak", "Cull the Weak", "Move a piece to a spot where it is attacking multiple pieces. Capture the lowest point value piece that it is attacking.", "move", [
        "Capture the lowest-value attacked piece.",
        "You may instead capture an attacked knight or bishop, even if it is not the lowest value, but must then move to its space.",
        "You may also capture an attacked rook this way.",
      ], { black: 3 }),
    ],
  },
];

export const GOD_BY_ID = Object.fromEntries(GODS.map((god) => [god.id, god])) as Record<GodId, God>;

export const abilityLevel = (upgrades: Record<string, 1 | 2 | 3>, abilityId: string) =>
  upgrades[abilityId] ?? 1;

export const canUsePickAFightDestination = (
  level: 1 | 2 | 3,
  pieceType: PieceType,
  attacked: boolean,
  attacksTwo: boolean,
) => {
  const isOriginalPieceType =
    pieceType === "knight" || pieceType === "bishop";
  return (
    attacked && (isOriginalPieceType || level >= 3)
  ) || (
    attacksTwo && isOriginalPieceType && level >= 2
  );
};
