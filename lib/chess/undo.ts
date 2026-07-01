import { Chess } from "chess.js";

export function buildUndoState(pgn: string, movesToKeep: number) {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  
  // Rebuild game with only the moves we want to keep
  const fresh = new Chess();
  const kept = history.slice(0, movesToKeep);
  kept.forEach(m => fresh.move(m.san));
  
  return {
    game: fresh,
    capturedByWhite: history
      .slice(0, movesToKeep)
      .filter(m => m.captured && m.color === "b")
      .map(m => m.captured!),
    capturedByBlack: history
      .slice(0, movesToKeep)
      .filter(m => m.captured && m.color === "w")
      .map(m => m.captured!),
  };
}
