/** Throwaway probe: how long the human waits per ply, and how often a
 *  geometric premove is still legal after the engine replies. */
import { Chess, type Move, type Square } from "chess.js";

import { Search, pickEasyMove } from "./engine";

type Difficulty = "easy" | "medium" | "hard";

const FILES = "abcdefgh";

function fileIndex(square: string): number {
  return FILES.indexOf(square[0]);
}
function rankIndex(square: string): number {
  return Number(square[1]) - 1;
}
function toSquare(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}`;
}

/** Squares a piece could ever step to, ignoring every other piece on the board. */
function geometricTargets(chess: Chess, from: string): string[] {
  const piece = chess.get(from as Square);
  if (!piece) return [];
  const f = fileIndex(from);
  const r = rankIndex(from);
  const out = new Set<string>();
  const push = (file: number, rank: number): boolean => {
    const square = toSquare(file, rank);
    if (!square) return false;
    const occupant = chess.get(square as Square);
    // Own pieces may still move away, so their square stays offerable.
    out.add(square);
    return !occupant || occupant.color !== piece.color ? true : true;
  };
  const ray = (df: number, dr: number): void => {
    for (let i = 1; i < 8; i += 1) if (!push(f + df * i, r + dr * i)) break;
  };
  switch (piece.type) {
    case "p": {
      const dir = piece.color === "w" ? 1 : -1;
      push(f, r + dir);
      if ((piece.color === "w" && r === 1) || (piece.color === "b" && r === 6)) push(f, r + dir * 2);
      push(f - 1, r + dir);
      push(f + 1, r + dir);
      break;
    }
    case "n":
      for (const [df, dr] of [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ])
        push(f + df, r + dr);
      break;
    case "b":
      ray(1, 1), ray(1, -1), ray(-1, 1), ray(-1, -1);
      break;
    case "r":
      ray(1, 0), ray(-1, 0), ray(0, 1), ray(0, -1);
      break;
    case "q":
      ray(1, 0), ray(-1, 0), ray(0, 1), ray(0, -1), ray(1, 1), ray(1, -1), ray(-1, 1), ray(-1, -1);
      break;
    case "k":
      for (const [df, dr] of [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
        [2, 0],
        [-2, 0],
      ])
        push(f + df, r + dr);
      break;
  }
  out.delete(from);
  return [...out];
}

function isLegal(chess: Chess, from: string, to: string): boolean {
  const moves = chess.moves({ square: from as Square, verbose: true }) as Move[];
  return moves.some((move) => move.to === to);
}

function engineMove(fen: string, difficulty: Difficulty): { move: Move | null; ms: number } {
  const started = performance.now();
  if (difficulty === "easy") {
    const move = pickEasyMove(fen);
    return { move, ms: performance.now() - started };
  }
  const budget = difficulty === "medium" ? 700 : 3200;
  const maxDepth = difficulty === "medium" ? 3 : 5;
  const search = new Search(fen, budget);
  const result = search.run(maxDepth, difficulty === "hard");
  return { move: result ? result.move : null, ms: performance.now() - started };
}

interface Row {
  think: number[];
  offered: number;
  survivedGeometric: number;
  survivedStrict: number;
  legalNow: number;
}

function run(difficulty: Difficulty, games: number, maxPly: number): Row {
  const row: Row = { think: [], offered: 0, survivedGeometric: 0, survivedStrict: 0, legalNow: 0 };
  for (let game = 0; game < games; game += 1) {
    const chess = new Chess();
    for (let ply = 0; ply < maxPly && !chess.isGameOver(); ply += 1) {
      const human = chess.turn() === "w";
      if (human) {
        // The human plays a random legal move; the premove is picked *before*
        // the engine replies, exactly like a real player would.
        const moves = chess.moves({ verbose: true }) as Move[];
        const played = moves[Math.floor(Math.random() * moves.length)];
        chess.move(played as unknown as { from: string; to: string; promotion?: string });
        if (chess.isGameOver()) break;

        // Pick a premove the way the board would offer it: one of our own
        // pieces, one of its geometric squares.
        const own = chess
          .board()
          .flat()
          .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell) && cell!.color === "w");
        const from = own[Math.floor(Math.random() * own.length)].square;
        const geo = geometricTargets(chess, from);
        if (geo.length === 0) continue;
        const to = geo[Math.floor(Math.random() * geo.length)];
        const legalBefore = isLegal(chess, from, to);
        row.offered += 1;
        if (legalBefore) row.legalNow += 1;

        const { move: reply, ms } = engineMove(chess.fen(), difficulty);
        row.think.push(ms);
        if (!reply) break;
        chess.move(reply as unknown as { from: string; to: string; promotion?: string });
        if (chess.isGameOver()) break;

        if (isLegal(chess, from, to)) {
          row.survivedGeometric += 1;
          if (legalBefore) row.survivedStrict += 1;
        }
      } else {
        const { move: reply, ms } = engineMove(chess.fen(), difficulty);
        row.think.push(ms);
        if (!reply) break;
        chess.move(reply as unknown as { from: string; to: string; promotion?: string });
      }
    }
  }
  return row;
}

function stats(values: number[]): { mean: number; p50: number; p90: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    p50: at(0.5),
    p90: at(0.9),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

const FLOOR_MS = 420;

for (const difficulty of ["easy", "medium", "hard"] as Difficulty[]) {
  const games = difficulty === "hard" ? 3 : 8;
  const row = run(difficulty, games, 60);
  const raw = stats(row.think);
  const felt = stats(row.think.map((ms) => Math.max(ms, FLOOR_MS)));
  console.log(
    [
      `[${difficulty}] search ms  mean ${raw.mean.toFixed(0)}  p50 ${raw.p50.toFixed(0)}  p90 ${raw.p90.toFixed(0)}  max ${raw.max.toFixed(0)}`,
      `[${difficulty}] felt wait  mean ${felt.mean.toFixed(0)}  p50 ${felt.p50.toFixed(0)}  p90 ${felt.p90.toFixed(0)}  (search floored at ${FLOOR_MS}ms)`,
      `[${difficulty}] premoves offered ${row.offered}  legal already ${((row.legalNow / row.offered) * 100).toFixed(1)}%`,
      `[${difficulty}] survived after reply: geometric ${((row.survivedGeometric / row.offered) * 100).toFixed(1)}%  of-those-legal-before ${((row.survivedStrict / Math.max(1, row.legalNow)) * 100).toFixed(1)}%`,
    ].join("\n"),
  );
}
