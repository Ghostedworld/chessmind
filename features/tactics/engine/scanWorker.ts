// Web Worker for background blunder scanning — runs off main thread

/// <reference lib="webworker" />

import { Chess } from "chess.js";

interface ScanGame {
  id: number;
  pgn: string;
  playerColor: "white" | "black";
}

interface Puzzle {
  fen: string;
  playerColor: "white" | "black";
  bestMove: string;
  blunderMove: string;
  cpLoss: number;
  moveNumber: number;
  sourceGameId: number;
  theme: string;
  addedAt: string;
  attempts: number;
  solved: boolean;
  dueAt: string;
}

const PIECE_VALUES: Record<string, number> = { q:9, r:5, b:3, n:3, p:1 };
const PIECE_NAMES: Record<string, string> = { q:"queen", r:"rook", b:"bishop", n:"knight", p:"pawn" };

function guessTheme(san: string, captureCount: number): string {
  if (captureCount >= 2) return "fork";
  if (san.includes("#")) return "checkmate";
  if (san.includes("+")) return "discovered-check";
  if (san.startsWith("R") || san.startsWith("Q")) return "back-rank";
  if (san.startsWith("N")) return "knight-tactic";
  return "hanging-piece";
}

self.onmessage = (e: MessageEvent) => {
  const { games, existingFens } = e.data as {
    games: ScanGame[];
    existingFens: string[];
  };

  const fenSet = new Set<string>(existingFens);
  const puzzles: Puzzle[] = [];
  let scanned = 0;

  for (const game of games) {
    scanned++;

    if (!game.pgn) {
      if (scanned % 20 === 0) self.postMessage({ type:"progress", scanned, total:games.length });
      continue;
    }

    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const history = chess.history({ verbose: true }) as any[];
      const replay = new Chess();

      for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const fenBefore = replay.fen();
        const fenKey = fenBefore.split(" ").slice(0, 3).join(" ");

        // Only check player's moves
        const isPlayerMove =
          (game.playerColor === "white" && i % 2 === 0) ||
          (game.playerColor === "black" && i % 2 !== 0);

        if (isPlayerMove && !fenSet.has(fenKey)) {
          // Find all available captures
          const available = replay.moves({ verbose: true }) as any[];
          const captures = available
            .filter((m: any) => m.flags.includes("c") && m.captured && PIECE_VALUES[m.captured])
            .sort((a: any, b: any) => (PIECE_VALUES[b.captured] || 0) - (PIECE_VALUES[a.captured] || 0));

          // Only puzzle if player wins material (captured piece worth MORE than attacker)
          const best = captures[0];
          const materialGain = best
            ? (PIECE_VALUES[best.captured] || 0) - (PIECE_VALUES[best.piece] || 0)
            : -1;

          if (best && materialGain > 0 && best.san !== move.san) {
            puzzles.push({
              fen: fenBefore,
              playerColor: game.playerColor,
              bestMove: best.san,
              blunderMove: move.san,
              cpLoss: materialGain * 100,
              moveNumber: i + 1,
              sourceGameId: game.id,
              theme: guessTheme(best.san, captures.filter((c: any) =>
                (PIECE_VALUES[c.captured]||0) - (PIECE_VALUES[c.piece]||0) > 0
              ).length),
              addedAt: new Date().toISOString(),
              attempts: 0,
              solved: false,
              dueAt: new Date().toISOString(),
            });
            fenSet.add(fenKey);
          }
        }

        try { replay.move(move.san); } catch { break; }
      }
    } catch { /**/ }

    if (scanned % 20 === 0) {
      self.postMessage({ type:"progress", scanned, total:games.length });
    }
  }

  self.postMessage({ type:"done", puzzles, scanned });
};
