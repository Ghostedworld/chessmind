import { Chess } from "chess.js";
import { db } from "@/lib/db";

export interface BlunderPuzzle {
  fen: string;
  playerColor: "white" | "black";
  bestMove: string;
  blunderMove: string;
  cpLoss: number;
  moveNumber: number;
  sourceGameId: number;
  theme: string;
  attempts: number;
  solved: boolean;
  dueAt: Date;
  addedAt: Date;
}

const BLUNDER_THRESHOLD = 150;
const DEPTH = 14;

// FEN cache — same position won't be evaluated twice across all games
const evalCache = new Map<string, { cp: number; bestMove: string }>();

function evalWithStockfish(
  worker: Worker,
  fen: string,
  depth: number
): Promise<{ cp: number; bestMove: string }> {
  // Check cache first — massive speedup for repeated opening positions
  const cacheKey = fen.split(" ").slice(0, 4).join(" ");
  if (evalCache.has(cacheKey)) {
    return Promise.resolve(evalCache.get(cacheKey)!);
  }

  return new Promise((resolve) => {
    let bestCp = 0;
    let bestMove = "";
    const handler = (e: MessageEvent) => {
      const line: string = e.data;
      if (line.startsWith("info") && line.includes("score cp")) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (cpMatch) bestCp = parseInt(cpMatch[1]);
        if (pvMatch) bestMove = pvMatch[1];
      }
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        if (parts[1] && parts[1] !== "(none)") bestMove = parts[1];
        worker.removeEventListener("message", handler);
        const result = { cp: bestCp, bestMove };
        evalCache.set(cacheKey, result);
        resolve(result);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage("stop");
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage(`go depth ${depth}`);
  });
}

function guessTheme(fen: string, bestMoveSan: string, cpLoss: number): string {
  const chess = new Chess(fen);
  try {
    const after = new Chess(fen);
    after.move(bestMoveSan);
    if (after.isCheckmate()) return "checkmate";
    if (after.isCheck()) return "check-tactic";
    const afterMoves = after.moves({ verbose: true }) as any[];
    const dangerCaptures = afterMoves.filter((m: any) =>
      m.flags.includes("c") && ["q","r"].includes(m.captured || "")
    );
    if (dangerCaptures.length >= 2) return "fork";
    if (dangerCaptures.length === 1 && dangerCaptures[0].captured === "q") return "queen-fork";
  } catch { /**/ }

  if (cpLoss >= 900) return "queen-blunder";
  if (cpLoss >= 500) return "rook-blunder";
  if (cpLoss >= 300) return "major-blunder";
  return "tactical-miss";
}

export async function runStockfishScan(
  onProgress: (scanned: number, total: number, puzzlesFound: number) => void,
  signal: { cancelled: boolean },
  recentOnly = false
): Promise<{ puzzlesFound: number; gamesScanned: number }> {

  // Single dedicated Stockfish worker for scanning
  const worker = new Worker("/stockfish.js");
  await new Promise<void>(resolve => {
    const h = (e: MessageEvent) => {
      if (e.data === "readyok") { worker.removeEventListener("message", h); resolve(); }
    };
    worker.addEventListener("message", h);
    worker.postMessage("uci");
    worker.postMessage("setoption name Hash value 128");
    worker.postMessage("isready");
  });

  // Fix 2: Recent games first — most relevant blunders surface immediately
  let games = await db.games
    .filter(g => g.source === "chessdotcom" || g.source === "lichess")
    .toArray();
  games.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  if (recentOnly) games = games.slice(0, 100);

  const existing = await db.table("tacticsPuzzles").toArray().catch(() => []);
  const existingFens = new Set(
    existing.map((p: any) => p.fen.split(" ").slice(0, 3).join(" "))
  );

  let puzzlesFound = 0;
  let scanned = 0;

  for (const game of games) {
    if (signal.cancelled) break;
    scanned++;
    onProgress(scanned, games.length, puzzlesFound);

    if (!game.pgn) continue;

    try {
      const chess = new Chess();
      chess.loadPgn(game.pgn);
      const history = chess.history({ verbose: true }) as any[];
      const replay = new Chess();

      // Fix 1: 1 eval per move — eval current position, then advance
      // The eval AFTER player's move = -(eval of opponent's position before their move)
      // So we only eval once per half-move, reusing previous result
      let prevEval: { cp: number; bestMove: string } | null = null;

      for (let i = 0; i < Math.min(history.length, 60); i++) {
        if (signal.cancelled) break;

        const move = history[i];
        const fenBefore = replay.fen();
        const fenKey = fenBefore.split(" ").slice(0, 3).join(" ");

        const isPlayerMove =
          (game.playerColor === "white" && i % 2 === 0) ||
          (game.playerColor === "black" && i % 2 !== 0);

        // Fix 1: reuse previous eval instead of re-evaluating
        // prevEval from last iteration = eval of this position from opponent's view
        // so flip it to get our view
        const evalBefore = prevEval !== null
          ? { cp: -prevEval.cp, bestMove: "" }
          : await evalWithStockfish(worker, fenBefore, DEPTH);

        // Now get current position's eval (this IS the next iteration's prevEval)
        const currentEval = await evalWithStockfish(worker, fenBefore, DEPTH);

        replay.move(move.san);
        prevEval = currentEval;

        if (!isPlayerMove || existingFens.has(fenKey)) continue;

        // Skip already-decided positions
        if (Math.abs(currentEval.cp) > 800) continue;

        const cpBefore = currentEval.cp; // from current player's view
        const cpAfter = -prevEval.cp; // after move, opponent's eval, flipped back

        // Advance to get fenAfter for cpAfter calculation
        const fenAfter = replay.fen();
        const afterEval = await evalWithStockfish(worker, fenAfter, DEPTH);
        const cpLoss = cpBefore - (-afterEval.cp);

        if (
          cpLoss >= BLUNDER_THRESHOLD &&
          currentEval.bestMove !== "" &&
          currentEval.bestMove !== move.lan
        ) {
          // Convert LAN bestMove to SAN
          const sanChess = new Chess(fenBefore);
          let bestSan = currentEval.bestMove;
          try {
            const m = sanChess.move({
              from: currentEval.bestMove.slice(0,2) as any,
              to: currentEval.bestMove.slice(2,4) as any,
              promotion: currentEval.bestMove[4] || "q"
            });
            if (m) bestSan = m.san;
          } catch { /**/ }

          const puzzle: BlunderPuzzle = {
            fen: fenBefore,
            playerColor: game.playerColor,
            bestMove: bestSan,
            blunderMove: move.san,
            cpLoss: Math.round(cpLoss),
            moveNumber: i + 1,
            sourceGameId: game.id!,
            theme: guessTheme(fenBefore, bestSan, cpLoss),
            attempts: 0,
            solved: false,
            dueAt: new Date(),
            addedAt: new Date(),
          };

          await db.table("tacticsPuzzles").add(puzzle);
          existingFens.add(fenKey);
          puzzlesFound++;
        }
      }
    } catch { /**/ }
  }

  worker.terminate();
  return { puzzlesFound, gamesScanned: scanned };
}
