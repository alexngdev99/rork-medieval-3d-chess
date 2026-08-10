import { Chess, type Move, type Square } from "chess.js";

import { Emitter } from "./emitter";
import {
  type Animator,
  type CapturedPiece,
  type ClockState,
  type DemoOptions,
  type Difficulty,
  type ElapsedState,
  type Faction,
  type GameMode,
  type GameResult,
  type GameSnapshot,
  type HistoryRow,
  type LedgerMove,
  type MoveEvent,
  type PieceKind,
  type Premove,
  type SquareId,
  PIECE_VALUE,
} from "./types";
import { AiClient } from "../ai/aiClient";

export interface StartOptions {
  mode: GameMode;
  difficulty: Difficulty;
  playerColor: Faction;
  clockMinutes: number | null;
  /** Only read when `mode === "demo"`. */
  demo?: DemoOptions;
}

export const DEFAULT_DEMO: DemoOptions = {
  white: "medium",
  black: "medium",
  speed: 1,
  autoRematch: true,
};

/**
 * How long the board sits on the final position before the next showcase game.
 *
 * Exported because the result dialog counts this down on screen: a viewer who is
 * about to be moved on to a fresh duel should be able to see it coming and stop
 * it, rather than have the board reset under them mid-sentence.
 */
export const DEMO_REMATCH_DELAY_MS = 9000;

interface ControllerEvents {
  state: GameSnapshot;
  move: MoveEvent;
  check: Faction;
  gameover: GameResult;
  reset: StartOptions;
  illegal: { from: SquareId; to: SquareId };
  /** The queued move changed — null when it was cleared or has just run. */
  premove: Premove | null;
  /** A queued move could not be played after the reply and was dropped. */
  premovefailed: { from: SquareId; to: SquareId };
}

const CLOCK_TICK_MS = 100;

/**
 * Floor on how long a reply against the computer takes, in ms.
 *
 * The search itself averages 7ms on easy, so without a floor the machine would
 * answer before the player's hand had left the board — which reads as a bug,
 * not as strength. 420ms is the smallest wait that still feels like a decision.
 */
export const DEFAULT_THINK_FLOOR_MS = 420;

/** Floors offered in settings, longest first in the interface. */
export const THINK_FLOOR_CHOICES = [0, DEFAULT_THINK_FLOOR_MS, 1500, 3000, 6000] as const;

const FILES = "abcdefgh";

/** Ray directions per sliding piece, as (file, rank) steps. */
const SLIDES: Record<string, [number, number][]> = {
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
  q: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
};

