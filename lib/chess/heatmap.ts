import { Chess } from "chess.js";
import { db, OpeningNode } from "@/lib/db";

export interface NodeStats {
  nodeId: number;
  wins: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number;
  score: number;
}

function truncateFen(fen: string): string {
  return fen.split(" ").slice(0, 3).join(" ");
}

export async function computeHeatmap(
  nodes: OpeningNode[],
  playerColor: "white" | "black"
): Promise<Record<number, NodeStats>> {
  const stats: Record<number, NodeStats> = {};

  const games = await db.games
    .filter(g =>
      (g.source === "chessdotcom" || g.source === "lichess") &&
      g.playerColor === playerColor
    )
    .toArray();

  if (games.length === 0) return stats;

  const fenResults = new Map<string, { wins: number; draws: number; losses: number }>();

  for (const game of games) {
    const g = new Chess();
    try { g.loadPgn(game.pgn); } catch { continue; }

    const isWin =
      (playerColor === "white" && game.result === "1-0") ||
      (playerColor === "black" && game.result === "0-1");
    const isDraw = game.result === "1/2-1/2";

    const replay = new Chess();
    const history = g.history({ verbose: true }) as any[];

    for (const move of history) {
      try {
        replay.move(move.san);
        const fen = truncateFen(replay.fen());
        if (!fenResults.has(fen)) {
          fenResults.set(fen, { wins: 0, draws: 0, losses: 0 });
        }
        const r = fenResults.get(fen)!;
        if (isWin) r.wins++;
        else if (isDraw) r.draws++;
        else r.losses++;
      } catch { break; }
    }
  }

  for (const node of nodes) {
    if (!node.id) continue;
    const fen = truncateFen(node.fen);
    const result = fenResults.get(fen);
    if (!result) continue;

    const total = result.wins + result.draws + result.losses;
    if (total === 0) continue;

    const winRate = Math.round((result.wins / total) * 100);
    const score = Math.round(((result.wins + result.draws * 0.5) / total) * 100);

    stats[node.id] = {
      nodeId: node.id,
      wins: result.wins,
      draws: result.draws,
      losses: result.losses,
      total,
      winRate,
      score,
    };
  }

  return stats;
}

export function getHeatmapColor(score: number): string {
  if (score >= 60) return "#34d399";
  if (score >= 45) return "#fbbf24";
  return "#f87171";
}
