import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/game/gods.ts");
const portraitsPath = path.join(root, "src/assets/gods");
const outputPath = path.join(root, "public/printables");
const pt = 72;
const boardWidth = 11 * pt;
const boardHeight = 8.5 * pt;
const letterWidth = 8.5 * pt;
const letterHeight = 11 * pt;

const ability = (id, name, summary, kind, details, cost) => ({
  id,
  name,
  summary,
  kind,
  details,
  cost,
});

const loadGods = () => {
  const source = fs.readFileSync(sourcePath, "utf8");
  const prefix = "export const GODS: God[] = ";
  const start = source.indexOf(prefix);
  const end = source.indexOf("\n\nexport const GOD_BY_ID", start);
  if (start < 0 || end < 0) throw new Error("Unable to locate GODS in src/game/gods.ts");
  const expression = source.slice(start + prefix.length, end).replace(/;\s*$/, "");
  return Function("ability", `"use strict"; return (${expression});`)(ability);
};

const hexToRgb = (hex) => {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
};

const mix = (first, second, amount) => {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const channel = (key) => Math.round(a[key] + (b[key] - a[key]) * amount);
  return `#${["r", "g", "b"].map((key) => channel(key).toString(16).padStart(2, "0")).join("")}`;
};

const drawCoverImage = (doc, imagePath, x, y, width, height) => {
  const image = doc.openImage(imagePath);
  const scale = Math.max(width / image.width, height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  doc.save();
  doc.rect(x, y, width, height).clip();
  doc.image(
    image,
    x + (width - renderedWidth) / 2,
    y + (height - renderedHeight) / 2,
    { width: renderedWidth, height: renderedHeight },
  );
  doc.restore();
};

const fitText = (doc, text, x, y, width, height, options = {}) => {
  const {
    font = "Helvetica",
    maxSize = 9,
    minSize = 6.2,
    color = "#e9e5dc",
    lineGap = 1,
    align = "left",
  } = options;
  let size = maxSize;
  doc.font(font);
  while (size > minSize) {
    doc.fontSize(size);
    if (doc.heightOfString(text, { width, lineGap, align }) <= height) break;
    size -= 0.2;
  }
  doc.fillColor(color).font(font).fontSize(size).text(text, x, y, {
    width,
    height,
    lineGap,
    align,
  });
};

const drawOrb = (doc, x, y, color, amount) => {
  const fill = color === "white" ? "#f3f0df" : "#262532";
  const stroke = color === "white" ? "#cbbf92" : "#8d7aa5";
  doc.circle(x, y, 9).fillAndStroke(fill, stroke);
  doc.fillColor(color === "white" ? "#28231b" : "#f3ecff")
    .font("Helvetica-Bold")
    .fontSize(7)
    .text(String(amount), x - 9, y - 3, { width: 18, align: "center" });
};

const drawAbilityLevelTrack = (doc, x, y, accent) => {
  doc.fillColor("#a79d85").font("Helvetica-Bold").fontSize(5.5)
    .text("ABILITY LEVEL", x - 8, y - 23, { width: 98, align: "center", characterSpacing: 0.8 });
  [1, 2, 3].forEach((level, index) => {
    const cx = x + index * 31;
    doc.save();
    doc.dash(3, { space: 2 });
    doc.circle(cx, y, 13.5).lineWidth(1.2).strokeColor(mix(accent, "#ffffff", 0.25)).stroke();
    doc.restore();
    doc.circle(cx, y, 10.2).lineWidth(0.5).strokeColor("#5b554b").stroke();
    doc.fillColor("#d7d0bf").font("Helvetica-Bold").fontSize(7)
      .text(String(level), cx - 8, y - 2.5, { width: 16, align: "center" });
  });
};

const drawAbility = (doc, god, abilityData, index, x, y, width, height) => {
  const panel = mix(god.accent, "#11131a", 0.86);
  const edge = mix(god.accent, "#ffffff", 0.08);
  const contentWidth = width - 142;
  doc.roundedRect(x, y, width, height, 8).fillAndStroke(panel, edge);
  doc.rect(x, y, 7, height).fill(god.accent);
  doc.fillColor(mix(god.accent, "#ffffff", 0.35))
    .font("Times-Bold")
    .fontSize(10)
    .text(["I", "II", "III"][index], x + 18, y + 13, { width: 18 });
  doc.fillColor("#f7f1e4").font("Times-Bold").fontSize(15)
    .text(abilityData.name.toUpperCase(), x + 42, y + 10, { width: contentWidth - 42 });

  const costs = Object.entries(abilityData.cost ?? {});
  costs.forEach(([color, amount], costIndex) => {
    drawOrb(doc, x + contentWidth - 2 - costIndex * 25, y + 19, color, amount);
  });
  if (!costs.length) {
    doc.fillColor("#8e8778").font("Helvetica-Bold").fontSize(6)
      .text("FREE", x + contentWidth - 38, y + 15, { width: 36, align: "right", characterSpacing: 0.6 });
  }

  doc.fillColor("#8e8778").font("Helvetica-Bold").fontSize(5.8)
    .text("BASE", x + 20, y + 37, { width: 34, characterSpacing: 0.7 });
  fitText(doc, abilityData.summary, x + 56, y + 35, contentWidth - 60, 43, {
    font: "Helvetica",
    maxSize: 8.5,
    minSize: 6.4,
    color: "#eee9df",
    lineGap: 0.7,
  });

  const upgradeY = y + 81;
  const upgradeWidth = (contentWidth - 36) / 2;
  doc.moveTo(x + 20, upgradeY - 5).lineTo(x + contentWidth, upgradeY - 5)
    .lineWidth(0.45).strokeColor("#4f4b45").stroke();
  doc.fillColor(mix(god.accent, "#ffffff", 0.25)).font("Helvetica-Bold").fontSize(6.2)
    .text("LV 2", x + 20, upgradeY, { width: 26 });
  fitText(doc, abilityData.details[1], x + 48, upgradeY - 1, upgradeWidth - 30, height - 84, {
    font: "Helvetica",
    maxSize: 7.2,
    minSize: 5.8,
    color: "#cfc9bb",
    lineGap: 0.4,
  });
  doc.fillColor(mix(god.accent, "#ffffff", 0.25)).font("Helvetica-Bold").fontSize(6.2)
    .text("LV 3", x + 20 + upgradeWidth, upgradeY, { width: 26 });
  fitText(doc, abilityData.details[2], x + 48 + upgradeWidth, upgradeY - 1, upgradeWidth - 28, height - 84, {
    font: "Helvetica",
    maxSize: 7.2,
    minSize: 5.8,
    color: "#cfc9bb",
    lineGap: 0.4,
  });

  doc.moveTo(x + contentWidth + 10, y + 10).lineTo(x + contentWidth + 10, y + height - 10)
    .lineWidth(0.5).strokeColor(edge).stroke();
  drawAbilityLevelTrack(doc, x + contentWidth + 31, y + height / 2 + 8, god.accent);
};

const drawGodBoard = (doc, god, pageIndex) => {
  doc.addPage({ size: "LETTER", layout: "landscape", margin: 0 });
  const imagePath = path.join(portraitsPath, `${god.id}.jpg`);
  const heroHeight = 218;
  const deep = mix(god.accent, "#090b12", 0.86);
  doc.rect(0, 0, boardWidth, boardHeight).fill("#0d0f15");
  drawCoverImage(doc, imagePath, 0, 0, boardWidth, heroHeight);
  doc.save().fillOpacity(0.46).rect(0, 0, boardWidth, heroHeight).fill(deep).restore();
  doc.save().fillOpacity(0.72).rect(0, heroHeight - 78, boardWidth, 78).fill("#07090d").restore();
  doc.rect(0, heroHeight - 5, boardWidth, 5).fill(god.accent);

  doc.fillColor(mix(god.accent, "#ffffff", 0.4)).font("Helvetica-Bold").fontSize(7)
    .text(`GOD CHESS  /  ${god.domain.toUpperCase()}`, 28, 24, {
      width: 430,
      characterSpacing: 1.5,
    });
  doc.fillColor("#fffaf0").font("Times-Bold").fontSize(35)
    .text(god.name.toUpperCase(), 27, heroHeight - 71, { width: 560 });
  doc.fillColor("#d8d0bd").font("Times-Italic").fontSize(13)
    .text(god.epithet, 29, heroHeight - 34, { width: 500 });

  const restX = boardWidth - 60;
  const restY = 55;
  doc.save();
  doc.dash(4, { space: 3 });
  doc.circle(restX, restY, 25).lineWidth(1.8)
    .strokeColor(mix(god.accent, "#ffffff", 0.35)).stroke();
  doc.restore();
  doc.circle(restX, restY, 20.5).lineWidth(0.6).strokeColor("#d8d0bd").stroke();
  doc.fillColor("#fffaf0").font("Helvetica-Bold").fontSize(8)
    .text("REST", restX - 23, restY - 3, { width: 46, align: "center", characterSpacing: 1 });
  doc.fillColor("#c7beaa").font("Helvetica").fontSize(6)
    .text("PLACE MARKER", restX - 40, restY + 32, { width: 80, align: "center", characterSpacing: 0.5 });

  const panelX = 24;
  const panelWidth = boardWidth - 48;
  const panelHeight = 112;
  const startY = 229;
  god.abilities.forEach((abilityData, index) => {
    drawAbility(doc, god, abilityData, index, panelX, startY + index * 119, panelWidth, panelHeight);
  });

  doc.fillColor("#777166").font("Helvetica").fontSize(5.8)
    .text(
      "Place one level marker on each ability track. After this god acts, place a rest marker in the rest well. Remove all rest markers after every drafted god has acted.",
      28,
      boardHeight - 17,
      { width: boardWidth - 56, align: "center", characterSpacing: 0.15 },
    );
};

const writeGodBoards = async (gods) => {
  const filePath = path.join(outputPath, "god-chess-god-boards.pdf");
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: "LETTER",
    layout: "landscape",
    margin: 0,
    info: {
      Title: "God Chess - Printable God Boards",
      Author: "God Chess",
      Subject: "US Letter printable character boards",
    },
  });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  gods.forEach((god, index) => drawGodBoard(doc, god, index));
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};