const KNIGHT_STEPS: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_STEPS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function toSquare(file: number, rank: number): SquareId | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}`;
}

/**
 * Owns all chess state. Rendering, audio and UI subscribe to it; it knows
 * nothing about three.js or the DOM.
 */
export class GameController extends Emitter<ControllerEvents> {
  private chess = new Chess();
  private ai = new AiClient();
  private animator: Animator | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private rematchTimer: ReturnType<typeof setTimeout> | null = null;
  /** `performance.now()` stamp the queued showcase rematch is due to fire at. */
  private rematchAt = 0;
  private lastTickAt = 0;
  private generation = 0;
  private paused = false;
  private demoRound = 1;
  /** Resolvers waiting for the showcase to leave the paused state. */
  private resumeWaiters: (() => void)[] = [];

  private status: GameSnapshot["status"] = "idle";
  private options: StartOptions = {
    mode: "ai",
    difficulty: "medium",
    playerColor: "w",
    clockMinutes: null,
  };
  private clock: ClockState = { enabled: false, initialMs: 0, whiteMs: 0, blackMs: 0 };
  /** Wall time already charged to each army, in ms. */
  private elapsed: Record<Faction, number> = { w: 0, b: 0 };
  /** Army the meter is currently charging, or null while idle / paused / over. */
  private timingSide: Faction | null = null;
  private timingSince = 0;
  private result: GameResult | null = null;
  private thinking = false;
  private busy = false;
  /** Move the player queued while the engine was on the clock. */
  private premove: Premove | null = null;
  private premovesEnabled = true;
  /** Minimum wall time an engine reply is held for, in ms. */
  private thinkFloorMs: number = DEFAULT_THINK_FLOOR_MS;
  private snapshot: GameSnapshot = this.buildSnapshot();

  /** The renderer registers an async animator; moves wait for it to finish. */
  setAnimator(animator: Animator | null): void {
    this.animator = animator;
  }

  getSnapshot(): GameSnapshot {
    return this.snapshot;
  }

  /**
   * Live per-side elapsed time. Read directly (rather than off the snapshot) by
   * the tally panel, which ticks on its own so a running second never forces the
   * whole interface to re-render.
   */
  getElapsed(): ElapsedState {
    const live: Record<Faction, number> = { w: this.elapsed.w, b: this.elapsed.b };
    if (this.timingSide !== null) {
      live[this.timingSide] += Math.max(0, performance.now() - this.timingSince);
    }
    return { whiteMs: live.w, blackMs: live.b, totalMs: live.w + live.b };
  }

  /**
   * Charges the time since the last sync to whoever was on the move, then
   * re-points the meter at whoever is on the move now. Called on every event
   * that changes who is thinking: a played move, a pause, an undo, the end of
   * the battle.
   */
  private syncElapsed(): void {
    const now = performance.now();
    if (this.timingSide !== null) {
      this.elapsed[this.timingSide] += Math.max(0, now - this.timingSince);
    }
    this.timingSince = now;
    this.timingSide = this.status === "playing" && !this.paused ? (this.chess.turn() as Faction) : null;
  }

  getBoard(): { square: SquareId; kind: PieceKind; color: Faction }[] {
    const out: { square: SquareId; kind: PieceKind; color: Faction }[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        out.push({ square: cell.square, kind: cell.type as PieceKind, color: cell.color as Faction });
      }
    }
    return out;
  }

  /**
   * Destinations for a piece, deduplicated by square (a promotion generates one
   * move per candidate piece) and tagged so the board can colour-code them.
   */
  legalTargets(from: SquareId): { to: SquareId; capture: boolean; castle: boolean; promotion: boolean }[] {
    const moves = this.chess.moves({ square: from as Square, verbose: true }) as Move[];
    const targets = new Map<SquareId, { to: SquareId; capture: boolean; castle: boolean; promotion: boolean }>();
    for (const move of moves) {
      const existing = targets.get(move.to);
      const entry = existing ?? { to: move.to, capture: false, castle: false, promotion: false };
      entry.capture = entry.capture || move.flags.includes("c") || move.flags.includes("e");
      entry.castle = entry.castle || move.flags.includes("k") || move.flags.includes("q");
      entry.promotion = entry.promotion || move.flags.includes("p");
      targets.set(move.to, entry);
    }
    return [...targets.values()];
  }

  isPromotion(from: SquareId, to: SquareId): boolean {
    const moves = this.chess.moves({ square: from as Square, verbose: true }) as Move[];
    return moves.some((move) => move.to === to && move.flags.includes("p"));
  }

  pieceAt(square: SquareId): { kind: PieceKind; color: Faction } | null {
    const piece = this.chess.get(square as Square);
    if (!piece) return null;
    return { kind: piece.type as PieceKind, color: piece.color as Faction };
  }

  // ---------------------------------------------------------------- premoves

  /**
   * Whether a move can be queued right now.
   *
   * The window is exactly "the player is waiting on the machine": both while the
   * engine searches *and* while the previous move is still being played out on
   * screen, which is the half of the wait the search timings do not show.
   */
  canPremove(): boolean {
    if (!this.premovesEnabled) return false;
    if (this.options.mode !== "ai" || this.status !== "playing") return false;
    return !this.isHumanTurn();
  }

  setPremovesEnabled(enabled: boolean): void {
    if (this.premovesEnabled === enabled) return;
    this.premovesEnabled = enabled;
    if (!enabled) this.clearPremove();
  }

  /**
   * Sets the floor on the computer's reply, in ms.
   *
   * A floor, never a cap: a search that genuinely takes three seconds still
   * takes three seconds. Raising it widens the window a premove can be aimed
   * in, which is the only honest way to rehearse the feature on easy, where the
   * search is over in 7ms.
   */
  setThinkFloorMs(ms: number): void {
    this.thinkFloorMs = Math.min(15000, Math.max(0, Math.round(ms)));
  }

  getThinkFloorMs(): number {
    return this.thinkFloorMs;
  }

  getPremove(): Premove | null {
    return this.premove;
  }

  /**
   * Squares a piece could ever step to, read off its movement geometry rather
   * than off the position.
   *
   * A premove is aimed at a board that does not exist yet, so a blocker is not a
   * reason to withhold a square: the piece standing in the way may well be the
   * thing that moves. Legality is settled once, later, when the move actually
   * runs.
   */
  premoveTargets(from: SquareId): SquareId[] {
    const piece = this.chess.get(from as Square);
    if (!piece) return [];
    const file = FILES.indexOf(from[0]);
    const rank = Number(from[1]) - 1;
    const out = new Set<SquareId>();
    const add = (f: number, r: number): void => {
      const square = toSquare(f, r);
      if (square) out.add(square);
    };

    if (piece.type === "p") {
      const dir = piece.color === "w" ? 1 : -1;
      add(file, rank + dir);
      if (rank === (piece.color === "w" ? 1 : 6)) add(file, rank + dir * 2);
      // Both diagonals: the capture may not exist yet, and en passant never does.
      add(file - 1, rank + dir);
      add(file + 1, rank + dir);
    } else if (piece.type === "n") {
      for (const [df, dr] of KNIGHT_STEPS) add(file + df, rank + dr);
    } else if (piece.type === "k") {
      for (const [df, dr] of KING_STEPS) add(file + df, rank + dr);
      // Castling is offered from the home square whether or not it is legal yet.
      const home = piece.color === "w" ? "e1" : "e8";
      if (from === home) {
        add(file + 2, rank);
        add(file - 2, rank);
      }
    } else {
      for (const [df, dr] of SLIDES[piece.type]) {
        for (let step = 1; step < 8; step += 1) add(file + df * step, rank + dr * step);
      }
    }

    out.delete(from);
    return [...out];
  }

  /** True when a queued pawn move would land on the last rank. */
  isPremovePromotion(from: SquareId, to: SquareId): boolean {
    const piece = this.chess.get(from as Square);
    if (!piece || piece.type !== "p") return false;
    return to[1] === (piece.color === "w" ? "8" : "1");
  }

  /**
   * Queues a move. Only one is ever held: a second one replaces the first,
   * which is the whole gesture for changing your mind.
   */
  setPremove(from: SquareId, to: SquareId, promotion?: PieceKind): boolean {
    if (!this.canPremove()) return false;
    const piece = this.chess.get(from as Square);
    if (!piece || piece.color !== this.options.playerColor) return false;
    if (!this.premoveTargets(from).includes(to)) return false;
    this.premove = { from, to, promotion: promotion ?? null };
    this.publish();
    this.emit("premove", this.premove);
    return true;
  }

  clearPremove(): void {
    if (!this.premove) return;
    this.premove = null;
    this.publish();
    this.emit("premove", null);
  }

  /**
   * Plays the queued move if the reply left it playable, and drops it if not.
   * Returns true when a move was actually played, so the caller knows the turn
   * has already moved on.
   */
  private async consumePremove(): Promise<boolean> {
    const queued = this.premove;
    if (!queued) return false;
    this.premove = null;

    if (!this.premovesEnabled || this.options.mode !== "ai" || !this.isHumanTurn()) {
      this.publish();
      this.emit("premove", null);
      return false;
    }

    const legal = (this.chess.moves({ square: queued.from as Square, verbose: true }) as Move[]).some(
      (move) => move.to === queued.to,
    );
    this.emit("premove", null);
    if (!legal) {
      this.publish();
      this.emit("premovefailed", { from: queued.from, to: queued.to });
      return false;
    }
    this.publish();
    return this.play(queued.from, queued.to, queued.promotion ?? undefined);
  }

  isHumanTurn(): boolean {
    if (this.status !== "playing" || this.busy) return false;
    if (this.options.mode === "attract" || this.options.mode === "demo") return false;
    if (this.options.mode === "hotseat") return true;
    return this.chess.turn() === this.options.playerColor;
  }

  start(options: StartOptions): void {
    this.generation += 1;
    this.ai.cancel();
    this.clearRematchTimer();
    this.releasePause();
    this.paused = false;
    if (options.mode !== "demo" || this.options.mode !== "demo") this.demoRound = 1;
    this.options = options.mode === "demo" ? { ...options, demo: options.demo ?? DEFAULT_DEMO } : options;
    this.chess = new Chess();
    this.status = "playing";
    this.result = null;
    this.thinking = false;
    this.busy = false;
    this.premove = null;
    const ms = options.clockMinutes ? options.clockMinutes * 60_000 : 0;
    this.clock = {
      enabled: options.clockMinutes !== null,
      initialMs: ms,
      whiteMs: ms,
      blackMs: ms,
    };
    this.elapsed = { w: 0, b: 0 };
    this.timingSide = null;
    this.syncElapsed();
    this.emit("reset", options);
    this.publish();
    this.startClock();
    void this.maybeRunEngine();
  }

  stop(): void {
    this.generation += 1;
    this.ai.cancel();
    this.clearRematchTimer();
    this.stopClock();
    this.status = "idle";
    this.thinking = false;
    this.busy = false;
    this.premove = null;
    this.paused = false;
    this.releasePause();
    this.syncElapsed();
    this.publish();
  }

  // ------------------------------------------------------- showcase controls

  /**
   * Halts the showcase between plies. A search already in flight is allowed to
   * finish, but its move is held back until playback resumes.
   */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.stopClock();
      this.syncElapsed();
    } else {
      this.releasePause();
      this.syncElapsed();
      this.startClock();
    }
    this.publish();
    if (!paused) void this.maybeRunEngine();
  }

  togglePaused(): void {
    this.setPaused(!this.paused);
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Live pacing change — takes effect on the next ply. */
  setDemoSpeed(speed: number): void {
    if (!this.options.demo) return;
    this.options = { ...this.options, demo: { ...this.options.demo, speed: clamp(speed, 0.25, 4) } };
    this.publish();
  }

  setDemoAutoRematch(autoRematch: boolean): void {
    if (!this.options.demo) return;
    this.options = { ...this.options, demo: { ...this.options.demo, autoRematch } };
    if (!autoRematch) this.clearRematchTimer();
    this.publish();
  }

  /** Restart the showcase immediately with the same settings. */
  restartDemo(): void {
    if (this.options.mode !== "demo") return;
    this.demoRound += 1;
    this.start({ ...this.options });
  }

  /**
   * Milliseconds left before the showcase loop starts the next duel, or null
   * when nothing is queued. Read on the dialog's own tick so a running countdown
   * never re-renders the whole interface.
   */
  getDemoRematchRemaining(): number | null {
    if (this.rematchTimer === null) return null;
    return Math.max(0, this.rematchAt - performance.now());
  }

  private releasePause(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && this.status === "playing") {
      await new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    }
  }

  private clearRematchTimer(): void {
    if (this.rematchTimer !== null) {
      clearTimeout(this.rematchTimer);
      this.rematchTimer = null;
    }
  }

  async tryMove(from: SquareId, to: SquareId, promotion?: PieceKind): Promise<boolean> {
    if (!this.isHumanTurn()) return false;
    return this.play(from, to, promotion);
  }

  private async play(from: SquareId, to: SquareId, promotion?: PieceKind): Promise<boolean> {
    let move: Move | null = null;
    try {
      move = this.chess.move({ from, to, promotion: promotion ?? "q" }) as Move;
    } catch {
      move = null;
    }
    if (!move) {
      this.emit("illegal", { from, to });
      return false;
    }
    await this.commit(move);
    return true;
  }

  private async commit(move: Move): Promise<void> {
    const generation = this.generation;
    this.busy = true;
    // The move is already applied, so this charges the thinking time to the side
    // that just played and starts the meter on the reply — the same accounting
    // the countdown clock uses.
    this.syncElapsed();

    const capture = this.buildCapture(move);
    const rook = this.buildRookTrip(move);
    const inCheck = this.chess.isCheck();
    const gameOver = this.chess.isGameOver();

    const event: MoveEvent = {
      color: move.color as Faction,
      kind: move.piece as PieceKind,
      from: move.from,
      to: move.to,
      san: move.san,
      capture,
      rook,
      promotion: (move.promotion as PieceKind | undefined) ?? null,
      isCheck: inCheck,
      isGameOver: gameOver,
    };

    this.publish();
    this.emit("move", event);
    if (inCheck) this.emit("check", this.chess.turn() as Faction);

    if (this.animator) {
      try {
        await this.animator(event);
      } catch (error) {
        console.error("[game] animator failed", error);
      }
    }
    if (generation !== this.generation) return;

    this.busy = false;
    this.publish();

    if (this.checkEnd()) return;
    // A queued move is played from here rather than from the engine turn: the
    // moment the board is handed back is the moment the player meant.
    if (await this.consumePremove()) return;
    void this.maybeRunEngine();
  }

  private buildCapture(move: Move): MoveEvent["capture"] {
    if (move.flags.includes("e")) {
      const square = `${move.to[0]}${move.from[1]}`;
      return { square, kind: "p", color: move.color === "w" ? "b" : "w" };
    }
    if (move.captured) {
      return {
        square: move.to,
        kind: move.captured as PieceKind,
        color: move.color === "w" ? "b" : "w",
      };
    }
    return null;
  }

  private buildRookTrip(move: Move): MoveEvent["rook"] {
    if (move.flags.includes("k")) {
      const rank = move.color === "w" ? "1" : "8";
      return { from: `h${rank}`, to: `f${rank}` };
    }
    if (move.flags.includes("q")) {
      const rank = move.color === "w" ? "1" : "8";
      return { from: `a${rank}`, to: `d${rank}` };
    }
    return null;
  }

  private checkEnd(): boolean {
    if (!this.chess.isGameOver()) return false;
    const loser = this.chess.turn() as Faction;
    if (this.chess.isCheckmate()) {
      this.finish({ winner: loser === "w" ? "b" : "w", reason: "checkmate" });
      return true;
    }
    if (this.chess.isStalemate()) {
      this.finish({ winner: null, reason: "stalemate" });
      return true;
    }
    if (this.chess.isThreefoldRepetition()) {
      this.finish({ winner: null, reason: "threefold" });
      return true;
    }
    if (this.chess.isInsufficientMaterial()) {
      this.finish({ winner: null, reason: "insufficient" });
      return true;
    }
    this.finish({ winner: null, reason: "draw" });
    return true;
  }

  private finish(result: GameResult): void {
    this.generation += 1;
    this.ai.cancel();
    this.stopClock();
    this.releasePause();
    this.status = "over";
    this.thinking = false;
    this.busy = false;
    this.premove = null;
    this.result = result;
    this.syncElapsed();
    this.publish();
    this.emit("gameover", result);
    this.scheduleDemoRematch();
  }

  /** Keeps a recording session rolling: a new duel starts on its own. */
  private scheduleDemoRematch(): void {
    if (this.options.mode !== "demo" || !this.options.demo?.autoRematch) return;
    this.clearRematchTimer();
    this.rematchAt = performance.now() + DEMO_REMATCH_DELAY_MS;
    this.rematchTimer = setTimeout(() => {
      this.rematchTimer = null;
      if (this.status !== "over" || this.options.mode !== "demo") return;
      this.demoRound += 1;
      this.start({ ...this.options });
    }, DEMO_REMATCH_DELAY_MS);
  }

  resign(): void {
    if (this.status !== "playing") return;
    const loser = this.options.mode === "ai" ? this.options.playerColor : (this.chess.turn() as Faction);
    this.finish({ winner: loser === "w" ? "b" : "w", reason: "resignation" });
  }

  /** Undo one ply (hotseat) or a full move pair (vs computer). */
  undo(): boolean {
    if (this.status === "over") {
      this.status = "playing";
      this.result = null;
    }
    if (this.status !== "playing" || this.busy || this.thinking) return false;
    if (this.chess.history().length === 0) return false;
    this.generation += 1;
    this.ai.cancel();
    this.premove = null;
    this.chess.undo();
    if (this.options.mode === "ai" && this.chess.turn() !== this.options.playerColor) {
      this.chess.undo();
    }
    this.thinking = false;
    this.busy = false;
    this.syncElapsed();
    this.publish();
    return true;
  }

  private async maybeRunEngine(): Promise<void> {
    if (this.status !== "playing" || this.paused) return;
    const mode = this.options.mode;
    if (mode === "hotseat") return;
    const turn = this.chess.turn() as Faction;
    if (mode === "ai" && turn === this.options.playerColor) return;
    if (this.thinking) return;

    const generation = this.generation;
    this.thinking = true;
    this.publish();

    const demo = mode === "demo" ? (this.options.demo ?? DEFAULT_DEMO) : null;
    const difficulty: Difficulty =
      mode === "attract" ? "medium" : demo ? (turn === "w" ? demo.white : demo.black) : this.options.difficulty;
    const started = performance.now();
    const best = await this.ai.bestMove(this.chess.fen(), difficulty);
    if (generation !== this.generation || this.status !== "playing") {
      this.thinking = false;
      return;
    }

    // A tiny floor on think time keeps instant replies from feeling robotic;
    // the showcase lingers longer so captures and camera work land on camera.
    const elapsed = performance.now() - started;
    const base = mode === "attract" ? 900 : demo ? 1150 : this.thinkFloorMs;
    const floor = demo ? clamp(base / demo.speed, 120, 6000) : base;
    if (elapsed < floor) await wait(floor - elapsed);
    if (generation !== this.generation || this.status !== "playing") {
      this.thinking = false;
      return;
    }

    // Pausing holds the finished move back instead of throwing the search away.
    if (this.paused) {
      this.thinking = false;
      this.publish();
      await this.waitWhilePaused();
      if (generation !== this.generation || this.status !== "playing") return;
    }

    this.thinking = false;
    if (!best) {
      this.checkEnd();
      this.publish();
      return;
    }
    await this.play(best.from, best.to, best.promotion ?? undefined);
  }

  private startClock(): void {
    this.stopClock();
    if (!this.clock.enabled || this.paused || this.status !== "playing") return;
    this.lastTickAt = performance.now();
    this.clockTimer = setInterval(() => this.tickClock(), CLOCK_TICK_MS);
  }

  private stopClock(): void {
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private tickClock(): void {
    if (this.status !== "playing" || this.paused) return;
    const now = performance.now();
    const delta = now - this.lastTickAt;
    this.lastTickAt = now;
    const turn = this.chess.turn() as Faction;
    if (turn === "w") this.clock.whiteMs = Math.max(0, this.clock.whiteMs - delta);
    else this.clock.blackMs = Math.max(0, this.clock.blackMs - delta);

    if (this.clock.whiteMs === 0 || this.clock.blackMs === 0) {
      const loser: Faction = this.clock.whiteMs === 0 ? "w" : "b";
      this.finish({ winner: loser === "w" ? "b" : "w", reason: "timeout" });
      return;
    }
    this.publish();
  }

  private buildSnapshot(): GameSnapshot {
    const verbose = this.chess.history({ verbose: true }) as Move[];
    const sanList = verbose.map((move) => move.san);
    const history: HistoryRow[] = [];
    for (let i = 0; i < sanList.length; i += 2) {
      history.push({
        number: i / 2 + 1,
        white: sanList[i] ?? null,
        black: sanList[i + 1] ?? null,
      });
    }

    const moves: LedgerMove[] = verbose.map((move, index) => ({
      ply: index,
      number: Math.floor(index / 2) + 1,
      color: move.color as Faction,
      kind: move.piece as PieceKind,
      san: move.san,
      from: move.from,
      to: move.to,
      capture: move.flags.includes("c") || move.flags.includes("e"),
      castle: move.flags.includes("k") || move.flags.includes("q"),
      promotion: (move.promotion as PieceKind | undefined) ?? null,
      check: move.san.endsWith("+"),
      mate: move.san.endsWith("#"),
    }));

    const captured: CapturedPiece[] = [];
    let diff = 0;
    for (const move of verbose) {
      if (!move.captured) continue;
      const kind = move.captured as PieceKind;
      const color: Faction = move.color === "w" ? "b" : "w";
      captured.push({ kind, color });
      diff += color === "b" ? PIECE_VALUE[kind] : -PIECE_VALUE[kind];
    }
    for (const move of verbose) {
      if (!move.promotion) continue;
      const gain = PIECE_VALUE[move.promotion as PieceKind] - PIECE_VALUE.p;
      diff += move.color === "w" ? gain : -gain;
    }

    const last = verbose.length > 0 ? verbose[verbose.length - 1] : null;

    return {
      status: this.status,
      mode: this.options.mode,
      difficulty: this.options.difficulty,
      playerColor: this.options.playerColor,
      turn: this.chess.turn() as Faction,
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      inCheck: this.chess.isCheck(),
      thinking: this.thinking,
      busy: this.busy,
      result: this.result,
      history,
      sanList,
      moves,
      captured,
      materialDiff: diff,
      lastMove: last ? { from: last.from, to: last.to } : null,
      premove: this.premove ? { ...this.premove } : null,
      clock: { ...this.clock },
      elapsed: this.getElapsed(),
      canUndo:
        verbose.length > 0 &&
        !this.thinking &&
        !this.busy &&
        this.options.mode !== "attract" &&
        this.options.mode !== "demo",
      demo: this.options.mode === "demo" ? { ...(this.options.demo ?? DEFAULT_DEMO) } : null,
      paused: this.paused,
      demoRound: this.demoRound,
    };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    this.emit("state", this.snapshot);
  }

  dispose(): void {
    this.stopClock();
    this.clearRematchTimer();
    this.releasePause();
    this.ai.dispose();
    this.clear();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
