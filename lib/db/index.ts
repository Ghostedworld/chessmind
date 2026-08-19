import Dexie, { Table } from "dexie";

export interface OpeningTree {
  id?: number;
  name: string;
  color: "white" | "black";
  createdAt: Date;
  updatedAt: Date;
}

export interface OpeningNode {
  id?: number;
  treeId: number;
  parentId?: number;
  moveSan: string;
  fen: string;
  moveNumber: number;
  notes: string;
  evalTag: "best" | "good" | "inaccuracy" | "mistake" | "";
  confidence: "green" | "amber" | "red";
  variationName?: string;
  drillScore?: number;
  drillDueAt?: Date;
  referenceGameIds: number[];
  patternIds: number[];
}

export interface SavedGame {
  id?: number;
  pgn: string;
  result: string;
  playerColor: "white" | "black";
  engineElo: number;
  opponentRating?: number;
  hasClockData?: boolean;
  source?: "simulator" | "chessdotcom" | "lichess" | "historical" | "facing_opening";
  platformGameId?: string;
  timeControl?: string;
  playedAt: Date;
  opening?: string;
}

export interface TacticsPuzzle {
  id?: number;
  fen: string;
  playerColor: "white" | "black";
  blunderMove: string;
  bestMove: string;
  cpLoss: number;
  theme: string;
  sourceGameId: number;
  moveNumber: number;
  attempts: number;
  solved: boolean;
  dueAt: Date;
  addedAt: Date;
}

export interface TacticsPuzzle {
  id?: number;
  fen: string;
  playerColor: "white" | "black";
  blunderMove: string;
  bestMove: string;
  cpLoss: number;
  theme: string;
  sourceGameId: number;
  moveNumber: number;
  attempts: number;
  solved: boolean;
  dueAt: Date;
  addedAt: Date;
}

export interface HistoricalGame {
  id?: number;
  pgn: string;
  white: string;
  black: string;
  event?: string;
  date?: string;
  result: string;
  eco?: string;
  openingName?: string;
  tags: string[]; // user-defined tags like "sacrifice", "endgame", "famous"
  source: "bundle_import" | "manual";
  addedAt: Date;
}

export interface PlatformAccount {
  id?: number;
  platform: "chessdotcom" | "lichess";
  username: string;
  lastSyncedAt: Date;
  totalGamesImported: number;
  earliestGameAt: Date;
}

export interface AppSettings {
  id?: number;
  key: string;
  value: string;
}

class ChessMindDB extends Dexie {
  openingTrees!: Table<OpeningTree>;
  openingNodes!: Table<OpeningNode>;
  games!: Table<SavedGame>;
  settings!: Table<AppSettings>;
  platformAccounts!: Table<PlatformAccount>;
  historicalGames!: Table<HistoricalGame>;
  tacticsPuzzles!: Table<TacticsPuzzle>;
  tacticsPuzzles!: Table<TacticsPuzzle>;

  constructor() {
    super("ChessMindDB");
    this.version(1).stores({
      openingTrees: "++id, name, color, createdAt",
      openingNodes: "++id, treeId, parentId, fen, moveNumber",
      games: "++id, result, playerColor, playedAt, source, platformGameId",
      settings: "++id, key",
    }).upgrade(() => {});
    this.version(2).stores({
      openingTrees: "++id, name, color, createdAt",
      openingNodes: "++id, treeId, parentId, fen, moveNumber",
      games: "++id, result, playerColor, playedAt, source, platformGameId",
      settings: "++id, key",
      platformAccounts: "++id, platform, username",
    });
    this.version(3).stores({
      openingTrees: "++id, name, color, createdAt",
      openingNodes: "++id, treeId, parentId, fen, moveNumber",
      games: "++id, result, playerColor, playedAt, source, platformGameId",
      settings: "++id, key",
      platformAccounts: "++id, platform, username",
      historicalGames: "++id, white, black, eco, source, addedAt",
    });
    this.version(4).stores({
      openingTrees: "++id, name, color, createdAt",
      openingNodes: "++id, treeId, parentId, fen, moveNumber",
      games: "++id, result, playerColor, playedAt, source, platformGameId",
      settings: "++id, key",
      platformAccounts: "++id, platform, username",
      historicalGames: "++id, white, black, eco, source, addedAt",
      tacticsPuzzles: "++id, fen, playerColor, theme, solved, dueAt, addedAt",
    });
    this.version(4).stores({
      openingTrees: "++id, name, color, createdAt",
      openingNodes: "++id, treeId, parentId, fen, moveNumber",
      games: "++id, result, playerColor, playedAt, source, platformGameId",
      settings: "++id, key",
      platformAccounts: "++id, platform, username",
      historicalGames: "++id, white, black, eco, source, addedAt",
      tacticsPuzzles: "++id, fen, playerColor, theme, solved, dueAt, addedAt",
    });
  }
}

export const db = new ChessMindDB();

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.where("key").equals(key).first();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.settings.where("key").equals(key).first();
  if (existing?.id) {
    await db.settings.update(existing.id, { value });
  } else {
    await db.settings.add({ key, value });
  }
}

export async function saveGame(game: Omit<SavedGame, "id">): Promise<number> {
  return await db.games.add(game) as number;
}

export async function getRecentGames(limit = 20): Promise<SavedGame[]> {
  return await db.games.orderBy("playedAt").reverse().limit(limit).toArray();
}

// Fix moveNumbers for any tree that has all nodes at moveNumber=1
export async function fixMoveNumbers(): Promise<void> {
  const trees = await db.openingTrees.toArray();
  for (const tree of trees) {
    if (!tree.id) continue;
    const nodes = await db.openingNodes.where("treeId").equals(tree.id).toArray();
    if (nodes.length === 0) continue;

    // Check if all are broken (moveNumber=1)
    const allBroken = nodes.every(n => n.moveNumber === 1);
    if (!allBroken) continue;

    // Rebuild moveNumbers by traversing tree
    const childMap = new Map<number | undefined, OpeningNode[]>();
    nodes.forEach(n => {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n);
    });

    async function fix(parentId: number | undefined, depth: number) {
      const children = childMap.get(parentId) || [];
      for (const child of children) {
        if (child.id) {
          await db.openingNodes.update(child.id, { moveNumber: depth });
          await fix(child.id, depth + 1);
        }
      }
    }

    await fix(undefined, 1);
  }
}
