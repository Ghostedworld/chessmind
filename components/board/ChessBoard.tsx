"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import dynamic from "next/dynamic";
import { useGameStore } from "@/lib/store/gameStore";
import { getBookMove, shouldFollowBook } from "@/lib/chess/deviationEngine";
import { detectOpening } from "@/lib/openings/detect";

const DeviationPanel = dynamic(() => import("./DeviationPanel"), { ssr: false });

interface ChessBoardProps {
  onMoveMade?: (move: string, fen: string, pgn: string) => void;
  onGameOver?: (result: string, pgn?: string) => void;
  engineElo?: number;
  playerColor?: "white" | "black";
  showMoveHistory?: boolean;
  boardTheme?: { dark: string; light: string };
  deviationProbability?: number;
  activeTreeId?: number | null;
}

const PIECE_SYMBOLS: Record<string, string> = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
};
const PIECE_VALUES: Record<string, number> = { p:1, n:3, b:3, r:5, q:9, k:0 };

function getMaterialAdvantage(captured: string[], opponentCaptured: string[]) {
  const mine = captured.reduce((s,p) => s + (PIECE_VALUES[p.toLowerCase()] ?? 0), 0);
  const theirs = opponentCaptured.reduce((s,p) => s + (PIECE_VALUES[p.toLowerCase()] ?? 0), 0);
  return mine - theirs;
}

function CapturedPieces({ pieces, opponentPieces, label }: {
  pieces: string[]; opponentPieces: string[]; label: string;
}) {
  const counts: Record<string,number> = {};
  pieces.forEach(p => { counts[p] = (counts[p]||0)+1; });
  const advantage = getMaterialAdvantage(pieces, opponentPieces);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, height:22 }}>
      <span style={{ fontSize:10, color:"var(--text-3)", width:80, flexShrink:0 }}>{label}</span>
      <div style={{ display:"flex", flexWrap:"wrap" }}>
        {Object.entries(counts).map(([piece,count]) =>
          Array(count).fill(0).map((_,i) => (
            <span key={`${piece}-${i}`} style={{ fontSize:12, lineHeight:1 }}>{PIECE_SYMBOLS[piece]??""}</span>
          ))
        )}
      </div>
      {advantage > 0 && (
        <span style={{ fontSize:11, color:"var(--accent)", fontWeight:700, marginLeft:2 }}>+{advantage}</span>
      )}
    </div>
  );
}

