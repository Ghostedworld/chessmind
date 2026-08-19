"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { db } from "@/lib/db";
import { IconTarget, IconCheck, IconX, IconArrowRight, IconBulb, IconFlame } from "@tabler/icons-react";
import { getStockfishPool } from "@/lib/engine/workerPool";

interface Puzzle {
  id: number;
  fen: string;
  playerColor: "white" | "black";
  bestMove: string;
  theme: string;
  moveNumber: number;
  attempts: number;
  solved: boolean;
  dueAt: Date;
}

type PuzzleStatus = "thinking" | "correct" | "wrong" | "hint" | "revealed";

// FSRS-lite: schedule next review
function scheduleNext(puzzle: Puzzle, correct: boolean, hintUsed: boolean): Date {
  const now = new Date();
  const days = correct
    ? hintUsed ? 1 : Math.min(puzzle.attempts + 1, 7) * 2
    : 0.25; // 6 hours if wrong
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

// Rule-based explanation engine — no API needed
function explainMove(fen: string, moveSan: string, pv: string[]): string {
  if (!moveSan || moveSan === "undefined") return "This position had a better capture available — look for hanging pieces.";
  const chess = new Chess(fen);
  const verbose = chess.moves({ verbose: true }) as any[];
  const move = verbose.find((m: any) => m.san === moveSan);
  if (!move) return moveSan + " is the best move — it wins material or improves the position significantly.";
  // Fork detection — after the move, does one piece attack 2+ valuable pieces?
  const after = new Chess(fen);
  try {
    after.move(moveSan);
    const afterMoves = after.moves({ verbose: true }) as any[];
    const captures = afterMoves.filter((m: any) => m.flags.includes("c") && ["q","r","n","b"].includes(m.captured));
    if (captures.length >= 2) return `${moveSan} forks — it attacks ${captures.length} pieces at once. Your opponent can only save one.`;
  } catch { /**/ }

  // Capture with gain
  if (move.captured) {
    const vals: Record<string, number> = { p:1, n:3, b:3, r:5, q:9 };
    const pieceNames: Record<string, string> = { p:"pawn", n:"knight", b:"bishop", r:"rook", q:"queen", k:"king" };
    const gain = (vals[move.captured] || 0) - (vals[move.piece] || 0);
    if (gain > 0) return `${moveSan} wins material — you capture the ${pieceNames[move.captured]} and your ${pieceNames[move.piece]} is safe.`;
    return `${moveSan} captures the ${pieceNames[move.captured]}.`;
  }

  // Check
  if (moveSan.includes("+")) return `${moveSan} gives check, forcing the king to move and gaining tempo.`;

  // Checkmate
  if (moveSan.includes("#")) return `${moveSan} is checkmate! The king has no escape.`;

  // Back rank hint
  if (move.to[1] === "8" || move.to[1] === "1") return `${moveSan} exploits the back rank — the king is trapped by its own pawns.`;

  // Promotion
  if (moveSan.includes("=")) return `${moveSan} promotes the pawn to a queen — an overwhelming material gain.`;

  return `${moveSan} is the best move — it improves your position while limiting your opponent's options.`;
}

interface Props {
  boardTheme?: { dark: string; light: string };
  onSessionEnd?: (correct: number, total: number) => void;
}

export default function PuzzleBoard({ boardTheme = { dark:"#1e3a5f", light:"#4a7eb5" }, onSessionEnd }: Props) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("");
  const [status, setStatus] = useState<PuzzleStatus>("thinking");
  const [explanation, setExplanation] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{from:string;to:string}|null>(null);
  const [size, setSize] = useState(320);
  const [sessionCorrect, setSessionCorrect] = useState(() => {
    try { return parseInt(localStorage.getItem("tactics_correct") || "0"); } catch { return 0; }
  });
  const [sessionTotal, setSessionTotal] = useState(() => {
    try { return parseInt(localStorage.getItem("tactics_total") || "0"); } catch { return 0; }
  });
  const [streak, setStreak] = useState(() => {
    try { return parseInt(localStorage.getItem("tactics_streak") || "0"); } catch { return 0; }
  });
  const [loading, setLoading] = useState(true);
  const [noPuzzles, setNoPuzzles] = useState(false);
  const [pv, setPv] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerIdRef = useRef<number | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { width, height } = wrapperRef.current.getBoundingClientRect();
      setSize(Math.max(Math.min(height - 120, width - 280), 200));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Init Stockfish for PV analysis
    const pool = getStockfishPool();
    if (!pool) return;
    const id = pool.acquire((line: string) => {
      if (line.startsWith("info") && line.includes("pv")) {
        const pvMatch = line.match(/ pv (.+)$/);
        if (pvMatch) setPv(pvMatch[1].split(" ").slice(0, 5));
      }
    });
    workerIdRef.current = id;
    return () => { pool.release(id); };
  }, []);

  useEffect(() => { loadNextPuzzle(); }, []);

  async function loadNextPuzzle() {
    setLoading(true);
    setStatus("thinking");
    setHintUsed(false);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMove(null);
    setExplanation("");
    setPv([]);

    try {
      const now = new Date();
      const due = await db.table("tacticsPuzzles")
        .filter((p: any) => !p.solved && new Date(p.dueAt) <= now)
        .limit(1)
        .toArray();

      if (due.length === 0) {
        // No due puzzles — get any unsolved
        const any = await db.table("tacticsPuzzles")
          .filter((p: any) => !p.solved)
          .limit(1)
          .toArray();

        if (any.length === 0) { setNoPuzzles(true); setLoading(false); return; }
        setPuzzleFromData(any[0]);
      } else {
        setPuzzleFromData(due[0]);
      }
    } catch { setNoPuzzles(true); }
    setLoading(false);
  }

  function setPuzzleFromData(data: any) {
    const p: Puzzle = { ...data, dueAt: new Date(data.dueAt) };
    setPuzzle(p);
    const g = new Chess(p.fen);
    setGame(g);
    setFen(p.fen);
    setNoPuzzles(false);

    // Get Stockfish PV for this position
    const pool = getStockfishPool();
    const wId = workerIdRef.current;
    if (pool && wId !== null) {
      pool.send(wId, `position fen ${p.fen}`);
      pool.send(wId, "go depth 14");
    }
  }

  function isPlayerTurn() {
    if (!puzzle) return false;
    const g = gameRef.current;
    return (puzzle.playerColor === "white" && g.turn() === "w") ||
           (puzzle.playerColor === "black" && g.turn() === "b");
  }

  async function handleMove(from: string, to: string): Promise<boolean> {
    if (!puzzle || !isPlayerTurn() || status === "correct" || status === "revealed") return false;

    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move({ from, to, promotion: "q" });
      if (!move) return false;

      setSelectedSquare(null);
      setPossibleMoves([]);
      setLastMove({ from: move.from, to: move.to });

      // Check if correct
      const isCorrect = move.san === puzzle.bestMove ||
        move.lan === puzzle.bestMove ||
        `${from}${to}` === puzzle.bestMove ||
        `${from}${to}q` === puzzle.bestMove;

      if (isCorrect) {
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setStatus("correct");
        setSessionCorrect(c => { const n = c+1; localStorage.setItem("tactics_correct", String(n)); return n; });
        setSessionTotal(t => { const n = t+1; localStorage.setItem("tactics_total", String(n)); return n; });
        setStreak(s => { const n = s+1; localStorage.setItem("tactics_streak", String(n)); return n; });
        const exp = explainMove(puzzle.fen, move.san, pv);
        setExplanation(exp);

        // Update DB
        await db.table("tacticsPuzzles").update(puzzle.id, {
          solved: true,
          attempts: puzzle.attempts + 1,
          dueAt: scheduleNext(puzzle, true, hintUsed),
        });
      } else {
        setStatus("wrong");
        setSessionTotal(t => { const n = t+1; localStorage.setItem("tactics_total", String(n)); return n; });
        setStreak(0); localStorage.setItem("tactics_streak", "0");
        setTimeout(() => {
          setGame(new Chess(puzzle.fen));
          setFen(puzzle.fen);
          setLastMove(null);
          setStatus("thinking");
        }, 1200);

        await db.table("tacticsPuzzles").update(puzzle.id, {
          attempts: puzzle.attempts + 1,
        });
      }
      return true;
    } catch { return false; }
  }

  function showHint() {
    if (!puzzle || !puzzle.bestMove) return;
    setHintUsed(true);
    setStatus("hint");
    // Find the from square by trying to parse the best move
    try {
      const g = new Chess(puzzle.fen);
      const verbose = g.moves({ verbose: true }) as any[];
      const best = verbose.find((m: any) => m.san === puzzle.bestMove);
      if (best) {
        setSelectedSquare(best.from);
        const fromMoves = g.moves({ square: best.from as any, verbose: true }) as any[];
        setPossibleMoves(fromMoves.map((m: any) => m.to));
      }
    } catch { /**/ }
    setTimeout(() => { setStatus("thinking"); }, 3000);
  }

  function revealAnswer() {
    if (!puzzle) return;
    setStatus("revealed");
    const exp = explainMove(puzzle.fen, puzzle.bestMove, pv);
    setExplanation(exp);
    // Show the best move on board
    try {
      const g = new Chess(puzzle.fen);
      const move = g.move(puzzle.bestMove);
      if (move) {
        setGame(g);
        setFen(g.fen());
        setLastMove({ from: move.from, to: move.to });
      }
    } catch { /**/ }
  }

  function onSquareClick({ square }: { square: string }) {
    if (!isPlayerTurn() || status === "correct" || status === "revealed") return;
    if (selectedSquare && selectedSquare !== square) {
      if (handleMove(selectedSquare, square)) return;
    }
    const g = gameRef.current;
    const moves = g.moves({ square: square as any, verbose: true }) as any[];
    if (moves.length > 0) {
      setSelectedSquare(square);
      setPossibleMoves(moves.map((m: any) => m.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string }) {
    return handleMove(sourceSquare, targetSquare);
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(56,139,253,0.2)" };
    squareStyles[lastMove.to]   = { backgroundColor: "rgba(56,139,253,0.35)" };
  }
  if (selectedSquare) squareStyles[selectedSquare] = { backgroundColor: "rgba(251,191,36,0.4)" };
  possibleMoves.forEach(sq => {
    squareStyles[sq] = { background: "radial-gradient(circle, rgba(56,139,253,0.65) 28%, transparent 30%)" };
  });

  if (loading) return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>
      Loading puzzle...
    </div>
  );

  if (noPuzzles) return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:12, color:"var(--text-3)" }}>
      <IconTarget size={40} opacity={0.3} />
      <div style={{ fontSize:14, fontWeight:600 }}>No puzzles yet</div>
      <div style={{ fontSize:12, textAlign:"center", maxWidth:280, lineHeight:1.6 }}>
        Run the blunder scanner above to generate puzzles from your real games.
      </div>
    </div>
  );

  return (
    <div ref={wrapperRef} style={{
      width:"100%", height:"100%", display:"flex",
      alignItems:"center", justifyContent:"center", gap:12, padding:12,
    }}>
      {/* Left info panel */}
      <div style={{ width:180, height:size+40, display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
        {/* Session stats */}
        <div className="glass" style={{ borderRadius:10, padding:"10px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--success)" }}>{sessionCorrect}</div>
              <div style={{ fontSize:9, color:"var(--text-3)" }}>CORRECT</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--text)" }}>{sessionTotal}</div>
              <div style={{ fontSize:9, color:"var(--text-3)" }}>TOTAL</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--warning)", display:"flex", alignItems:"center", gap:2 }}>
                <IconFlame size={16} />{streak}
              </div>
              <div style={{ fontSize:9, color:"var(--text-3)" }}>STREAK</div>
            </div>
          </div>
        </div>

        {/* Puzzle info */}
        <div className="glass" style={{ borderRadius:10, padding:"10px 12px" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:6 }}>PUZZLE</div>
          <div style={{ fontSize:12, color:"var(--text)", marginBottom:2 }}>
            Play as <span style={{ color:"var(--accent)", fontWeight:600 }}>
              {puzzle?.playerColor === "white" ? "♙ White" : "♟ Black"}
            </span>
          </div>
          <div style={{ fontSize:11, color:"var(--text-3)" }}>
            Theme: <span style={{ color:"var(--text-2)" }}>{puzzle?.theme || "tactics"}</span>
          </div>
          {hintUsed && (
            <div style={{ fontSize:10, color:"var(--warning)", marginTop:4 }}>⚠ Hint used</div>
          )}
        </div>

        {/* Status */}
        {status === "correct" && (
          <div style={{ padding:"10px 12px", borderRadius:10,
            background:"rgba(52,211,153,0.12)", border:"1px solid rgba(52,211,153,0.3)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"var(--success)", fontWeight:700, fontSize:13, marginBottom:4 }}>
              <IconCheck size={16} /> Correct!
            </div>
            <div style={{ fontSize:11, color:"var(--text-2)", lineHeight:1.5 }}>{explanation}</div>
          </div>
        )}

        {status === "wrong" && (
          <div style={{ padding:"10px 12px", borderRadius:10,
            background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.3)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:"var(--danger)", fontWeight:700, fontSize:13 }}>
              <IconX size={16} /> Not quite — try again
            </div>
          </div>
        )}

        {status === "revealed" && (
          <div style={{ padding:"10px 12px", borderRadius:10,
            background:"rgba(56,139,253,0.1)", border:"1px solid rgba(56,139,253,0.25)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--accent)", marginBottom:4 }}>Best move: {puzzle?.bestMove}</div>
            <div style={{ fontSize:11, color:"var(--text-2)", lineHeight:1.5 }}>{explanation}</div>
          </div>
        )}

        {status === "thinking" && (
          <div style={{ padding:"10px 12px", borderRadius:10, background:"var(--glass)",
            border:"1px solid var(--glass-border)", fontSize:11, color:"var(--text-3)", lineHeight:1.5 }}>
            Find the best move. You missed a capture in this position during a real game.
          </div>
        )}
        {status === "hint" && (
          <div style={{ padding:"10px 12px", borderRadius:10,
            background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.3)",
            fontSize:11, color:"var(--warning)", lineHeight:1.5 }}>
            💡 The highlighted piece can make a strong capture. Click it to see the options.
          </div>
        )}

        <div style={{ flex:1 }} />

        {/* Action buttons */}
        {(status === "thinking" || status === "hint") && (
          <>
            <button onClick={showHint} disabled={hintUsed}
              style={{
                padding:"7px 0", borderRadius:8, border:"1px solid var(--glass-border)",
                background:"var(--glass)", color: hintUsed ? "var(--text-3)" : "var(--warning)",
                cursor: hintUsed ? "not-allowed" : "pointer", fontSize:11, fontWeight:600,
                display:"flex", alignItems:"center", justifyContent:"center", gap:5,
              }}>
              <IconBulb size={13} /> {hintUsed ? "Hint used" : "Hint"}
            </button>
            <button onClick={revealAnswer}
              style={{
                padding:"7px 0", borderRadius:8, border:"1px solid var(--glass-border)",
                background:"var(--glass)", color:"var(--text-3)",
                cursor:"pointer", fontSize:11,
              }}>
              Reveal Answer
            </button>
          </>
        )}

        {(status === "correct" || status === "revealed") && (
          <button onClick={loadNextPuzzle}
            style={{
              padding:"9px 0", borderRadius:8, border:"none",
              background:"var(--accent)", color:"white",
              cursor:"pointer", fontSize:12, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
            Next Puzzle <IconArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Board */}
      <div style={{ flexShrink:0 }}>
        <div className="glass" style={{ borderRadius:14, padding:6,
          boxShadow:"0 0 40px rgba(0,0,0,0.5)",
          outline: status === "correct" ? "2px solid rgba(52,211,153,0.5)"
                 : status === "wrong"   ? "2px solid rgba(248,113,113,0.5)"
                 : "none",
          transition:"outline 0.2s",
        }}>
          <Chessboard
            key={puzzle?.id}
            options={{
              position: fen,
              boardOrientation: puzzle?.playerColor ?? "white",
              boardStyle: { borderRadius:8, width:size, height:size },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              squareStyles,
              onPieceDrop: onDrop,
              onSquareClick,
              allowDragging: isPlayerTurn() && status === "thinking",
              animationDurationInMs: 150,
            }}
          />
        </div>
      </div>
    </div>
  );
}
