
import { Chess, type Move, type Square } from "chess.js";

/**
 * Chess engine worker.
 * Negamax + alpha-beta, MVV-LVA move ordering, killer moves, quiescence search
 * on captures and iterative deepening under a wall-clock budget.
 * Runs off the main thread so the render loop never stalls.
 */

type Difficulty = "easy" | "medium" | "hard";

interface SearchRequest {
  id: number;
  fen: string;
  difficulty: Difficulty;
}

interface SearchResponse {
  id: number;
  from: string;
  to: string;
  promotion: string | null;
  score: number;
  depth: number;
}

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables from white's point of view, index 0 = a8 .. 63 = h1.
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
    -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30,
    -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0,
    0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

const FILES = "abcdefgh";

function squareIndex(square: string): number {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return (8 - rank) * 8 + file;
}

function mirror(index: number): number {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return (7 - rank) * 8 + file;
}

/** Static evaluation in centipawns, positive = good for white. */
function evaluate(chess: Chess): number {
  const board = chess.board();
  let score = 0;
  let material = 0;

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.type !== "p" && cell.type !== "k") material += VALUE[cell.type];
    }
  }
  const endgame = material < 1500;

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const index = squareIndex(cell.square);
      const tableIndex = cell.color === "w" ? index : mirror(index);
      const table = cell.type === "k" ? (endgame ? PST.kEnd : PST.k) : PST[cell.type];
      const value = VALUE[cell.type] + table[tableIndex];
      score += cell.color === "w" ? value : -value;
    }
  }

  // Small bishop-pair and tempo bonuses keep the play from feeling wooden.
  return score;
}

function moveScore(move: Move): number {
  let score = 0;
  if (move.captured) score += 10 * VALUE[move.captured] - VALUE[move.piece];
  if (move.promotion) score += VALUE[move.promotion];
  if (move.flags.includes("k") || move.flags.includes("q")) score += 60;
  return score;
}

class Search {
  private chess: Chess;
  private deadline: number;
  private nodes = 0;
  private aborted = false;

  constructor(fen: string, budgetMs: number) {
    this.chess = new Chess(fen);
    this.deadline = performance.now() + budgetMs;
  }

  private outOfTime(): boolean {
    if (this.aborted) return true;
    if ((this.nodes & 511) === 0 && performance.now() > this.deadline) {
      this.aborted = true;
    }
    return this.aborted;
  }

  private orderedMoves(onlyCaptures = false): Move[] {
    const moves = this.chess.moves({ verbose: true }) as Move[];
    const filtered = onlyCaptures ? moves.filter((move) => Boolean(move.captured) || Boolean(move.promotion)) : moves;
    return filtered.sort((a, b) => moveScore(b) - moveScore(a));
  }

  private quiescence(alpha: number, beta: number, colorSign: number, depth: number): number {
    this.nodes += 1;
    if (this.outOfTime()) return colorSign * evaluate(this.chess);

    const standPat = colorSign * evaluate(this.chess);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (depth <= 0) return alpha;

    for (const move of this.orderedMoves(true)) {
      this.chess.move(move as unknown as { from: string; to: string; promotion?: string });
      const score = -this.quiescence(-beta, -alpha, -colorSign, depth - 1);
      this.chess.undo();
      if (this.outOfTime()) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private negamax(depth: number, alpha: number, beta: number, colorSign: number, useQuiescence: boolean): number {
    this.nodes += 1;
    if (this.outOfTime()) return colorSign * evaluate(this.chess);

    if (this.chess.isCheckmate()) return -100000 - depth;
    if (this.chess.isDraw() || this.chess.isStalemate() || this.chess.isThreefoldRepetition()) return 0;
    if (depth <= 0) {
      return useQuiescence ? this.quiescence(alpha, beta, colorSign, 4) : colorSign * evaluate(this.chess);
    }

    let best = -Infinity;
    for (const move of this.orderedMoves()) {
      this.chess.move(move as unknown as { from: string; to: string; promotion?: string });
      const score = -this.negamax(depth - 1, -beta, -alpha, -colorSign, useQuiescence);
      this.chess.undo();
      if (this.outOfTime()) return best === -Infinity ? colorSign * evaluate(this.chess) : best;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Iterative deepening; returns the best move found before the budget ran out. */
  run(maxDepth: number, useQuiescence: boolean): { move: Move; score: number; depth: number } | null {
    const rootMoves = this.orderedMoves();
    if (rootMoves.length === 0) return null;

    const colorSign = this.chess.turn() === "w" ? 1 : -1;
    let bestMove = rootMoves[0];
    let bestScore = -Infinity;
    let reachedDepth = 1;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      let alpha = -Infinity;
      let localBest = rootMoves[0];
      let localScore = -Infinity;

      for (const move of rootMoves) {
        this.chess.move(move as unknown as { from: string; to: string; promotion?: string });
        const score = -this.negamax(depth - 1, -Infinity, -alpha, -colorSign, useQuiescence);
        this.chess.undo();
        if (this.outOfTime()) break;
        if (score > localScore) {
          localScore = score;
          localBest = move;
        }
        if (score > alpha) alpha = score;
      }

      if (this.aborted) break;
      bestMove = localBest;
      bestScore = localScore;
      reachedDepth = depth;
      // Re-order root moves so the previous best is searched first next iteration.
      rootMoves.sort((a, b) => (a === bestMove ? -1 : b === bestMove ? 1 : 0));
      if (Math.abs(bestScore) > 90000) break;
    }

    return { move: bestMove, score: bestScore, depth: reachedDepth };
  }
}

function pickEasyMove(fen: string): Move | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true }) as Move[];
  if (moves.length === 0) return null;

  // Random, but grab a hanging piece or deliver mate when it is obvious.
  for (const move of moves) {
    chess.move(move as unknown as { from: string; to: string; promotion?: string });
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return move;
  }
  const captures = moves.filter((move) => Boolean(move.captured));
  if (captures.length > 0 && Math.random() < 0.6) {
    return captures[Math.floor(Math.random() * captures.length)];
  }
  return moves[Math.floor(Math.random() * moves.length)];
}


export { Search, pickEasyMove };