const tokenPalette = {
  rest: ["#9a8050", "#f6e7b2"],
  level: ["#516b78", "#def4ff"],
  white: ["#ece8d8", "#2b2924"],
  black: ["#282631", "#f4efff"],
  hardened: ["#82755b", "#fff2c5"],
  stone: ["#626b70", "#f0f5f7"],
  gazing: ["#456f53", "#e5ffe9"],
  poisoned: ["#587139", "#eeffd8"],
  polymorphed: ["#8b5c96", "#ffe9ff"],
  lured: ["#4d7797", "#e7f6ff"],
  hexed: ["#74466f", "#ffe7fb"],
  prepared: ["#46697d", "#e4f6ff"],
  ritual: ["#8f4d3d", "#ffe9dd"],
  marked: ["#5e465f", "#f8e4ff"],
  hired: ["#8d6f2e", "#fff2bd"],
  charged: ["#9b5a36", "#ffead8"],
  banana: ["#b99b28", "#211d0d"],
  stealth: ["#343d58", "#e7ecff"],
};

const drawToken = (doc, token, x, y, diameter) => {
  const [fill, text] = tokenPalette[token.kind];
  const radius = diameter / 2;
  doc.save();
  doc.dash(2.5, { space: 2 });
  doc.circle(x + radius, y + radius, radius).lineWidth(0.8).strokeColor("#777166").stroke();
  doc.restore();
  doc.circle(x + radius, y + radius, radius - 2).fillAndStroke(fill, mix(fill, "#ffffff", 0.3));
  doc.circle(x + radius, y + radius, radius - 6).lineWidth(0.55)
    .strokeColor(mix(fill, "#ffffff", 0.38)).stroke();
  doc.fillColor(text).font("Times-Bold").fontSize(token.code.length > 2 ? 10 : 13)
    .text(token.code, x + 4, y + radius - 12, { width: diameter - 8, align: "center" });
  doc.fillColor(text).font("Helvetica-Bold").fontSize(4.7)
    .text(token.label.toUpperCase(), x + 5, y + radius + 6, {
      width: diameter - 10,
      align: "center",
      characterSpacing: 0.25,
    });
};

