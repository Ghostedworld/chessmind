export type GambitMode = "attack" | "defend" | "decline" | "convert";

export interface CompensationProfile {
  material: number;       // centipawns
  initiative: number;     // -1.0 to +1.0
  kingSafety: number;     // -1.0 to +1.0
  activity: number;       // -1.0 to +1.0
  structure: number;      // -1.0 to +1.0
  compositeEval: number;
  verbalAssessment: string;
}

export interface GambitPosition {
  id?: number;
  fen: string;
  gambitName: string;
  moveNumber: number;
  mode: GambitMode;
  difficulty: 1 | 2 | 3 | 4 | 5;
  pgn: string;
  tags: string[];
  dueAt?: Date;
  attempts?: Attempt[];
}

export interface Attempt {
  movePlayed: string;
  evalAfter: number;
  timeSpent: number;
  wasCorrect: boolean;
  hintUsed: boolean;
  timestamp: Date;
}

export const GAMBITS = [
  { id: "evans",    name: "Evans Gambit",            eco: "C51", moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4"] },
  { id: "kings",    name: "King's Gambit",            eco: "C30", moves: ["e4","e5","f4"] },
  { id: "budapest", name: "Budapest Gambit",          eco: "A52", moves: ["d4","Nf6","c4","e5"] },
  { id: "danish",   name: "Danish Gambit",            eco: "C21", moves: ["e4","e5","d4","exd4","c3"] },
  { id: "morra",    name: "Morra Gambit",             eco: "B21", moves: ["e4","c5","d4","cxd4","c3"] },
  { id: "marshall", name: "Marshall Attack",          eco: "C89", moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","O-O","c3","d5"] },
  { id: "bdg",      name: "Blackmar-Diemer Gambit",  eco: "D00", moves: ["d4","d5","e4","dxe4","Nc3"] },
  { id: "latvian",  name: "Latvian Gambit",           eco: "C40", moves: ["e4","e5","Nf3","f5"] },
] as const;
