import { db, OpeningNode, OpeningTree } from "../db";
import { Chess } from "chess.js";

export async function createTree(name: string, color: "white" | "black"): Promise<number> {
  const id = await db.openingTrees.add({
    name,
    color,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id as number;
}

export async function addNode(node: Omit<OpeningNode, "id">): Promise<number> {
  const id = await db.openingNodes.add(node);
  return id as number;
}

export async function getTreeNodes(treeId: number): Promise<OpeningNode[]> {
  return db.openingNodes.where("treeId").equals(treeId).toArray();
}

export async function getTrees(): Promise<OpeningTree[]> {
  return db.openingTrees.orderBy("createdAt").reverse().toArray();
}

export async function deleteTree(treeId: number): Promise<void> {
  await db.openingNodes.where("treeId").equals(treeId).delete();
  await db.openingTrees.delete(treeId);
}

export function findDeviationMove(
  gameMoves: string[],
  treeNodes: OpeningNode[]
): number | null {
  const chess = new Chess();
  const nodesByFen = new Map<string, OpeningNode>();

  for (const node of treeNodes) {
    nodesByFen.set(node.fen, node);
  }

  for (let i = 0; i < gameMoves.length; i++) {
    try {
      chess.move(gameMoves[i]);
      const fen = chess.fen();
      if (!nodesByFen.has(fen)) {
        return i + 1;
      }
    } catch {
      return i + 1;
    }
  }
  return null;
}
