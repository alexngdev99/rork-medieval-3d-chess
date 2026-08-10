import * as THREE from "three";

/**
 * Procedural CC0-free textures. Everything is painted into canvases at boot so
 * the game ships without texture downloads and still gets marble veining,
 * pitted basalt, engraved rank/file labels and soft particle sprites.
 */

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function grain(ctx: CanvasRenderingContext2D, size: number, amount: number, alpha: number): void {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    data[i + 3] = Math.max(0, Math.min(255, data[i + 3] * alpha + 255 * (1 - alpha)));
  }
  ctx.putImageData(image, 0, 0);
}

/** Soft veined marble. `dark` swaps to basalt colouring. */
export function marbleTexture(dark: boolean): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = dark ? "#191a20" : "#e9e2d2";
  ctx.fillRect(0, 0, size, size);

  // Broad tonal blotches.
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 40 + Math.random() * 150;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = dark ? 40 + Math.random() * 25 : 205 + Math.random() * 40;
    gradient.addColorStop(0, `rgba(${tone},${tone},${tone + (dark ? 6 : 0)},0.35)`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Veins: random walks with tapering width.
  const veins = dark ? 8 : 16;
  for (let v = 0; v < veins; v += 1) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = dark ? "rgba(96,102,120,0.22)" : "rgba(120,116,104,0.34)";
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 60 + Math.floor(Math.random() * 60);
    for (let s = 0; s < steps; s += 1) {
      angle += (Math.random() - 0.5) * 0.7;
      x += Math.cos(angle) * 7;
      y += Math.sin(angle) * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  grain(ctx, size, dark ? 16 : 12, 1);
  return toTexture(canvas);
}

/** Rough castle flagstone floor with mortar joints. */
export function flagstoneTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = "#1b1a19";
  ctx.fillRect(0, 0, size, size);

  const cell = size / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const offset = row % 2 === 0 ? 0 : cell / 2;
      const x = (col * cell + offset) % size;
      const y = row * cell;
      const shade = 38 + Math.random() * 26;
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 5})`;
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(x + 3, y + 3, cell - 6, 3);
    }
  }
  grain(ctx, size, 26, 1);
  return toTexture(canvas);
}

/** Bronze-trimmed border with engraved a–h / 1–8 labels, mapped to the base top. */
export function boardBorderTexture(): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size);
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  ctx.fillStyle = "#221d17";
  ctx.fillRect(0, 0, size, size);

  // Carved stone ring.
  const border = size * 0.085;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#4a4136");
  gradient.addColorStop(0.5, "#332c24");
  gradient.addColorStop(1, "#241f19");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Bronze inlay line.
  ctx.strokeStyle = "#8a6a34";
  ctx.lineWidth = 6;
  ctx.strokeRect(border * 0.55, border * 0.55, size - border * 1.1, size - border * 1.1);
  ctx.strokeStyle = "rgba(214,178,102,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(border * 0.55 + 5, border * 0.55 + 5, size - border * 1.1 - 10, size - border * 1.1 - 10);

  // Inner well (hidden by the tiles, kept dark).
  ctx.fillStyle = "#0e0c0a";
  ctx.fillRect(border, border, size - border * 2, size - border * 2);

  const inner = size - border * 2;
  const step = inner / 8;
  ctx.font = `600 ${Math.floor(border * 0.52)}px "Cinzel", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 8; i += 1) {
    const centre = border + step * (i + 0.5);
    const engrave = (text: string, x: number, y: number): void => {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillText(text, x + 2, y + 2);
      ctx.fillStyle = "rgba(212,175,105,0.85)";
      ctx.fillText(text, x, y);
    };
    engrave(files[i], centre, border * 0.5);
    engrave(files[i], centre, size - border * 0.5);
    engrave(String(8 - i), border * 0.5, centre);
    engrave(String(8 - i), size - border * 0.5, centre);
  }

  grain(ctx, size, 14, 1);
  return toTexture(canvas, 1);
}

