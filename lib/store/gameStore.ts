import { create } from "zustand";
import { Chess } from "chess.js";

interface GameState {
  // Game state
  pgn: string;
  fen: string;
  isThinking: boolean;
  engineReady: boolean;
  gameStatus: string;
  moveHistory: string[];
  redoStack: string[];
  lastMove: { from: string; to: string } | null;
  capturedByWhite: string[];
  capturedByBlack: string[];
  selectedSquare: string | null;
  possibleMoves: string[];
  resigned: boolean;
  showDeviation: boolean;

  // Settings (passed as props but mirrored for engine access)
  engineElo: number;
  playerColor: "white" | "black";
  deviationProbability: number; // 0 = always follow book, 100 = always engine
  activeTreeId: number | null; // which repertoire tree to use for book moves

  // Actions
  setFen: (fen: string) => void;
  setPgn: (pgn: string) => void;
  setIsThinking: (v: boolean) => void;
  setEngineReady: (v: boolean) => void;
  setGameStatus: (v: string) => void;
  setMoveHistory: (v: string[] | ((prev: string[]) => string[])) => void;
  setRedoStack: (v: string[] | ((prev: string[]) => string[])) => void;
  setLastMove: (v: { from: string; to: string } | null) => void;
  setCapturedByWhite: (v: string[] | ((prev: string[]) => string[])) => void;
  setCapturedByBlack: (v: string[] | ((prev: string[]) => string[])) => void;
  setSelectedSquare: (v: string | null) => void;
  setPossibleMoves: (v: string[]) => void;
  setResigned: (v: boolean) => void;
  setShowDeviation: (v: boolean) => void;
  setEngineElo: (v: number) => void;
  setPlayerColor: (v: "white" | "black") => void;
  setDeviationProbability: (v: number) => void;
  setActiveTreeId: (v: number | null) => void;

  // Complex actions
  resetGame: () => void;
  applyMove: (san: string, from: string, to: string, captured?: string) => void;
  undoLastTwoMoves: () => void;
  redoLastMove: () => void;
}

const INITIAL_FEN = new Chess().fen();

export const useGameStore = create<GameState>((set, get) => ({
  pgn: "",
  fen: INITIAL_FEN,
  isThinking: false,
  engineReady: false,
  gameStatus: "",
  moveHistory: [],
  redoStack: [],
  lastMove: null,
  capturedByWhite: [],
  capturedByBlack: [],
  selectedSquare: null,
  possibleMoves: [],
  resigned: false,
  showDeviation: false,
  engineElo: 1200,
  playerColor: "white",
  deviationProbability: 100,
  activeTreeId: null,

  setFen: (fen) => set({ fen }),
  setPgn: (pgn) => set({ pgn }),
  setIsThinking: (isThinking) => set({ isThinking }),
  setEngineReady: (engineReady) => set({ engineReady }),
  setGameStatus: (gameStatus) => set({ gameStatus }),
  setMoveHistory: (v) => set(s => ({
    moveHistory: typeof v === "function" ? v(s.moveHistory) : v
  })),
  setRedoStack: (v) => set(s => ({
    redoStack: typeof v === "function" ? v(s.redoStack) : v
  })),
  setLastMove: (lastMove) => set({ lastMove }),
  setCapturedByWhite: (v) => set(s => ({
    capturedByWhite: typeof v === "function" ? v(s.capturedByWhite) : v
  })),
  setCapturedByBlack: (v) => set(s => ({
    capturedByBlack: typeof v === "function" ? v(s.capturedByBlack) : v
  })),
  setSelectedSquare: (selectedSquare) => set({ selectedSquare }),
  setPossibleMoves: (possibleMoves) => set({ possibleMoves }),
  setResigned: (resigned) => set({ resigned }),
  setShowDeviation: (showDeviation) => set({ showDeviation }),
  setEngineElo: (engineElo) => set({ engineElo }),
  setPlayerColor: (playerColor) => set({ playerColor }),
  setDeviationProbability: (deviationProbability) => set({ deviationProbability }),
  setActiveTreeId: (activeTreeId) => set({ activeTreeId }),

  resetGame: () => {
    const g = new Chess();
    set({
      pgn: "",
      fen: g.fen(),
      gameStatus: "",
      moveHistory: [],
      redoStack: [],
      lastMove: null,
      capturedByWhite: [],
      capturedByBlack: [],
      selectedSquare: null,
      possibleMoves: [],
      resigned: false,
      isThinking: false,
    });
  },

  applyMove: (san, from, to, captured) => {
    const state = get();
    const g = new Chess();
    try { g.loadPgn(state.pgn); } catch { /**/ }
    try { g.move(san); } catch { return; }

    set({
      pgn: g.pgn(),
      fen: g.fen(),
      lastMove: { from, to },
      moveHistory: [...state.moveHistory, san],
      redoStack: [],
      selectedSquare: null,
      possibleMoves: [],
      ...(captured ? {
        capturedByBlack: [...state.capturedByBlack, captured]
      } : {}),
    });
  },

  undoLastTwoMoves: () => {
    const state = get();
    const g = new Chess();
    try { g.loadPgn(state.pgn); } catch { return; }
    const history = g.history({ verbose: true }) as any[];
    if (history.length < 2) return;

    const movesToKeep = history.length - 2;
    const rebuilt = new Chess();
    history.slice(0, movesToKeep).forEach((m: any) => rebuilt.move(m.san));

    const byWhite = history.slice(0, movesToKeep)
      .filter((m: any) => m.captured && m.color === "b").map((m: any) => m.captured);
    const byBlack = history.slice(0, movesToKeep)
      .filter((m: any) => m.captured && m.color === "w").map((m: any) => m.captured);

    set({
      pgn: rebuilt.pgn(),
      fen: rebuilt.fen(),
      moveHistory: history.slice(0, movesToKeep).map((m: any) => m.san),
      redoStack: [...state.redoStack, state.pgn],
      capturedByWhite: byWhite,
      capturedByBlack: byBlack,
      gameStatus: "",
      lastMove: movesToKeep > 0
        ? { from: history[movesToKeep - 1].from, to: history[movesToKeep - 1].to }
        : null,
      selectedSquare: null,
      possibleMoves: [],
      isThinking: false,
    });
  },

  redoLastMove: () => {
    const state = get();
    if (state.redoStack.length === 0) return;
    const pgn = state.redoStack[state.redoStack.length - 1];
    const rebuilt = new Chess();
    try { rebuilt.loadPgn(pgn); } catch { return; }
    const history = rebuilt.history({ verbose: true }) as any[];
    const byWhite = history.filter((m: any) => m.captured && m.color === "b").map((m: any) => m.captured);
    const byBlack = history.filter((m: any) => m.captured && m.color === "w").map((m: any) => m.captured);

    set({
      pgn,
      fen: rebuilt.fen(),
      moveHistory: history.map((m: any) => m.san),
      redoStack: state.redoStack.slice(0, -1),
      capturedByWhite: byWhite,
      capturedByBlack: byBlack,
      gameStatus: "",
      lastMove: history.length > 0
        ? { from: history[history.length - 1].from, to: history[history.length - 1].to }
        : null,
    });
  },
}));
