/**
 * Floating rank badges — the little crests that hover over every figure so the
 * player can read the board at a glance.
 *
 * Each badge is a canvas-drawn plaque: a gothic heater crest for the ivory
 * kingdom, a stepped sun disc for the Sun Empire, with a hand-drawn chess
 * silhouette inside. Textures are cached per kind + faction (12 in total) and
 * shared by every sprite, so the whole set costs a dozen small textures.
 */

import * as THREE from "three";

import type { Faction, PieceKind } from "../core/types";

const SIZE = 256;

interface BadgeTheme {
  /** Outer bezel. */
  rim: string;
  /** Inner hairline, a second metal against the bezel. */
  inner: string;
  plate: string;
  glyph: string;
  glow: string;
}

/**
 * The crests used to differ only in their metal — gold bezel against orange, both
 * over a plate that was near-black either way. At badge size that is two dark
 * lozenges: the shape said which army it was, the colour said nothing. Each
 * plate is now flooded with its own army's field, so the crest carries the same
 * azure/ember code as the band under the figure's feet and the light on its
 * silhouette.
 */
const THEMES: Record<Faction, BadgeTheme> = {
  w: {
    rim: "#a8d6ff",
    inner: "#e8f3ff",
    plate: "rgba(16,54,120,0.95)",
    glyph: "#f4fbff",
    glow: "rgba(110,168,255,0.6)",
  },
  b: {
    rim: "#ffb083",
    inner: "#ffe6c8",
    plate: "rgba(122,25,14,0.95)",
    glyph: "#fff2df",
    glow: "rgba(255,92,58,0.6)",
  },
};

/** Badge width in world units (1 unit = one board square). */
export const BADGE_SCALE: Record<PieceKind, number> = {
  p: 0.34,
  // The officer ranks now stand as tall as the queen (see `PIECE_HEIGHT`), and a
  // minor-piece crest over a royal-sized figure read as an undersized sticker.
  n: 0.41,
  b: 0.41,
  r: 0.41,
  q: 0.42,
  k: 0.44,
};

/** Height above the figure's crown where its badge floats. */
export const BADGE_LIFT = 0.3;

function canvas2d(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  return { canvas, ctx };
}

// --------------------------------------------------------------- plaque shapes

/** Gothic heater crest — the ivory kingdom's shield. */
function heaterPlate(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(16, 20);
  ctx.quadraticCurveTo(50, 10, 84, 20);
  ctx.lineTo(84, 52);
  ctx.quadraticCurveTo(84, 80, 50, 93);
  ctx.quadraticCurveTo(16, 80, 16, 52);
  ctx.closePath();
}