/** Radial falloff used for contact shadows and glow discs. */
export function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.55, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The thread laid along one link of a queued chain, painted so it can only be
 * read one way.
 *
 * The old thread was {@link radialTexture} stretched between the two squares:
 * symmetric on both axes, so a link looked exactly the same read backwards.
 * Over 23923 measured three-link chains, 19.9% had two threads crossing on the
 * stone and 5.1% of links had *both* ends shared with another link — exactly
 * the moments where the marks alone cannot say which way the plan runs.
 *
 * So the thread is a comet: a thin, nearly dark hair at the square the plan
 * leaves, growing into a bright wide head at the square it enters. Alpha and
 * width point the same way, so the direction survives a crossing, a dark hall,
 * a bloom pass and a colour-blind player.
 *
 * Painted column by column (once, at boot); each column is a soft vertical
 * cross-section, so the thread keeps feathered edges instead of a hard band.
 */
export function premoveThreadTexture(): THREE.CanvasTexture {
  const width = 256;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const middle = height / 2;
  for (let x = 0; x < width; x += 1) {
    const u = x / (width - 1);
    // Eased, not linear: a straight ramp reads as "slightly brighter over
    // there" rather than as a direction, so the tail is held quiet past
    // halfway and the head does most of the burning.
    const alpha = 0.06 + 0.94 * Math.pow(u, 1.7);
    const half = height * (0.14 + 0.34 * Math.pow(u, 0.85));
    const column = ctx.createLinearGradient(0, middle - half, 0, middle + half);
    column.addColorStop(0, "rgba(255,255,255,0)");
    column.addColorStop(0.5, `rgba(255,255,255,${alpha.toFixed(3)})`);
    column.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = column;
    ctx.fillRect(x, middle - half, 1, half * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The band painted on the tile under a figure, marking which army it belongs to.
 *
 * Colour alone is not enough: it has to survive a dark hall, a bloom pass, a
 * phone screen and a colour-blind player, so each army also gets its **own
 * shape** — the kingdoms' plain double band against the empire's spiked sun
 * collar. Read at a glance from any camera height, and the two never blur into
 * one another the way two tinted glows do.
 *
 * Drawn in white so a single canvas per shape can be tinted per faction.
 */
export function factionRingTexture(shape: "band" | "sunburst"): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  // Floor wash: the tile takes a *breath* of the army's colour, no more. This is
  // the one part of the mark that sits directly beneath the figure, so anything
  // brighter bounces up the legs and hem and starts recolouring the sculpt — and
  // it is the widest part too, so it is what fills the frame when thirty-two of
  // them are on screen. Kept faint and pulled in tight (0.46 → 0.4 of the tile):
  // enough to lift a figure off ivory marble, not enough to paint the square.
  const wash = ctx.createRadialGradient(c, c, size * 0.06, c, c, size * 0.4);
  wash.addColorStop(0, "rgba(255,255,255,0.12)");
  wash.addColorStop(0.6, "rgba(255,255,255,0.05)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  const radius = size * 0.375;

  // Bleed first, hard edge second — the band keeps a crisp line even under bloom.
  // The bleed is the halo the bloom pass grabs hold of, so it is narrow and faint;
  // the crisp line under it does the reading, and a *thin* bright line is easier
  // to read than a thick soft one.
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = size * 0.032;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (shape === "band") {
    // Second, thinner band inside it: two concentric lines, no teeth.
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = size * 0.014;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.285, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Spiked collar: twelve tapered rays outside the band. Shorter than the
    // kingdoms' bleed is wide, so the two shapes stay different at a glance
    // without the empire's mark covering more of its tile.
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    const inner = size * 0.4;
    const outer = size * 0.472;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const spread = 0.055;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(angle) * outer, c + Math.sin(angle) * outer);
      ctx.lineTo(c + Math.cos(angle - spread) * inner, c + Math.sin(angle - spread) * inner);
      ctx.lineTo(c + Math.cos(angle + spread) * inner, c + Math.sin(angle + spread) * inner);
      ctx.closePath();
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Reticle drawn on a legal destination square: a bright core dot ringed by a
 * thin halo. Crisp enough to read through torchlight and bloom.
 */
export function moveMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.19);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.45, "rgba(255,255,255,0.85)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.19, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = size * 0.022;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = size * 0.01;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.44, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Target lock drawn on a capture square: four bracket arcs plus tick marks. */
export function captureMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineCap = "round";
  ctx.lineWidth = size * 0.05;
  for (let i = 0; i < 4; i += 1) {
    const start = i * (Math.PI / 2) + Math.PI * 0.12;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.37, start, start + Math.PI * 0.26);
    ctx.stroke();
  }

  ctx.lineWidth = size * 0.018;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 4; i += 1) {
    const angle = i * (Math.PI / 2);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(c + dx * size * 0.15, c + dy * size * 0.15);
    ctx.lineTo(c + dx * size * 0.25, c + dy * size * 0.25);
    ctx.stroke();
  }

  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.46);
  core.addColorStop(0, "rgba(255,255,255,0.28)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Marker for a castling destination: a ring broken by two opposing arrows,
 * reading as "these two pieces trade places".
 */
export function castleMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineCap = "round";
  ctx.lineWidth = size * 0.028;
  for (let i = 0; i < 2; i += 1) {
    const start = i * Math.PI + Math.PI * 0.14;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.36, start, start + Math.PI * 0.72);
    ctx.stroke();
  }

  // Two arrow heads on the horizontal axis, pointing away from each other.
  ctx.lineWidth = size * 0.04;
  for (const dir of [-1, 1]) {
    const tip = c + dir * size * 0.42;
    ctx.beginPath();
    ctx.moveTo(tip - dir * size * 0.09, c - size * 0.075);
    ctx.lineTo(tip, c);
    ctx.lineTo(tip - dir * size * 0.09, c + size * 0.075);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = size * 0.022;
  ctx.beginPath();
  ctx.moveTo(c - size * 0.2, c);
  ctx.lineTo(c + size * 0.2, c);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Marker for a promotion square: a crown silhouette inside a spoked halo. */
export function promoteMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.lineWidth = size * (i % 3 === 0 ? 0.022 : 0.012);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(angle) * size * 0.33, c + Math.sin(angle) * size * 0.33);
    ctx.lineTo(c + Math.cos(angle) * size * 0.44, c + Math.sin(angle) * size * 0.44);
    ctx.stroke();
  }

  // Crown: three peaks on a banded base.
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.moveTo(c - size * 0.2, c + size * 0.08);
  ctx.lineTo(c - size * 0.24, c - size * 0.14);
  ctx.lineTo(c - size * 0.1, c - size * 0.01);
  ctx.lineTo(c, c - size * 0.19);
  ctx.lineTo(c + size * 0.1, c - size * 0.01);
  ctx.lineTo(c + size * 0.24, c - size * 0.14);
  ctx.lineTo(c + size * 0.2, c + size * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(c - size * 0.21, c + size * 0.1, size * 0.42, size * 0.05);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Alpha mask shaped like a board tile with feathered edges — used to tint or
 * shade a single square without painting a hard black rectangle.
 */
export function tileMaskTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const inset = size * 0.045;
  const span = size - inset * 2;
  const radius = size * 0.1;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(inset, inset, span, span, radius);
  ctx.fill();
  // Feather the rim so neighbouring shaded squares blend into one another.
  ctx.filter = "blur(4px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Reticle for a move that has been *intended* rather than made: a broken ring
 * of dashes with a hollow centre. Everything the board draws for a real move is
 * solid and closed; leaving this one open is what says "not yet".
 */
export function premoveMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;
  const radius = size * 0.36;

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineCap = "butt";
  ctx.lineWidth = size * 0.03;
  const dashes = 8;
  const sweep = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i += 1) {
    const start = i * sweep;
    ctx.beginPath();
    ctx.arc(c, c, radius, start, start + sweep * 0.52);
    ctx.stroke();
  }

  // A faint inner wash so the square still reads as claimed from a low camera,
  // without the solid core dot a playable destination gets.
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.3);
  core.addColorStop(0, "rgba(255,255,255,0.22)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Reticle for the square a queued move is *aimed at*.
 *
 * The origin and the destination of a premove used to wear the same dashed
 * ring, which left the player reading the pair to work out which way the move
 * went. This one is a **border**, not a ring: a bracketed frame around the whole
 * tile, so the destination reads as ground being claimed rather than as a
 * second selected piece. It keeps the broken edges of the premove language —
 * the sides are drawn as gaps, only the four corners are solid — so it still
 * says "intended", never "played".
 */
export function premoveTargetTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const inset = size * 0.13;
  const span = size - inset * 2;
  const arm = size * 0.16;

  // Broken sides: a short stub either end of each edge, with the middle left
  // open. Closing them would make this a solid frame, which is the vocabulary
  // of a move that has actually happened.
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = size * 0.022;
  ctx.lineCap = "butt";
  const stub = span * 0.16;
  const edges: [number, number, number, number][] = [
    [inset, inset, 1, 0],
    [inset + span, inset, 0, 1],
    [inset + span, inset + span, -1, 0],
    [inset, inset + span, 0, -1],
  ];
  for (const [x, y, dx, dy] of edges) {
    ctx.beginPath();
    ctx.moveTo(x + dx * arm, y + dy * arm);
    ctx.lineTo(x + dx * (arm + stub), y + dy * (arm + stub));
    ctx.stroke();
  }

  // Corner brackets carry the weight — four hard angles read as a frame from a
  // low camera even when the sides are lost against the stone.
  ctx.strokeStyle = "rgba(255,255,255,0.98)";
  ctx.lineWidth = size * 0.05;
  ctx.lineCap = "square";
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [inset + span, inset, -1, 1],
    [inset, inset + span, 1, -1],
    [inset + span, inset + span, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * arm);
    ctx.stroke();
  }

  // A small closed pip dead centre: the origin ring is hollow, so the filled
  // centre is the one-glance answer to "which end is the destination".
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.045, 0, Math.PI * 2);
  ctx.fill();

  const halo = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.26);
  halo.addColorStop(0, "rgba(255,255,255,0.3)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.26, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The little dismiss disc that hangs over a queued move.
 *
 * Taking a premove back was already possible four ways — tap the figure, tap
 * the destination, Esc, or queue something else — but every one of them is a
 * thing you have to *know*. Nothing on the board said so. This is the one
 * affordance that does: a struck cross on a dark coin, which is the same
 * gesture the player already uses to close a panel.
 *
 * It is drawn as a coin rather than a bare glyph because it hangs over stone,
 * figures and torchlight in turn, and a bare stroke would vanish against half
 * of them.
 */
export function premoveCancelTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const centre = size / 2;
  // The disc is deliberately smaller than the canvas: the transparent margin is
  // free hit area, so the coin can stay small on screen and still be tappable
  // with a thumb.
  const radius = size * 0.34;

  const body = ctx.createRadialGradient(centre, centre - radius * 0.3, 0, centre, centre, radius);
  body.addColorStop(0, "rgba(46,52,66,0.96)");
  body.addColorStop(1, "rgba(18,21,28,0.96)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(centre, centre, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = size * 0.022;
  ctx.beginPath();
  ctx.arc(centre, centre, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = size * 0.055;
  ctx.lineCap = "round";
  const arm = radius * 0.44;
  ctx.beginPath();
  ctx.moveTo(centre - arm, centre - arm);
  ctx.lineTo(centre + arm, centre + arm);
  ctx.moveTo(centre + arm, centre - arm);
  ctx.lineTo(centre - arm, centre + arm);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The ordinal that rides over each square of a queued chain.
 *
 * A chain of three queued moves draws three rings and three threads, and from
 * a low camera the threads cross: the marks say *where* the plan goes but not
 * *in which order*. This is the answer, and it is deliberately **not** a coin —
 * the dismiss disc is the only pressable thing in the premove language, so a
 * second filled disc would read as a second button. A bare numeral with a soft
 * dark halo behind it is a label: legible over pale marble, dark basalt and a
 * figure's shoulder alike, without ever looking like something to tap.
 */
export function premoveOrderTexture(index: number): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const centre = size / 2;

  // The halo is the whole reason this is readable on stone; it is a gradient
  // rather than a disc so it has no edge to be mistaken for a coin's rim.
  const halo = ctx.createRadialGradient(centre, centre, 0, centre, centre, size * 0.42);
  halo.addColorStop(0, "rgba(8,10,14,0.78)");
  halo.addColorStop(0.55, "rgba(8,10,14,0.42)");
  halo.addColorStop(1, "rgba(8,10,14,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(centre, centre, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `600 ${Math.floor(size * 0.56)}px "Cinzel", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Same engraved serif the board edge uses for its rank and file letters, so
  // the count reads as part of the hall rather than as a HUD sticker.
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillText(String(index), centre + size * 0.016, centre + size * 0.032);
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fillText(String(index), centre, centre + size * 0.016);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Gold frame drawn under the piece the player has picked up. */
export function selectMarkerTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const inset = size * 0.1;
  const span = size - inset * 2;

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = size * 0.026;
  ctx.strokeRect(inset, inset, span, span);

  // Corner accents so the frame reads as forged metal, not a plain box.
  ctx.lineWidth = size * 0.055;
  ctx.lineCap = "round";
  const arm = size * 0.12;
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [size - inset, inset, -1, 1],
    [inset, size - inset, 1, -1],
    [size - inset, size - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * arm);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Upward gradient for the light column standing on a highlighted square. */
export function columnTexture(): THREE.CanvasTexture {
  const size = 64;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0.7)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft dot sprite for embers, dust and impact sparks. */
export function sparkTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,226,168,0.85)");
  gradient.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Expanding shockwave ring used on the square where a capture lands: a hot
 * white rim with a soft inner bloom and a few radial shards.
 */
export function shockwaveTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  const ring = ctx.createRadialGradient(c, c, size * 0.16, c, c, size * 0.5);
  ring.addColorStop(0, "rgba(255,255,255,0)");
  ring.addColorStop(0.55, "rgba(255,255,255,0.1)");
  ring.addColorStop(0.82, "rgba(255,255,255,0.95)");
  ring.addColorStop(0.93, "rgba(255,255,255,0.35)");
  ring.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, size, size);

  // Radial shards give the wave a shattered, debris-thrown feel.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + 0.2;
    const inner = size * (0.3 + Math.random() * 0.1);
    const outer = size * (0.44 + Math.random() * 0.05);
    ctx.lineWidth = size * (0.008 + Math.random() * 0.012);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
    ctx.lineTo(c + Math.cos(angle) * outer, c + Math.sin(angle) * outer);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Soft dust ring thrown out when a figure sets down on a square: a thin bright
 * rim with a wide feathered outer haze and no debris shards — the arrival has
 * to read as weight settling, never as an explosion.
 */
export function landingRingTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  const halo = ctx.createRadialGradient(c, c, size * 0.1, c, c, size * 0.5);
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.62, "rgba(255,255,255,0.06)");
  halo.addColorStop(0.8, "rgba(255,255,255,0.55)");
  halo.addColorStop(0.88, "rgba(255,255,255,0.9)");
  halo.addColorStop(0.95, "rgba(255,255,255,0.18)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // A few soft lobes break the perfect circle so the ring reads as kicked dust.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
    const radius = size * (0.4 + Math.random() * 0.06);
    const blot = ctx.createRadialGradient(
      c + Math.cos(angle) * radius,
      c + Math.sin(angle) * radius,
      0,
      c + Math.cos(angle) * radius,
      c + Math.sin(angle) * radius,
      size * (0.05 + Math.random() * 0.05),
    );
    blot.addColorStop(0, "rgba(0,0,0,0.55)");
    blot.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = blot;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Churned battlefield earth: dark mud, cracks, gravel and wet patches. */
export function mudTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = "#2a2219";
  ctx.fillRect(0, 0, size, size);

  // Broad tonal patches of drier and wetter ground.
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 30 + Math.random() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const wet = Math.random() > 0.5;
    gradient.addColorStop(0, wet ? "rgba(18,15,12,0.55)" : "rgba(74,62,45,0.4)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cart ruts and cracks.
  for (let i = 0; i < 26; i += 1) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = "rgba(12,10,8,0.5)";
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 40; s += 1) {
      angle += (Math.random() - 0.5) * 0.5;
      x += Math.cos(angle) * 9;
      y += Math.sin(angle) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Gravel and trampled stones.
  for (let i = 0; i < 420; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.6 + Math.random() * 2.4;
    const tone = 40 + Math.random() * 46;
    ctx.fillStyle = `rgba(${tone},${tone - 6},${tone - 14},0.7)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  grain(ctx, size, 30, 1);
  return toTexture(canvas);
}

/** Heraldic camp cloth: base colour with a chevron band and stitched seams. */
export function clothTexture(base: string, accent: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = accent;
  ctx.fillRect(0, size * 0.52, size, size * 0.12);

  // Chevrons.
  ctx.strokeStyle = accent;
  ctx.lineWidth = size * 0.035;
  for (let i = -1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, size * (0.16 + i * 0.26));
    ctx.lineTo(size * 0.5, size * (0.28 + i * 0.26));
    ctx.lineTo(size, size * (0.16 + i * 0.26));
    ctx.stroke();
  }

  // Vertical weave shading so the cloth catches light unevenly.
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = `rgba(0,0,0,${0.06 + Math.random() * 0.09})`;
    ctx.fillRect(x, 0, 2, size);
  }

  grain(ctx, size, 18, 1);
  return toTexture(canvas);
}

/** Puffy soft-edged blob used for smoke plumes drifting off the pyres. */
export function smokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(150,142,132,0.5)");
  gradient.addColorStop(0.45, "rgba(104,98,92,0.24)");
  gradient.addColorStop(1, "rgba(60,56,52,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // A couple of offset lobes keep the puffs from reading as perfect circles.
  for (let i = 0; i < 5; i += 1) {
    const x = size * (0.3 + Math.random() * 0.4);
    const y = size * (0.3 + Math.random() * 0.4);
    const r = size * (0.14 + Math.random() * 0.16);
    const lobe = ctx.createRadialGradient(x, y, 0, x, y, r);
    lobe.addColorStop(0, "rgba(160,152,142,0.22)");
    lobe.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lobe;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Fine-grain powder smoke: what leaves a *rifled* barrel rather than a musket.
 *
 * A rifle's charge is small, tight-patched and burns almost completely, so the
 * bank it leaves is pale ash-grey and thin enough to see the hall through —
 * where {@link smokeTexture} is the dirty, soot-heavy bloom of a smoothbore
 * volley. Kept high-key and low-alpha on purpose: the tint is multiplied by the
 * sprite colour, so the texture must not carry the darkness itself.
 */
export function fineSmokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(238,241,244,0.34)");
  gradient.addColorStop(0.38, "rgba(214,219,224,0.15)");
  gradient.addColorStop(0.72, "rgba(190,196,203,0.05)");
  gradient.addColorStop(1, "rgba(180,186,193,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Wispier and more of them than the musket blob: a rifle's smoke tears apart
  // into threads instead of rolling as one lump.
  for (let i = 0; i < 7; i += 1) {
    const x = size * (0.26 + Math.random() * 0.48);
    const y = size * (0.26 + Math.random() * 0.48);
    const r = size * (0.08 + Math.random() * 0.13);
    const lobe = ctx.createRadialGradient(x, y, 0, x, y, r);
    lobe.addColorStop(0, "rgba(246,248,250,0.13)");
    lobe.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lobe;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A blade arc: a thin crescent of light, hot on its leading edge and trailing
 * off to nothing, drawn once and swept through a body on a heavy strike.
 */
export function crescentTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  // The sweep: a wide stroke around most of a circle, thinning as it goes.
  const steps = 46;
  const from = -Math.PI * 0.78;
  const to = Math.PI * 0.32;
  ctx.lineCap = "round";
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const angle = from + (to - from) * t;
    // Hot and fat at the leading edge, feathering out along the trail.
    const fade = Math.pow(1 - t, 1.5);
    const radius = size * (0.4 - t * 0.03);
    const width = size * (0.012 + fade * 0.055);
    ctx.strokeStyle = `rgba(255,255,255,${(0.1 + fade * 0.9).toFixed(3)})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, radius, angle - 0.05, angle + 0.05);
    ctx.stroke();
  }

  // Glint at the tip of the swing, where the steel is moving fastest.
  const tipX = c + Math.cos(from) * size * 0.4;
  const tipY = c + Math.sin(from) * size * 0.4;
  const glint = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, size * 0.1);
  glint.addColorStop(0, "rgba(255,255,255,0.95)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The wall of a column of light: brightest where it meets the floor, thinning
 * as it climbs out of frame, with faint vertical striations so it reads as
 * falling light rather than a plastic tube.
 */
export function pillarTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createLinearGradient(0, size, 0, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.42)");
  gradient.addColorStop(0.75, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 14; i += 1) {
    const x = Math.random() * size;
    const width = size * (0.01 + Math.random() * 0.05);
    ctx.fillStyle = `rgba(0,0,0,${(0.1 + Math.random() * 0.25).toFixed(3)})`;
    ctx.fillRect(x, 0, width, size);
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Muzzle flash: a white-hot core inside a ragged star of burning powder. Drawn
 * once and billboarded, so a shot reads from every camera angle on the board.
 *
 * The star is deliberately *overdriven* — a broad plateau of pure white across
 * the middle third rather than a single bright pixel at the centre. Two reasons.
 * First, the bloom pass only picks up what already clips at 1, so a flash built
 * as a polite gradient blooms on a handful of pixels and reads as a dull spark.
 * Second, the round that leaves this bore is now a real sculpt drawn several
 * calibres wide: a flame narrower and dimmer than the ball it launches makes the
 * shot look like the ball was dropped rather than fired.
 */
export function muzzleFlashTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  const c = size / 2;

  const halo = ctx.createRadialGradient(c, c, 0, c, c, size * 0.5);
  // Flat white out to a fifth of the radius: this is the part that clips and
  // therefore the part the bloom pass actually sees.
  halo.addColorStop(0, "rgba(255,255,255,1)");
  halo.addColorStop(0.2, "rgba(255,255,251,1)");
  halo.addColorStop(0.34, "rgba(255,244,198,0.82)");
  halo.addColorStop(0.54, "rgba(255,198,104,0.42)");
  halo.addColorStop(0.78, "rgba(255,138,44,0.16)");
  halo.addColorStop(1, "rgba(255,110,30,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "lighter";

  // Powder does not burn in a circle: uneven petals of flame off the bore. They
  // now reach almost to the edge of the sprite, so the flame has a ragged
  // silhouette at its full drawn width instead of a soft ball in the middle.
  const petals = 13;
  for (let i = 0; i < petals; i += 1) {
    const angle = (i / petals) * Math.PI * 2 + Math.random() * 0.34;
    const reach = size * (0.31 + Math.random() * 0.18);
    const width = size * (0.035 + Math.random() * 0.045);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    const petal = ctx.createLinearGradient(0, 0, reach, 0);
    petal.addColorStop(0, "rgba(255,255,244,1)");
    petal.addColorStop(0.3, "rgba(255,238,178,0.72)");
    petal.addColorStop(0.62, "rgba(255,196,96,0.34)");
    petal.addColorStop(1, "rgba(255,140,48,0)");
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(reach, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Three long primary jets: where the charge actually vents. Thin, near-white
  // and running to the sprite edge, they are what makes the flash read as an
  // explosion escaping a tube rather than as a glowing blob.
  for (let i = 0; i < 3; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const reach = size * (0.44 + Math.random() * 0.06);
    const width = size * 0.022;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    const jet = ctx.createLinearGradient(0, 0, reach, 0);
    jet.addColorStop(0, "rgba(255,255,255,1)");
    jet.addColorStop(0.5, "rgba(255,246,206,0.5)");
    jet.addColorStop(1, "rgba(255,170,70,0)");
    ctx.fillStyle = jet;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(reach, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // A second pass of pure white over the middle, stacked additively, so the
  // core is genuinely blown out rather than merely bright.
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.17);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.6, "rgba(255,252,235,0.7)");
  core.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Motion smear along a round's line of travel: opaque at the nose, gone at the
 * tail, with a bright thread down the middle.
 *
 * Mapped onto the tapered cone that trails a shot, so the streak fades along
 * its length rather than ending in a hard edge. A shot crossing a hall in half
 * a second is a few pixels wide — this smear is the only thing that gives the
 * eye something to follow, which is why it carries a hot core rather than a
 * flat wash.
 */
export function tracerTexture(): THREE.CanvasTexture {
  const width = 32;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.clearRect(0, 0, width, height);

  // Cylinder UVs run 0 at the tail to 1 at the nose, so the gradient is built
  // bottom-up: nothing where the smear dies, solid where the metal is.
  const along = ctx.createLinearGradient(0, height, 0, 0);
  along.addColorStop(0, "rgba(255,255,255,0)");
  along.addColorStop(0.34, "rgba(255,255,255,0.1)");
  along.addColorStop(0.74, "rgba(255,255,255,0.42)");
  along.addColorStop(1, "rgba(255,255,255,0.92)");
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, width, height);

  // A hotter thread down the axis of the smear — the centre of a blurred body
  // is always brighter than its edges.
  const core = ctx.createLinearGradient(0, 0, width, 0);
  core.addColorStop(0, "rgba(255,255,255,0)");
  core.addColorStop(0.5, "rgba(255,255,255,0.5)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Vertical light-shaft gradient (bright at the window, fading to the floor). */
export function shaftTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size);
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255,224,170,0.55)");
  gradient.addColorStop(0.45, "rgba(255,206,140,0.18)");
  gradient.addColorStop(1, "rgba(255,190,120,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
