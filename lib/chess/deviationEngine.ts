import { Chess } from "chess.js";
import { db } from "@/lib/db";

const STARTING_FEN_TRUNCATED = new Chess().fen().split(" ").slice(0, 4).join(" ");

function truncateFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Find the best engine move that either:
 * 1. Follows a White-colored tree (engine's own prep), OR
 * 2. Walks the position into one of the player's trees (so the player gets
 *    to practice their prep, regardless of which tree color it's filed under)
 *
 * This means: if player is Black with a Caro-Kann tree (color: black),
 * and the engine needs to find White's move, we look at the Caro-Kann tree's
 * root-level move's PARENT context — i.e. what White move would lead to
 * positions inside this tree.
 */
export async function getBookMove(
  fen: string,
  opponentColor: "white" | "black", // color the engine is playing
  treeId?: number,
  playerColor?: "white" | "black"
): Promise<string | null> {
  const currentFenParts = truncateFen(fen);
  const isStartingPosition = currentFenParts === STARTING_FEN_TRUNCATED;

  // Strategy 1: Check engine's own color trees (opponent-perspective trees)
  const engineTrees = treeId
    ? [await db.openingTrees.get(treeId)].filter(Boolean)
    : await db.openingTrees.filter(t => t.color === opponentColor).toArray();

  for (const tree of engineTrees) {
    if (!tree?.id) continue;
    const move = await findCandidateMove(tree.id, currentFenParts, isStartingPosition);
    if (move) return move;
  }

  // Strategy 2: Check player's trees — walk the engine's move into the
  // player's prep so they get to practice it, regardless of stored color
  if (playerColor) {
    const playerTrees = await db.openingTrees.filter(t => t.color === playerColor).toArray();

    for (const tree of playerTrees) {
      if (!tree?.id) continue;

      // We need to find: among all nodes in this tree, is there one whose
      // PARENT's fen matches our current position? That parent's move
      // would be the player's expected response, but we need OUR move
      // (the engine's) which is what leads TO that parent position.
      //
      // Actually simpler: every node in the tree alternates colors by ply.
      // If currentFenParts matches a node's fen, and that node's move was
      // played by playerColor, then we want to look at finding what move
      // (by opponentColor) leads to the position where the player's node
      // would be playable. Since chess positions are sequential, the
      // immediately preceding position is the one before that node — which
      // means we want nodes whose PARENT fen matches our current position,
      // and the node itself represents the opponent's reply that walks into
      // player's prep. But actually we want: does a node exist whose own
      // fen matches our CURRENT position with one move applied (a child of
      // a node matching current position)? If that child was made by
      // opponentColor and leads toward eventually player's tree continuing...
      //
      // Simplified and correct approach: just check if any node's fen
      // (representing position AFTER a move) matches our current position.
      // If so, and there's a parent chain showing the position continues
      // deeper in the player's repertoire, the move that GOT US to "current
      // position" was made by someone. We want the NEXT move in the tree
      // from current position, which child nodes represent regardless of
      // whose move it technically is — since the tree itself encodes the
      // full sequence (both colors' moves).
      const move = await findCandidateMove(tree.id, currentFenParts, isStartingPosition);
      if (move) return move;
    }
  }

  return null;
}

async function findCandidateMove(
  treeId: number,
  currentFenParts: string,
  isStartingPosition: boolean
): Promise<string | null> {
  let candidateNodes;

  if (isStartingPosition) {
    candidateNodes = await db.openingNodes
      .where("treeId").equals(treeId)
      .and(n => n.parentId === undefined)
      .toArray();
  } else {
    const matchingNode = await db.openingNodes
      .where("treeId").equals(treeId)
      .and(n => truncateFen(n.fen) === currentFenParts)
      .first();

    if (!matchingNode?.id) return null;

    candidateNodes = await db.openingNodes
      .where("treeId").equals(treeId)
      .and(n => n.parentId === matchingNode.id)
      .toArray();
  }

  if (candidateNodes.length > 0) {
    const chosen = candidateNodes[Math.floor(Math.random() * candidateNodes.length)];
    return chosen.moveSan;
  }

  return null;
}

export async function shouldFollowBook(deviationProbability: number): Promise<boolean> {
  const roll = Math.random() * 100;
  return roll >= deviationProbability;
}