/** Stepped sun disc — the Sun Empire's obsidian medallion. */
function sunPlate(ctx: CanvasRenderingContext2D): void {
  const cx = 50;
  const cy = 51;
  const outer = 38;
  const inner = 32;
  const steps = 12;
  ctx.beginPath();
  for (let i = 0; i < steps * 2; i += 1) {
    const angle = (i / (steps * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- piece glyphs

function pedestal(ctx: CanvasRenderingContext2D, top: number): void {
  ctx.moveTo(31, top);
  ctx.lineTo(69, top);
  ctx.lineTo(75, top + 9);
  ctx.lineTo(25, top + 9);
  ctx.closePath();
}

function pawnGlyph(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(50, 33, 11, 0, Math.PI * 2);
  ctx.closePath();
  ctx.moveTo(38, 45);
  ctx.lineTo(62, 45);
  ctx.lineTo(59, 52);
  ctx.lineTo(41, 52);
  ctx.closePath();
  ctx.moveTo(42, 52);
  ctx.quadraticCurveTo(38, 63, 34, 70);
  ctx.lineTo(66, 70);
  ctx.quadraticCurveTo(62, 63, 58, 52);
  ctx.closePath();
  pedestal(ctx, 70);
}

function rookGlyph(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(29, 24);
  ctx.lineTo(38, 24);
  ctx.lineTo(38, 31);
  ctx.lineTo(45, 31);
  ctx.lineTo(45, 24);
  ctx.lineTo(55, 24);
  ctx.lineTo(55, 31);
  ctx.lineTo(62, 31);
  ctx.lineTo(62, 24);
  ctx.lineTo(71, 24);
  ctx.lineTo(71, 41);
  ctx.lineTo(29, 41);
  ctx.closePath();
  ctx.moveTo(35, 41);
  ctx.lineTo(65, 41);
  ctx.lineTo(62, 69);
  ctx.lineTo(38, 69);
  ctx.closePath();
  pedestal(ctx, 69);
}

function knightGlyph(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(36, 71);
  ctx.quadraticCurveTo(33, 55, 37, 44);
  ctx.lineTo(26, 41);
  ctx.quadraticCurveTo(21, 39, 25, 34);
  ctx.lineTo(37, 27);
  ctx.lineTo(38, 15);
  ctx.lineTo(47, 24);
  ctx.lineTo(52, 14);
  ctx.lineTo(58, 25);
  ctx.quadraticCurveTo(73, 34, 71, 52);
  ctx.quadraticCurveTo(69, 64, 63, 71);
  ctx.closePath();
  pedestal(ctx, 71);
}

function bishopGlyph(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(50, 17, 5, 0, Math.PI * 2);
  ctx.closePath();
  ctx.moveTo(50, 22);
  ctx.quadraticCurveTo(69, 36, 65, 52);
  ctx.lineTo(35, 52);
  ctx.quadraticCurveTo(31, 36, 50, 22);
  ctx.closePath();
  ctx.moveTo(36, 54);
  ctx.lineTo(64, 54);
  ctx.lineTo(61, 61);
  ctx.lineTo(39, 61);
  ctx.closePath();
  ctx.moveTo(40, 61);
  ctx.lineTo(60, 61);
  ctx.lineTo(63, 70);
  ctx.lineTo(37, 70);
  ctx.closePath();
  pedestal(ctx, 70);
}

function crownGlyph(ctx: CanvasRenderingContext2D, king: boolean): void {
  ctx.beginPath();
  if (king) {
    ctx.moveTo(46, 10);
    ctx.lineTo(54, 10);
    ctx.lineTo(54, 16);
    ctx.lineTo(60, 16);
    ctx.lineTo(60, 23);
    ctx.lineTo(54, 23);
    ctx.lineTo(54, 30);
    ctx.lineTo(46, 30);
    ctx.lineTo(46, 23);
    ctx.lineTo(40, 23);
    ctx.lineTo(40, 16);
    ctx.lineTo(46, 16);
    ctx.closePath();
    ctx.moveTo(31, 32);
    ctx.lineTo(69, 32);
    ctx.lineTo(65, 46);
    ctx.lineTo(35, 46);
    ctx.closePath();
  } else {
    ctx.moveTo(30, 47);
    ctx.lineTo(30, 22);
    ctx.lineTo(40, 36);
    ctx.lineTo(50, 18);
    ctx.lineTo(60, 36);
    ctx.lineTo(70, 22);
    ctx.lineTo(70, 47);
    ctx.closePath();
    for (const [x, y] of [
      [30, 20],
      [50, 16],
      [70, 20],
    ]) {
      ctx.moveTo(x + 4, y);
      ctx.arc(x, y, 4, 0, Math.PI * 2);
    }
  }
  ctx.moveTo(34, 48);
  ctx.lineTo(66, 48);
  ctx.lineTo(63, 56);
  ctx.lineTo(37, 56);
  ctx.closePath();
  ctx.moveTo(38, 56);
  ctx.quadraticCurveTo(35, 64, 33, 70);
  ctx.lineTo(67, 70);
  ctx.quadraticCurveTo(65, 64, 62, 56);
  ctx.closePath();
  pedestal(ctx, 70);
}

const GLYPHS: Record<PieceKind, (ctx: CanvasRenderingContext2D) => void> = {
  p: pawnGlyph,
  r: rookGlyph,
  n: knightGlyph,
  b: bishopGlyph,
  q: (ctx) => crownGlyph(ctx, false),
  k: (ctx) => crownGlyph(ctx, true),
};

// ------------------------------------------------------------ tactical tokens

/** Token diameter in world units (1 unit = one board square) per kind. */
export const TOKEN_SCALE: Record<PieceKind, number> = {
  p: 0.64,
  // Officers are royal-sized on the 3D board; the flat map keeps the same two
  // tiers so switching views does not re-rank the army.
  n: 0.81,
  b: 0.81,
  r: 0.82,
  q: 0.84,
  k: 0.9,
};

interface TokenTheme {
  /** Radial plate gradient, centre → edge. */
  plateIn: string;
  plateOut: string;
  rim: string;
  hairline: string;
  glyph: string;
  /** Faction halo bleeding out past the rim. */
  halo: string;
  notch: string;
}

const TOKEN_THEMES: Record<Faction, TokenTheme> = {
  w: {
    plateIn: "#eaf4ff",
    plateOut: "#7fa8d8",
    rim: "#bfe0ff",
    hairline: "#1d3f78",
    glyph: "#0d2246",
    halo: "rgba(122,168,255,0.55)",
    notch: "#2f5c9c",
  },
  b: {
    plateIn: "#8e2413",
    plateOut: "#3d0d07",
    rim: "#ffa365",
    hairline: "#ffd0a8",
    glyph: "#fff0dd",
    halo: "rgba(255,96,64,0.55)",
    notch: "#a83d1c",
  },
};

/**
 * Overhead counter for the flat tactical view: a carved stone disc in faction
 * livery with the rank silhouette stamped into it. Read straight down, so the
 * plate carries all the identity the sculpt normally would.
 */
export function tacticalTokenTexture(kind: PieceKind, faction: Faction): THREE.CanvasTexture {
  const key = `token_${faction}${kind}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const theme = TOKEN_THEMES[faction];
  const { canvas, ctx } = canvas2d();
  ctx.scale(SIZE / 100, SIZE / 100);

  // Faction halo so the two armies separate from a glance at the whole board.
  const halo = ctx.createRadialGradient(50, 50, 30, 50, 50, 50);
  halo.addColorStop(0, theme.halo);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 100, 100);

  // Plate: lit from the upper left so the disc has a little relief.
  const plate = ctx.createRadialGradient(41, 39, 4, 50, 50, 41);
  plate.addColorStop(0, theme.plateIn);
  plate.addColorStop(1, theme.plateOut);
  ctx.beginPath();
  ctx.arc(50, 50, 40, 0, Math.PI * 2);
  ctx.fillStyle = plate;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Four carved notches on the diagonals — reads as tooled metal from above.
  ctx.fillStyle = theme.notch;
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.save();
    ctx.translate(50 + Math.cos(angle) * 37, 50 + Math.sin(angle) * 37);
    ctx.rotate(angle);
    ctx.fillRect(-3.2, -1.4, 6.4, 2.8);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(50, 50, 40, 0, Math.PI * 2);
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 3.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(50, 50, 34.5, 0, Math.PI * 2);
  ctx.strokeStyle = theme.hairline;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
  ctx.translate(50, 51);
  ctx.scale(0.72, 0.72);
  ctx.translate(-50, -50);
  ctx.shadowColor = faction === "w" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 2.5;
  ctx.shadowOffsetY = faction === "w" ? -1 : 1;
  ctx.fillStyle = theme.glyph;
  GLYPHS[kind](ctx);
  ctx.fill("nonzero");
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

// -------------------------------------------------------------------- texture

const cache = new Map<string, THREE.CanvasTexture>();

/** Cached badge texture for one kind + faction. */
export function rankBadgeTexture(kind: PieceKind, faction: Faction): THREE.CanvasTexture {
  const key = `${faction}${kind}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const theme = THEMES[faction];
  const { canvas, ctx } = canvas2d();
  ctx.scale(SIZE / 100, SIZE / 100);

  // Halo, so the crest still reads against a bright torch behind it.
  const halo = ctx.createRadialGradient(50, 50, 6, 50, 50, 50);
  halo.addColorStop(0, theme.glow);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 100, 100);

  const plate = faction === "w" ? heaterPlate : sunPlate;

  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 6;
  plate(ctx);
  ctx.fillStyle = theme.plate;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 3.4;
  plate(ctx);
  ctx.stroke();

  ctx.strokeStyle = theme.inner;
  ctx.lineWidth = 1.1;
  ctx.save();
  ctx.translate(50, faction === "w" ? 51 : 51);
  ctx.scale(0.87, 0.87);
  ctx.translate(-50, faction === "w" ? -51 : -51);
  plate(ctx);
  ctx.stroke();
  ctx.restore();

  // The silhouette sits slightly high inside the crest so the pedestal of the
  // glyph does not collide with the rounded bottom of the plaque.
  ctx.save();
  ctx.translate(50, faction === "w" ? 49 : 51);
  ctx.scale(0.62, 0.62);
  ctx.translate(-50, -50);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = theme.glyph;
  GLYPHS[kind](ctx);
  ctx.fill("nonzero");
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

// ---------------------------------------------------------- promotion plaques

const PLAQUE_WIDTH = 512;
const PLAQUE_HEIGHT = 176;

/** Plaque aspect, so the caller can size a sprite without re-deriving it. */
export const PLAQUE_ASPECT = PLAQUE_WIDTH / PLAQUE_HEIGHT;

function tablet(ctx: CanvasRenderingContext2D, inset: number): void {
  const w = PLAQUE_WIDTH - inset * 2;
  const h = PLAQUE_HEIGHT - inset * 2;
  const cut = 22;
  ctx.beginPath();
  ctx.moveTo(inset + cut, inset);
  ctx.lineTo(inset + w - cut, inset);
  ctx.lineTo(inset + w, inset + cut);
  ctx.lineTo(inset + w, inset + h - cut);
  ctx.lineTo(inset + w - cut, inset + h);
  ctx.lineTo(inset + cut, inset + h);
  ctx.lineTo(inset, inset + h - cut);
  ctx.lineTo(inset, inset + cut);
  ctx.closePath();
}

/**
 * The name plate under a promotion candidate: the rank's own crest glyph, the
 * rank spelled out, and the key that picks it.
 *
 * The picker used to be four unlabelled sculpts hovering over the far army, and
 * a 3D figure is a poor label — the two officers are the same height in this
 * army and the sculpt only differs in its arms. Writing the rank underneath is
 * the whole point of this texture; the crest is the same silhouette the figure
 * already wears on the board, so the choice and the result read as one thing.
 */
export function promotionPlaqueTexture(kind: PieceKind, faction: Faction, label: string, key: string): THREE.CanvasTexture {
  const cacheKey = `plaque_${faction}${kind}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const theme = THEMES[faction];
  const canvas = document.createElement("canvas");
  canvas.width = PLAQUE_WIDTH;
  canvas.height = PLAQUE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");

  // Stone tablet, lit from above so it does not read as a flat UI rectangle.
  const plate = ctx.createLinearGradient(0, 8, 0, PLAQUE_HEIGHT - 8);
  plate.addColorStop(0, "rgba(26,24,20,0.94)");
  plate.addColorStop(1, "rgba(9,8,7,0.94)");
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 14;
  tablet(ctx, 10);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineJoin = "round";
  tablet(ctx, 10);
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = 4;
  ctx.stroke();
  tablet(ctx, 19);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Army colour bled in from the left edge, the same code as the band under the
  // figure's feet — so an ivory plaque is never mistaken for an ember one.
  const wash = ctx.createLinearGradient(10, 0, 190, 0);
  wash.addColorStop(0, theme.plate);
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  tablet(ctx, 12);
  ctx.clip();
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, PLAQUE_WIDTH, PLAQUE_HEIGHT);
  ctx.restore();

  // Crest: the rank silhouette, drawn on the glyphs' own 100x100 grid.
  ctx.save();
  ctx.translate(44, PLAQUE_HEIGHT / 2 - 46);
  ctx.scale(0.92, 0.92);
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 10;
  ctx.fillStyle = theme.glyph;
  GLYPHS[kind](ctx);
  ctx.fill("nonzero");
  ctx.restore();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `600 54px "Cinzel", Georgia, serif`;
  ctx.fillStyle = "#f6e6c2";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  const letters = label.toUpperCase().split("").join("\u2009");
  ctx.fillText(letters, 150, PLAQUE_HEIGHT / 2 - 2);
  ctx.shadowBlur = 0;

  // Key cap, right-aligned: the plaque doubles as the keyboard legend.
  const capSize = 52;
  const capX = PLAQUE_WIDTH - 34 - capSize;
  const capY = (PLAQUE_HEIGHT - capSize) / 2;
  ctx.beginPath();
  ctx.roundRect(capX, capY, capSize, capSize, 12);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = `600 30px "Cinzel", Georgia, serif`;
  ctx.fillStyle = theme.rim;
  ctx.fillText(key.toUpperCase(), capX + capSize / 2, capY + capSize / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(cacheKey, texture);
  return texture;
}

/** Frees every cached badge texture (engine teardown only). */
export function disposeRankBadgeTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
