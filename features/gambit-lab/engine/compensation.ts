import { Chess } from "chess.js";

export interface CompensationProfile {
  material: number;
  initiative: number;
  kingSafety: number;
  activity: number;
  structure: number;
  compositeEval: number;
  verbalAssessment: string;
}

// Material values in centipawns
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

export function computeCompensation(fen: string, stockfishEval: number): CompensationProfile {
  const chess = new Chess(fen);
  const board = chess.board();

  // 1. Material count
  let whiteMat = 0, blackMat = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] ?? 0;
      if (sq.color === "w") whiteMat += val;
      else blackMat += val;
    }
  }
  const material = (whiteMat - blackMat) / 100; // in pawns

  // 2. Initiative — use Stockfish eval as proxy, compare to material
  // If eval > material, attacker has initiative
  const evalInPawns = stockfishEval / 100;
  const initiative = Math.max(-1, Math.min(1, (evalInPawns - material) * 0.5));

  // 3. King Safety — count pawn shield for each king
  const kingSafety = computeKingSafety(chess);

  // 4. Piece Activity — count legal moves as proxy for mobility
  const activity = computeActivity(chess);

  // 5. Pawn Structure — count doubled/isolated pawns
  const structure = computeStructure(chess);

  // Composite weighted formula from spec
  const compositeEval =
    0.40 * material +
    0.20 * initiative * 3.0 +
    0.20 * kingSafety * 3.0 +
    0.15 * activity * 3.0 +
    0.05 * structure * 3.0;

  return {
    material,
    initiative,
    kingSafety,
    activity,
    structure,
    compositeEval,
    verbalAssessment: generateVerbal(material, compositeEval, initiative),
  };
}

function computeKingSafety(chess: Chess): number {
  // Simplified: count pawns in front of each king
  const board = chess.board();
  let wKingCol = -1, bKingCol = -1, wKingRow = -1, bKingRow = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq?.type === "k") {
        if (sq.color === "w") { wKingRow = r; wKingCol = c; }
        else { bKingRow = r; bKingCol = c; }
      }
    }
  }
  let wShield = 0, bShield = 0;
  for (let dc = -1; dc <= 1; dc++) {
    const wc = wKingCol + dc, bc = bKingCol + dc;
    if (wc >= 0 && wc < 8 && wKingRow > 0) {
      const sq = board[wKingRow - 1][wc];
      if (sq?.type === "p" && sq.color === "w") wShield++;
    }
    if (bc >= 0 && bc < 8 && bKingRow < 7) {
      const sq = board[bKingRow + 1][bc];
      if (sq?.type === "p" && sq.color === "b") bShield++;
    }
  }
  return Math.max(-1, Math.min(1, (wShield - bShield) / 3));
}

function computeActivity(chess: Chess): number {
  const turn = chess.turn();
  const myMoves = chess.moves().length;
  // Switch turn to count opponent moves
  // Use a simple proxy: legal moves normalized
  return Math.max(-1, Math.min(1, (myMoves - 20) / 20));
}

function computeStructure(chess: Chess): number {
  const board = chess.board();
  const wFiles: number[] = Array(8).fill(0);
  const bFiles: number[] = Array(8).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (sq?.type === "p") {
        if (sq.color === "w") wFiles[c]++;
        else bFiles[c]++;
      }
    }
  }
  const wDoubled = wFiles.filter(f => f > 1).length;
  const bDoubled = bFiles.filter(f => f > 1).length;
  return Math.max(-1, Math.min(1, (bDoubled - wDoubled) / 3));
}

function generateVerbal(material: number, composite: number, initiative: number): string {
  if (material < -2.0 && composite < -0.5) return "Insufficient compensation — material deficit too large";
  if (material < -1.0 && composite > -0.3) return "Good compensation for the material sacrifice";
  if (Math.abs(composite) < 0.3) return "Roughly equal — practical chances for both sides";
  if (composite > 0.8) return "Significant advantage";
  if (composite > 0.3 && initiative > 0.5) return "Slight edge — practical chances favor the attacker";
  if (composite > 0.3) return "Slight advantage";
  if (composite < -0.3 && initiative < -0.5) return "Opponent has the initiative — consolidate carefully";
  if (composite < -0.3) return "Slight disadvantage — find a plan to equalize";
  return "Complex position — evaluate each dimension carefully";
}