const drawTokenPage = (doc, title, subtitle, tokens, pageIndex) => {
  doc.addPage({ size: "LETTER", layout: "portrait", margin: 0 });
  doc.rect(0, 0, letterWidth, letterHeight).fill("#f2eee4");
  doc.rect(0, 0, letterWidth, 68).fill("#171923");
  doc.fillColor("#d8bd76").font("Helvetica-Bold").fontSize(7)
    .text("GOD CHESS  /  PRINT & PLAY", 38, 18, { characterSpacing: 1.4 });
  doc.fillColor("#fffaf0").font("Times-Bold").fontSize(23)
    .text(title.toUpperCase(), 38, 31);
  doc.fillColor("#4b463e").font("Helvetica").fontSize(7)
    .text(subtitle, 42, 79, { width: letterWidth - 84, align: "center" });

  const diameter = 48;
  const gapX = 11;
  const gapY = 13;
  const columns = 9;
  const gridWidth = columns * diameter + (columns - 1) * gapX;
  const startX = (letterWidth - gridWidth) / 2;
  const startY = 104;
  tokens.forEach((token, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawToken(
      doc,
      token,
      startX + column * (diameter + gapX),
      startY + row * (diameter + gapY),
      diameter,
    );
  });

  doc.fillColor("#5f594e").font("Helvetica").fontSize(6.5)
    .text(
      "Cut on the dashed outer circles. For sturdier pieces, print on cardstock or glue the sheet to chipboard before cutting.",
      44,
      letterHeight - 31,
      { width: letterWidth - 88, align: "center" },
    );
};