function PromotionPicker({ color, onSelect }: { color:"w"|"b"; onSelect:(p:string)=>void }) {
  const pieces = color==="w" ? ["Q","R","B","N"] : ["q","r","b","n"];
  const symbols: Record<string,string> = { Q:"♕",R:"♖",B:"♗",N:"♘",q:"♛",r:"♜",b:"♝",n:"♞" };
  return (
    <div style={{
      position:"absolute", top:"50%", left:"50%",
      transform:"translate(-50%,-50%)", zIndex:100,
      background:"rgba(8,12,20,0.97)", border:"1px solid var(--glass-border)",
      borderRadius:14, padding:20, backdropFilter:"blur(20px)",
      boxShadow:"0 0 40px rgba(0,0,0,0.8)",
      display:"flex", flexDirection:"column", alignItems:"center", gap:14,
    }}>
      <div style={{ fontSize:13, color:"var(--text-2)", fontWeight:600 }}>Promote to</div>
      <div style={{ display:"flex", gap:10 }}>
        {pieces.map(p => (
          <button key={p} onClick={() => onSelect(p.toLowerCase())}
            style={{
              width:52, height:52, borderRadius:10,
              background:"var(--glass)", border:"1px solid var(--glass-border)",
              cursor:"pointer", fontSize:28, display:"flex",
              alignItems:"center", justifyContent:"center", transition:"all 0.15s",
            }}>
            {symbols[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChessBoardComponent({
  onMoveMade, onGameOver,
  engineElo = 1200,
  playerColor = "white",
  showMoveHistory = true,
  boardTheme = { dark:"#1e3a5f", light:"#4a7eb5" },
  deviationProbability: deviationProbabilityProp = 100,
  activeTreeId,
}: ChessBoardProps) {

  // Zustand store
  const {
    pgn, fen, isThinking, engineReady, gameStatus,
    moveHistory, redoStack, lastMove,
    capturedByWhite, capturedByBlack,
    selectedSquare, possibleMoves,
    resigned, showDeviation,
    setIsThinking, setEngineReady, setGameStatus,
    setMoveHistory, setRedoStack, setLastMove,
    setCapturedByWhite, setCapturedByBlack,
    setSelectedSquare, setPossibleMoves,
    setResigned, setShowDeviation,
    resetGame, applyMove, undoLastTwoMoves, redoLastMove,
    setPgn, setFen,
    deviationProbability,
  } = useGameStore();

  const [size, setSize] = useState(400);
  const [currentOpening, setCurrentOpening] = useState<string>("");
  const [lastMoveWasBook, setLastMoveWasBook] = useState<boolean | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{from:string;to:string;color:"w"|"b"}|null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker|null>(null);
  const pgnRef = useRef(pgn);
  const engineEloRef = useRef(engineElo);
  const moveListRef = useRef<HTMLDivElement>(null);

  pgnRef.current = pgn;
  engineEloRef.current = engineElo;

  // Sync props to store
  useEffect(() => { useGameStore.getState().setDeviationProbability(deviationProbabilityProp); }, [deviationProbabilityProp]);

  // Responsive size
  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      const chrome = 22+22+24+48;
      const boardH = height - chrome;
      const boardW = showMoveHistory ? width - 216 : width - 24;
      setSize(Math.max(Math.min(boardH, boardW), 240));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [showMoveHistory]);

  // Auto-scroll move list
  useEffect(() => {
    if (moveListRef.current)
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
  }, [moveHistory]);

  // Init Stockfish
  useEffect(() => {
    const w = new Worker("/stockfish.js");
    workerRef.current = w;

    w.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === "string" ? e.data : "";
      if (line === "readyok") { setEngineReady(true); return; }
      if (!line.startsWith("bestmove")) return;

      const bestMove = line.split(" ")[1];
      if (!bestMove || bestMove === "(none)") { setIsThinking(false); return; }

      const gameCopy = new Chess();
      try { gameCopy.loadPgn(pgnRef.current); } catch { setIsThinking(false); return; }

      try {
        const move = gameCopy.move({
          from: bestMove.slice(0,2), to: bestMove.slice(2,4),
          promotion: bestMove[4] || "q",
        });
        if (move) {
          if (move.captured) setCapturedByWhite(prev => [...prev, move.captured!]);
          setPgn(gameCopy.pgn());
          setFen(gameCopy.fen());
          setLastMove({ from:move.from, to:move.to });
          setMoveHistory(prev => [...prev, move.san]);
          setRedoStack([]);
          // Engine played off-book (Stockfish response = not book)
          setLastMoveWasBook(false);
          const status = getStatus(gameCopy);
          setGameStatus(status);
          onMoveMade?.(move.san, gameCopy.fen(), gameCopy.pgn());
          if (gameCopy.isGameOver()) onGameOver?.(status, gameCopy.pgn());
          fetchOpening(gameCopy.fen());
        }
      } catch { /**/ }
      setIsThinking(false);
    };

    w.postMessage("uci");
    w.postMessage("isready");
    return () => w.terminate();
  }, []);

  // Engine goes first if player is black
  useEffect(() => {
    if (playerColor === "black" && engineReady && moveHistory.length === 0) {
      setTimeout(() => triggerEngine(new Chess().fen()), 500);
    }
  }, [playerColor, engineReady]);

  // Reset when playerColor changes
  useEffect(() => {
    workerRef.current?.postMessage("stop");
    resetGame();
    if (playerColor === "black" && engineReady) {
      setTimeout(() => triggerEngine(new Chess().fen()), 600);
    }
  }, [playerColor]);

  const getStatus = (g: Chess) => {
    if (g.isCheckmate()) return g.turn()==="w" ? "Black wins ✓" : "White wins ✓";
    if (g.isStalemate()) return "Stalemate";
    if (g.isDraw()) return "Draw";
    if (g.isCheck()) return "Check!";
    return "";
  };

  const deviationProbabilityRef = useRef(deviationProbability);
  deviationProbabilityRef.current = deviationProbability;

  const triggerEngine = useCallback(async (fenStr: string) => {
    const w = workerRef.current;
    if (!w) return;
    setIsThinking(true);

    // Check if we should follow the book
    console.log("Deviation probability:", deviationProbabilityRef.current);
    const followBook = await shouldFollowBook(deviationProbabilityRef.current);
    console.log("Follow book?", followBook);
    if (followBook) {
      const opponentColor = playerColor === "white" ? "black" : "white";
      const bookMove = await getBookMove(fenStr, opponentColor, activeTreeId ?? undefined, playerColor);
      if (bookMove) {
        // Play book move directly
        const gameCopy = new Chess();
        try { gameCopy.loadPgn(pgnRef.current); } catch { /**/ }
        try {
          const move = gameCopy.move(bookMove);
          if (move) {
            if (move.captured) setCapturedByWhite(prev => [...prev, move.captured!]);
            setPgn(gameCopy.pgn());
            setFen(gameCopy.fen());
            setLastMove({ from: move.from, to: move.to });
            setMoveHistory(prev => [...prev, move.san]);
            setRedoStack([]);
            setLastMoveWasBook(true);
            const status = getStatus(gameCopy);
            setGameStatus(status);
            onMoveMade?.(move.san, gameCopy.fen(), gameCopy.pgn());
            if (gameCopy.isGameOver()) onGameOver?.(status, gameCopy.pgn());
            setIsThinking(false);
            // Detect opening
            fetchOpening(gameCopy.fen());
            return;
          }
        } catch { /**/ }
      }
    }

    setLastMoveWasBook(false);
    // Fall through to Stockfish
    w.postMessage(`position fen ${fenStr}`);
    w.postMessage("setoption name UCI_LimitStrength value true");
    w.postMessage(`setoption name UCI_Elo value ${engineEloRef.current}`);
    w.postMessage("go movetime 800");
  }, [playerColor]);

  function fetchOpening(fenStr: string) {
    try {
      const g = new Chess();
      try { g.loadPgn(pgnRef.current); } catch { return; }
      const history = g.history();
      const name = detectOpening(history);
      if (name) setCurrentOpening(name);
    } catch { /**/ }
  }

  function applyPlayerMove(from: string, to: string, promotion?: string): boolean {
    const current = new Chess();
    try { current.loadPgn(pgnRef.current); } catch { return false; }

    const isMyTurn =
      (playerColor==="white" && current.turn()==="w") ||
      (playerColor==="black" && current.turn()==="b");
    if (!isMyTurn || isThinking || current.isGameOver() || resigned) return false;

    const piece = current.get(from as any);
    const isPromotion =
      piece?.type==="p" &&
      ((piece.color==="w" && to[1]==="8") || (piece.color==="b" && to[1]==="1"));

    if (isPromotion && !promotion) {
      setPendingPromotion({ from, to, color: piece.color });
      setSelectedSquare(null);
      setPossibleMoves([]);
      return true;
    }

    const gameCopy = new Chess();
    try { gameCopy.loadPgn(pgnRef.current); } catch { return false; }

    try {
      const move = gameCopy.move({ from, to, promotion: promotion||"q" });
      if (!move) return false;

      if (move.captured) setCapturedByBlack(prev => [...prev, move.captured!]);
      setPgn(gameCopy.pgn());
      setFen(gameCopy.fen());
      setLastMove({ from:move.from, to:move.to });
      setMoveHistory(prev => [...prev, move.san]);
      setRedoStack([]);
      setSelectedSquare(null);
      setPossibleMoves([]);

      const status = getStatus(gameCopy);
      setGameStatus(status);
      onMoveMade?.(move.san, gameCopy.fen(), gameCopy.pgn());

      if (gameCopy.isGameOver()) {
        onGameOver?.(status, gameCopy.pgn());
        return true;
      }

      setTimeout(() => triggerEngine(gameCopy.fen()), 300);
      fetchOpening(gameCopy.fen());
      return true;
    } catch { return false; }
  }

  function onSquareClick({ square }: { square:string; piece?:unknown }) {
    const current = new Chess();
    try { current.loadPgn(pgnRef.current); } catch { return; }

    const isMyTurn =
      (playerColor==="white" && current.turn()==="w") ||
      (playerColor==="black" && current.turn()==="b");

    if (selectedSquare && selectedSquare !== square) {
      const moved = applyPlayerMove(selectedSquare, square);
      if (!moved) {
        if (!isMyTurn || isThinking) { setSelectedSquare(null); setPossibleMoves([]); return; }
        const moves = current.moves({ square:square as any, verbose:true });
        if ((moves as any[]).length > 0) {
          setSelectedSquare(square);
          setPossibleMoves((moves as any[]).map((m:any) => m.to));
        } else { setSelectedSquare(null); setPossibleMoves([]); }
      }
      return;
    }

    if (!isMyTurn || isThinking) { setSelectedSquare(null); setPossibleMoves([]); return; }
    const moves = current.moves({ square:square as any, verbose:true });
    if ((moves as any[]).length > 0) {
      setSelectedSquare(square);
      setPossibleMoves((moves as any[]).map((m:any) => m.to));
    } else { setSelectedSquare(null); setPossibleMoves([]); }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece:unknown; sourceSquare:string; targetSquare:string }) {
    const current = new Chess();
    try { current.loadPgn(pgnRef.current); } catch { return false; }
    const isMyTurn =
      (playerColor==="white" && current.turn()==="w") ||
      (playerColor==="black" && current.turn()==="b");
    if (!isMyTurn || isThinking || resigned) return false;
    try {
      const test = new Chess(current.fen());
      const move = test.move({ from:sourceSquare, to:targetSquare, promotion:"q" });
      if (!move) return false;
      const status = getStatus(test);
      const isCorrect = applyPlayerMove(sourceSquare, targetSquare);
      return isCorrect;
    } catch { return false; }
  }

  function handleReset() {
    workerRef.current?.postMessage("stop");
    resetGame();
    if (playerColor==="black") setTimeout(() => triggerEngine(new Chess().fen()), 600);
  }

  function handleUndo() {
    workerRef.current?.postMessage("stop");
    undoLastTwoMoves();
  }

  function resign() {
    setResigned(true);
    const result = playerColor==="white" ? "Black wins (resigned)" : "White wins (resigned)";
    setGameStatus(result);
    onGameOver?.(result, pgn);
  }

  function offerDraw() {
    setGameStatus("Draw (agreed)");
    onGameOver?.("Draw", pgn);
  }

  const isGameOver = (() => {
    const g = new Chess();
    try { g.loadPgn(pgn); } catch { return false; }
    return g.isGameOver() || resigned || gameStatus.includes("Draw");
  })();

  // Square styles
  const squareStyles: Record<string,React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor:"rgba(59,158,255,0.2)" };
    squareStyles[lastMove.to] = { backgroundColor:"rgba(59,158,255,0.35)" };
  }
  if (selectedSquare) squareStyles[selectedSquare] = { backgroundColor:"rgba(59,158,255,0.5)" };
  possibleMoves.forEach(sq => {
    const g = new Chess();
    try { g.loadPgn(pgn); } catch { /**/ }
    const hasEnemy = g.get(sq as any);
    squareStyles[sq] = hasEnemy
      ? { boxShadow:"inset 0 0 0 3px rgba(59,158,255,0.7)", borderRadius:"4px" }
      : { background:"radial-gradient(circle, rgba(59,158,255,0.65) 28%, transparent 30%)" };
  });

  const engineLabel = playerColor==="white" ? "Black (Engine)" : "White (Engine)";
  const playerLabel = playerColor==="white" ? "White (You)" : "Black (You)";

  const movePairs: [string,string?][] = [];
  for (let i=0; i<moveHistory.length; i+=2)
    movePairs.push([moveHistory[i], moveHistory[i+1]]);

  return (
    <>
    <div ref={wrapperRef} style={{
      width:"100%", height:"100%",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:12, gap:12,
    }}>
      {/* Board column */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4, flexShrink:0 }}>
        <CapturedPieces
          pieces={playerColor==="white" ? capturedByWhite : capturedByBlack}
          opponentPieces={playerColor==="white" ? capturedByBlack : capturedByWhite}
          label={engineLabel}
        />

        <div style={{ position:"relative" }}>
          <div className="glass" style={{
            borderRadius:14, overflow:"hidden", padding:6,
            boxShadow:"0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
          }}>
            <Chessboard
              options={{
                position: fen,
                boardOrientation: playerColor,
                boardStyle: { borderRadius:8, width:size, height:size },
                darkSquareStyle: { backgroundColor:boardTheme.dark },
                lightSquareStyle: { backgroundColor:boardTheme.light },
                squareStyles,
                onPieceDrop: onDrop,
                onSquareClick,
                allowDragging: !isGameOver && !isThinking,
                animationDurationInMs: 180,
              }}
            />
          </div>
          {pendingPromotion && (
            <PromotionPicker
              color={pendingPromotion.color}
              onSelect={p => {
                applyPlayerMove(pendingPromotion.from, pendingPromotion.to, p);
                setPendingPromotion(null);
              }}
            />
          )}
        </div>

        <CapturedPieces
          pieces={playerColor==="white" ? capturedByBlack : capturedByWhite}
          opponentPieces={playerColor==="white" ? capturedByWhite : capturedByBlack}
          label={playerLabel}
        />
      </div>

      {/* Right panel */}
      {showMoveHistory && (
        <div style={{ width:200, height:size+12, display:"flex", flexDirection:"column", flexShrink:0, gap:8 }}>
          {/* Status */}
          <div className="glass" style={{ borderRadius:10, padding:"8px 12px", display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{
                width:6, height:6, borderRadius:"50%", flexShrink:0,
                background: isGameOver ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)",
                boxShadow: `0 0 6px ${isGameOver ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)"}`,
              }} />
              <span style={{ fontSize:12, color:"var(--text-2)", lineHeight:1.3, flex:1 }}>
                {gameStatus || (isThinking ? `Thinking... (${engineElo})` : "Your turn")}
                {!engineReady && " · Loading..."}
              </span>
              {lastMoveWasBook !== null && (
                <span style={{
                  fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:10, flexShrink:0,
                  background: lastMoveWasBook ? "rgba(52,211,153,0.15)" : "rgba(251,191,36,0.15)",
                  color: lastMoveWasBook ? "var(--success)" : "var(--warning)",
                  border: `1px solid ${lastMoveWasBook ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}`,
                }}>
                  {lastMoveWasBook ? "📖 Book" : "⚡ Engine"}
                </span>
              )}
            </div>
            {currentOpening && (
              <div style={{ fontSize:11, color:"var(--accent)", fontWeight:500, paddingLeft:14 }}>
                {currentOpening}
              </div>
            )}
          </div>

          {/* Move list */}
          <div className="glass" style={{ flex:1, borderRadius:10, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid var(--glass-border)", fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1 }}>
              MOVES
            </div>
            <div ref={moveListRef} style={{ flex:1, overflowY:"auto", padding:"4px 0" }}>
              {movePairs.length===0 && (
                <div style={{ padding:"10px 12px", fontSize:12, color:"var(--text-3)" }}>No moves yet</div>
              )}
              {movePairs.map(([white,black],i) => (
                <div key={i} style={{
                  display:"grid", gridTemplateColumns:"24px 1fr 1fr",
                  padding:"3px 8px",
                  background: i%2===0 ? "transparent" : "rgba(255,255,255,0.02)",
                }}>
                  <span style={{ fontSize:11, color:"var(--text-3)", fontFamily:"DM Mono, monospace" }}>{i+1}.</span>
                  <span style={{
                    fontSize:12, fontFamily:"DM Mono, monospace", color:"var(--text)", padding:"2px 3px", borderRadius:3,
                    background: i===movePairs.length-1 && moveHistory.length%2===1 ? "var(--accent-dim)" : "transparent",
                  }}>{white}</span>
                  <span style={{
                    fontSize:12, fontFamily:"DM Mono, monospace", color:"var(--text-2)", padding:"2px 3px", borderRadius:3,
                    background: i===movePairs.length-1 && black && moveHistory.length%2===0 ? "var(--accent-dim)" : "transparent",
                  }}>{black??""}</span>
                </div>
              ))}
            </div>
            {gameStatus && (
              <div style={{ padding:"8px 12px", borderTop:"1px solid var(--glass-border)", fontSize:12, fontWeight:600, color:"var(--accent)", textAlign:"center" }}>
                {gameStatus}
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            <button className="btn-glass" onClick={handleReset} style={{ fontSize:11, padding:"7px 0", gridColumn:"1 / -1" }}>
              New Game
            </button>
            <button className="btn-glass" onClick={handleUndo} disabled={moveHistory.length<2}
              style={{ fontSize:11, padding:"7px 0", opacity:moveHistory.length<2?0.4:1 }}>
              ↩ Undo
            </button>
            <button className="btn-glass" onClick={redoLastMove} disabled={redoStack.length===0}
              style={{ fontSize:11, padding:"7px 0", opacity:redoStack.length===0?0.4:1 }}>
              Redo ↪
            </button>
            {!isGameOver && (
              <>
                <button className="btn-glass" onClick={offerDraw} style={{ fontSize:11, padding:"7px 0", color:"var(--warning)" }}>½ Draw</button>
                <button className="btn-glass" onClick={resign} style={{ fontSize:11, padding:"7px 0", color:"var(--danger)" }}>⚑ Resign</button>
              </>
            )}
            {moveHistory.length>0 && (
              <button className="btn-glass" onClick={() => setShowDeviation(true)}
                style={{ fontSize:11, padding:"7px 0", gridColumn:"1 / -1", color:"var(--accent)" }}>
                🔍 Analyse vs Repertoire
              </button>
            )}
          </div>
        </div>
      )}
    </div>

    {showDeviation && (
      <DeviationPanel
        pgn={pgn}
        playerColor={playerColor}
        onClose={() => setShowDeviation(false)}
      />
    )}
    </>
  );
}


