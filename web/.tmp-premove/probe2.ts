/** Second pass: measure survival for premoves that are *already* legal when
 *  they are placed (the sensible ones a real player would pick), using a FEN
 *  with the side-to-move flipped so chess.js will generate them. */
import { Chess, type Move, type Square } from "chess.js";

import { Search } from "./engine";

function flip(fen: string): string {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  return parts.join(" ");
}

function legalForWhite(fen: string): Move[] {
  try {
    return new Chess(flip(fen)).moves({ verbose: true }) as Move[];
  } catch {
    return [];
  }
}

function isLegalNow(chess: Chess, from: string, to: string): boolean {
  return (chess.moves({ square: from as Square, verbose: true }) as Move[]).some((move) => move.to === to);
}

let offered = 0;
let survived = 0;
let lostPieceGone = 0;
let lostBlocked = 0;
let lostCheck = 0;

for (let game = 0; game < 6; game += 1) {
  const chess = new Chess();
  for (let ply = 0; ply < 60 && !chess.isGameOver(); ply += 1) {
    if (chess.turn() === "w") {
      const moves = chess.moves({ verbose: true }) as Move[];
      chess.move(moves[Math.floor(Math.random() * moves.length)] as unknown as { from: string; to: string });
      if (chess.isGameOver()) break;
    }
    // Black (the engine) is to move: this is the premove window.
    const candidates = legalForWhite(chess.fen());
    const pick = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    const search = new Search(chess.fen(), 700);
    const result = search.run(3, false);
    if (!result) break;
    chess.move(result.move as unknown as { from: string; to: string; promotion?: string });
    if (chess.isGameOver()) break;

    if (!pick) continue;
    offered += 1;
    if (isLegalNow(chess, pick.from, pick.to)) survived += 1;
    else if (!chess.get(pick.from as Square)) lostPieceGone += 1;
    else if (chess.isCheck()) lostCheck += 1;
    else lostBlocked += 1;
  }
}

const pct = (value: number): string => `${((value / Math.max(1, offered)) * 100).toFixed(1)}%`;
console.log(`already-legal premoves offered: ${offered}`);
console.log(`survived engine reply: ${pct(survived)}`);
console.log(`lost — piece captured ${pct(lostPieceGone)}, king in check ${pct(lostCheck)}, blocked/other ${pct(lostBlocked)}`);