const repeatToken = (kind, code, label, count) =>
  Array.from({ length: count }, () => ({ kind, code, label }));

const writeMarkerTokens = async () => {
  const trackers = [
    ...repeatToken("rest", "R", "Rest", 6),
    ...repeatToken("level", "L", "Level", 18),
    ...repeatToken("white", "W", "White Orb", 24),
    ...repeatToken("black", "B", "Black Orb", 24),
  ];
  const statuses = [
    ...repeatToken("hardened", "HD", "Hardened", 8),
    ...repeatToken("stone", "ST", "Stone", 6),
    ...repeatToken("gazing", "GZ", "Gazing", 2),
    ...repeatToken("poisoned", "PO", "Poisoned", 8),
    ...repeatToken("polymorphed", "PM", "Polymorph", 6),
    ...repeatToken("lured", "LU", "Lured", 4),
    ...repeatToken("hexed", "HX", "Hexed", 6),
    ...repeatToken("prepared", "PR", "Prepared", 4),
    ...repeatToken("ritual", "RT", "Ritual", 4),
    ...repeatToken("marked", "MK", "Marked", 4),
    ...repeatToken("hired", "HI", "Hired", 6),
    ...repeatToken("charged", "CH", "Charged", 4),
    ...repeatToken("banana", "BN", "Banana", 6),
    ...repeatToken("stealth", "SV", "Stealth", 4),
  ];
  const filePath = path.join(outputPath, "god-chess-marker-tokens.pdf");
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: "LETTER",
    layout: "portrait",
    margin: 0,
    info: {
      Title: "God Chess - Printable Marker Tokens",
      Author: "God Chess",
      Subject: "US Letter printable marker and orb tokens",
    },
  });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  drawTokenPage(
    doc,
    "Trackers & Orbs",
    "6 rest markers, 18 ability-level markers, and 24 of each orb color.",
    trackers,
    0,
  );
  drawTokenPage(
    doc,
    "Status Markers",
    "Place these markers beside or beneath affected pieces. SV marks a planned Stealth destination.",
    statuses,
    1,
  );
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
};

fs.mkdirSync(outputPath, { recursive: true });
const gods = loadGods();
await Promise.all([writeGodBoards(gods), writeMarkerTokens()]);
console.log(`Generated ${gods.length} god boards and 2 token sheets in ${outputPath}`);
