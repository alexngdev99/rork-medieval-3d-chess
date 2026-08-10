import { Chess, type Move } from "chess.js";

import { GameController } from "./gameController";
import type { Premove } from "./types";

/**
 * The search runs in a Worker the test environment has no way to spawn, so it
 * is replaced with a stand-in that plays a scripted reply list. Scripted rather
 * than random: every rule below is about what the *reply* does to the queued
 * move, so the reply has to be the thing under control.
 */
function installEngine(script: string[]): void {
  let cursor = 0;
  class ScriptedWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    postMessage(request: { id: number; fen: string }): void {
      const chess = new Chess(request.fen);
      const moves = chess.moves({ verbose: true }) as Move[];
      const wanted = script[cursor];
      cursor += 1;
      const move = moves.find((candidate) => candidate.san === wanted) ?? moves[0];
      queueMicrotask(() => {
        this.onmessage?.({
          data: move
            ? { id: request.id, from: move.from, to: move.to, promotion: move.promotion ?? null, score: 0, depth: 1 }
            : null,
        });
      });
    }

    terminate(): void {}
  }
  (globalThis as unknown as { Worker: unknown }).Worker = ScriptedWorker;
}

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timed out waiting for the board"));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function startAiGame(script: string[]): GameController {
  installEngine(script);
  const controller = new GameController();
  controller.start({ mode: "ai", difficulty: "easy", playerColor: "w", clockMinutes: null });
  return controller;
}

describe("premove targets", () => {
  it("offers squares behind a blocker, because the blocker may move away", () => {
    const controller = startAiGame([]);
    const targets = controller.premoveTargets("a1");
    // The rook's own pawn stands on a2 and its knight on b1; both squares, and
    // everything behind them, stay offerable.
    expect(targets).toContain("a2");
    expect(targets).toContain("a8");
    expect(targets).toContain("b1");
    expect(targets).toContain("h1");
    expect(targets).not.toContain("b2");
    controller.dispose();
  });

  it("offers both castling squares from the king's home square", () => {
    const controller = startAiGame([]);
    const targets = controller.premoveTargets("e1");
    expect(targets).toContain("g1");
    expect(targets).toContain("c1");
    controller.dispose();
  });

  it("offers a pawn both diagonals, capture or not", () => {
    const controller = startAiGame([]);
    const targets = controller.premoveTargets("e2");
    expect(targets.sort()).toEqual(["d3", "e3", "e4", "f3"]);
    controller.dispose();
  });
});

describe("premove queue", () => {
  it("is closed while the board belongs to the player", () => {
    const controller = startAiGame([]);
    expect(controller.canPremove()).toBe(false);
    expect(controller.setPremove("g1", "f3")).toBe(false);
    controller.dispose();
  });

  it("plays the queued move the moment the turn comes back", async () => {
    const controller = startAiGame(["e5"]);
    await controller.tryMove("e2", "e4");
    expect(controller.canPremove()).toBe(true);
    expect(controller.setPremove("g1", "f3")).toBe(true);
    expect(controller.getSnapshot().premove).toEqual<Premove>({ from: "g1", to: "f3", promotion: null });

    await waitFor(() => controller.getSnapshot().sanList.length >= 3);
    expect(controller.getSnapshot().sanList).toEqual(["e4", "e5", "Nf3"]);
    expect(controller.getSnapshot().premove).toBeNull();
    controller.dispose();
  });

  it("drops a queued move the reply made illegal, and says so", async () => {
    const controller = startAiGame(["e5"]);
    const failures: { from: string; to: string }[] = [];
    controller.on("premovefailed", (event) => failures.push(event));

    await controller.tryMove("e2", "e4");
    // The pawn cannot walk onto the square the reply is about to occupy.
    expect(controller.setPremove("e4", "e5")).toBe(true);

    await waitFor(() => failures.length > 0);
    expect(failures[0]).toEqual({ from: "e4", to: "e5" });
    expect(controller.getSnapshot().sanList).toEqual(["e4", "e5"]);
    expect(controller.getSnapshot().premove).toBeNull();
    expect(controller.isHumanTurn()).toBe(true);
    controller.dispose();
  });

  it("drops a queued move whose piece was captured", async () => {
    const controller = startAiGame(["d5", "Qxd5"]);
    const failures: { from: string; to: string }[] = [];
    controller.on("premovefailed", (event) => failures.push(event));

    await controller.tryMove("e2", "e4");
    await waitFor(() => controller.isHumanTurn());
    await controller.tryMove("e4", "d5");
    expect(controller.setPremove("d5", "d6")).toBe(true);

    await waitFor(() => failures.length > 0);
    expect(failures[0]).toEqual({ from: "d5", to: "d6" });
    expect(controller.getSnapshot().sanList).toEqual(["e4", "d5", "exd5", "Qxd5"]);
    controller.dispose();
  });

  it("keeps only the last move queued", async () => {
    const controller = startAiGame(["e5"]);
    await controller.tryMove("e2", "e4");
    controller.setPremove("g1", "f3");
    controller.setPremove("b1", "c3");
    expect(controller.getSnapshot().premove).toEqual<Premove>({ from: "b1", to: "c3", promotion: null });

    await waitFor(() => controller.getSnapshot().sanList.length >= 3);
    expect(controller.getSnapshot().sanList).toEqual(["e4", "e5", "Nc3"]);
    controller.dispose();
  });

  it("stands down entirely when the player turns it off", async () => {
    const controller = startAiGame(["e5"]);
    await controller.tryMove("e2", "e4");
    controller.setPremove("g1", "f3");
    controller.setPremovesEnabled(false);
    expect(controller.getSnapshot().premove).toBeNull();
    expect(controller.canPremove()).toBe(false);

    await waitFor(() => controller.isHumanTurn());
    expect(controller.getSnapshot().sanList).toEqual(["e4", "e5"]);
    controller.dispose();
  });

  it("forgets the queue when a new game starts", async () => {
    const controller = startAiGame(["e5"]);
    await controller.tryMove("e2", "e4");
    controller.setPremove("g1", "f3");
    controller.start({ mode: "ai", difficulty: "easy", playerColor: "w", clockMinutes: null });
    expect(controller.getSnapshot().premove).toBeNull();
    controller.dispose();
  });
});
