import { Chess } from "chess.js";
import { db } from "@/lib/db";

export interface TacticsPuzzle {
  id?: number;
  fen: string;           // position BEFORE the blunder (this is the puzzle)
  playerColor: "white" | "black";
  blunderMove: string;   // what was actually played (wrong)
  bestMove: string;      // what should have been played
  cpLoss: number;        // centipawn loss
  theme: string;         // fork, pin, back-rank, etc.
  sourceGameId: number;
  moveNumber: number;
  attempts: number;
  solved: boolean;
  dueAt: Date;
  addedAt: Date;
}

export interface ScanResult {
  puzzlesFound: number;
  gamesScanned: number;
  skipped: number;
}

/**
 * Scan imported games for blunders and generate puzzles.
 * Only generates a puzzle if:
 * - cp_loss >= 150 (blunder threshold)
 * - Best move would have kept eval within [-100, 100] or winning
 * - FEN not already in puzzles table (dedup)
 */
export async function scanGamesForBlunders(
  onProgress?: (scanned: number, total: number) => void
): Promise<ScanResult> {
  const games = await db.games
    .filter(g => g.source === "chessdotcom" || g.source === "lichess")
    .toArray();

  const existingFens = new Set(
    (await db.table("tactics_puzzles").toArray().catch(() => [])).map((p: any) => p.fen)
  );

  let puzzlesFound = 0;
  let skipped = 0;

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi];
    onProgress?.(gi + 1, games.length);

    if (!game.pgn) { skipped++; continue; }

    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const history = chess.history({ verbose: true }) as any[];

      // We need Stockfish eval per move — for now generate from PGN annotations
      // Phase 3.2 will add actual Stockfish scanning
      // For now: detect obvious material blunders
      const replay = new Chess();
      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const fenBefore = replay.fen();
        replay.move(move.san);

        // Detect if a capture was missed (simple blunder proxy)
        // Full Stockfish scanning is Phase 3.2
        if (move.captured && !move.san.includes("x")) continue;

        // Check if this was a hanging piece capture that was missed
        const isPlayerMove =
          (game.playerColor === "white" && i % 2 === 0) ||
          (game.playerColor === "black" && i % 2 === 1);

        if (!isPlayerMove) continue;
        if (existingFens.has(fenBefore)) { skipped++; continue; }
      }
    } catch { skipped++; }
  }

  return { puzzlesFound, gamesScanned: games.length, skipped };
}

/**
 * Guess tactical theme from position features
 */
export function guessTheme(fen: string, bestMove: string): string {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true }) as any[];

  // Check for fork (one piece attacks two)
  const movesAfterBest = new Chess(fen);
  try {
    movesAfterBest.move(bestMove);
    const afterMoves = movesAfterBest.moves({ verbose: true }) as any[];
    const captures = afterMoves.filter((m: any) => m.flags.includes("c"));
    if (captures.length >= 2) return "fork";
  } catch { /**/ }

  // Check for back rank
  if (bestMove.endsWith("8") || bestMove.endsWith("1")) return "back-rank";

  // Check for pin (moving piece reveals attack)
  if (bestMove.startsWith("B") || bestMove.startsWith("R") || bestMove.startsWith("Q")) return "pin";

  return "tactics";
}
