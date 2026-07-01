import { Chess } from "chess.js";
import { db, OpeningNode, OpeningTree } from "@/lib/db";

export interface DeviationResult {
  treeId: number;
  treeName: string;
  deviationMove: number | null; // null = stayed in book whole game
  deviationFen: string | null;
  playerMoveSan: string | null; // what you played
  bookMoveSan: string | null;   // what your tree says
  bookMoveOptions: string[];    // all book options at that position
  coveredMoves: number;         // how many moves matched the tree
  totalMoves: number;
  opponentLeftBook: boolean;    // true if opponent deviated first, not you
  opponentLeftBookMove: number | null;
}

export async function analyseDeviation(
  pgn: string,
  playerColor: "white" | "black"
): Promise<DeviationResult[]> {
  // Get all trees for this color
  const trees = await db.openingTrees
    .filter(t => t.color === playerColor)
    .toArray();

  if (trees.length === 0) return [];

  const results: DeviationResult[] = [];

  for (const tree of trees) {
    const nodes = await db.openingNodes
      .where("treeId").equals(tree.id!)
      .toArray();

    if (nodes.length === 0) continue;

    // Build fen -> nodes map
    const nodesByParentAndMove = new Map<string, OpeningNode>();
    nodes.forEach(n => {
      const key = `${n.parentId ?? "root"}_${n.moveSan}`;
      nodesByParentAndMove.set(key, n);
    });

    // Walk the game
    const game = new Chess();
    try { game.loadPgn(pgn); } catch { continue; }
    const history = game.history({ verbose: true }) as any[];

    const fresh = new Chess();
    let currentParentId: number | undefined = undefined;
    let deviationMove: number | null = null;
    let deviationFen: string | null = null;
    let playerMoveSan: string | null = null;
    let bookMoveSan: string | null = null;
    let bookMoveOptions: string[] = [];
    let coveredMoves = 0;
    let opponentLeftBook = false;
    let opponentLeftBookMove: number | null = null;

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const moveNum = i + 1;
      const isPlayerMove =
        (playerColor === "white" && move.color === "w") ||
        (playerColor === "black" && move.color === "b");

      if (!isPlayerMove) {
        fresh.move(move.san);
        // Check if opponent's move matches our tree
        const key = `${currentParentId ?? "root"}_${move.san}`;
        const node = nodesByParentAndMove.get(key);
        if (node) {
          currentParentId = node.id;
        } else {
          // Opponent deviated from what our tree expects
          opponentLeftBook = true;
          opponentLeftBookMove = moveNum;
          break;
        }
        continue;
      }

      // Player's move — check if it's in the tree
      const key = `${currentParentId ?? "root"}_${move.san}`;
      const node = nodesByParentAndMove.get(key);

      if (node) {
        coveredMoves++;
        currentParentId = node.id;
        fresh.move(move.san);
      } else {
        // Deviation found
        deviationMove = moveNum;
        deviationFen = fresh.fen();
        playerMoveSan = move.san;

        // Find all book options at this position
        const options = nodes.filter(n => n.parentId === currentParentId);
        bookMoveOptions = options.map(n => n.moveSan);
        bookMoveSan = bookMoveOptions[0] ?? null;
        break;
      }
    }

    results.push({
      treeId: tree.id!,
      treeName: tree.name,
      deviationMove,
      deviationFen,
      playerMoveSan,
      bookMoveSan,
      bookMoveOptions,
      coveredMoves,
      opponentLeftBook,
      opponentLeftBookMove,
      totalMoves: history.filter((m: any) =>
        (playerColor === "white" && m.color === "w") ||
        (playerColor === "black" && m.color === "b")
      ).length,
    });
  }

  return results;
}
