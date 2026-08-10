/**
 * Shared, render-agnostic game types.
 * The chess core never imports anything from `src/scene` — the scene subscribes to it.
 */

export type Faction = "w" | "b";

export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";

export type SquareId = string;

export type Difficulty = "easy" | "medium" | "hard";

export type GameMode = "ai" | "hotseat" | "attract" | "demo";

/** Computer-vs-computer showcase settings (used for recording demos). */
export interface DemoOptions {
  /** Engine strength for the ivory army. */
  white: Difficulty;
  /** Engine strength for the obsidian army. */
  black: Difficulty;
  /** Pacing multiplier for the pause between moves (1 = normal, 2 = twice as fast). */
  speed: number;
  /** Start a fresh game a few seconds after the last one ends. */
  autoRematch: boolean;
}

export type GameStatus = "idle" | "playing" | "over";

export type EndReason =
  | "checkmate"
  | "stalemate"
  | "resignation"
  | "timeout"
  | "threefold"
  | "insufficient"
  | "fiftymove"
  | "draw";

export interface GameResult {
  /** Winner, or null for a draw. */
  winner: Faction | null;
  reason: EndReason;
}

export interface ClockState {
  enabled: boolean;
  initialMs: number;
  whiteMs: number;
  blackMs: number;
}

/**
 * Wall time each army has spent on the board, in milliseconds.
 *
 * Independent of {@link ClockState}: the countdown is optional and runs *down*,
 * while this always accumulates so the field tally can report how long the
 * battle has lasted even in an untimed duel.
 */
export interface ElapsedState {
  whiteMs: number;
  blackMs: number;
  /** Both sides added together — the length of the battle so far. */
  totalMs: number;
}

export interface CapturedPiece {
  kind: PieceKind;
  /** Colour of the piece that was captured. */
  color: Faction;
}

export interface HistoryRow {
  number: number;
  white: string | null;
  black: string | null;
}

/** One played ply in standard algebraic notation, plus what it touched. */
export interface LedgerMove {
  /** 0-based half-move index. */
  ply: number;
  /** 1-based full-move number. */
  number: number;
  color: Faction;
  kind: PieceKind;
  san: string;
  from: SquareId;
  to: SquareId;
  capture: boolean;
  castle: boolean;
  promotion: PieceKind | null;
  check: boolean;
  mate: boolean;
}

/**
 * A move queued while the opponent is still on the clock.
 *
 * The promotion piece is chosen when the move is *placed*, not when it runs —
 * a picker that opened halfway through the engine's reply would defeat the
 * whole point of queueing the move in the first place.
 */
export interface Premove {
  from: SquareId;
  to: SquareId;
  promotion: PieceKind | null;
}

export interface GameSnapshot {
  status: GameStatus;
  mode: GameMode;
  difficulty: Difficulty;
  /** Human player's colour in AI mode. */
  playerColor: Faction;
  turn: Faction;
  fen: string;
  pgn: string;
  inCheck: boolean;
  thinking: boolean;
  busy: boolean;
  result: GameResult | null;
  history: HistoryRow[];
  sanList: string[];
  /** Full move ledger in standard notation, oldest first. */
  moves: LedgerMove[];
  captured: CapturedPiece[];
  /** Positive = white is ahead by that many pawns. */
  materialDiff: number;
  lastMove: { from: SquareId; to: SquareId } | null;
  /** Moves waiting to be played, oldest first — the first one runs next. */
  premoves: Premove[];
  clock: ClockState;
  /** Time spent per side, counted whether or not the chess clock is enabled. */
  elapsed: ElapsedState;
  canUndo: boolean;
  /** Showcase settings when `mode === "demo"`. */
  demo: DemoOptions | null;
  /** Showcase playback is halted between moves. */
  paused: boolean;
  /** 1-based showcase game counter (auto-rematch increments it). */
  demoRound: number;
}

/** Everything the renderer needs to animate one played move. */
export interface MoveEvent {
  color: Faction;
  kind: PieceKind;
  from: SquareId;
  to: SquareId;
  san: string;
  /** Set when a piece leaves the board (normal capture or en passant). */
  capture: { square: SquareId; kind: PieceKind; color: Faction } | null;
  /** Set for castling — the rook's own trip. */
  rook: { from: SquareId; to: SquareId } | null;
  promotion: PieceKind | null;
  isCheck: boolean;
  isGameOver: boolean;
}

export type Animator = (event: MoveEvent) => Promise<void>;

export const PIECE_VALUE: Record<PieceKind, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export const PIECE_LABEL: Record<PieceKind, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};
