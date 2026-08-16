"use client";
import { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { IconFlame, IconShield, IconArrowBack, IconSwords, IconChevronRight } from "@tabler/icons-react";
import { GAMBITS, GambitMode, type GambitPosition } from "../types";
import { computeCompensation } from "../engine/compensation";
import { getStockfishPool } from "@/lib/engine/workerPool";

interface Props { boardTheme?: { dark: string; light: string }; }

type Phase = "browse" | "setup" | "playing";

const MODE_META: Record<GambitMode, { label: string; icon: string; desc: string; color: string }> = {
  attack:  { label: "Attack the King",       icon: "⚔",  desc: "You sacrificed. Find the most forcing continuation.", color: "#f87171" },
  defend:  { label: "Defend & Consolidate",  icon: "🛡",  desc: "You're up material but under pressure. Stay calm.",   color: "#34d399" },
  decline: { label: "Decline & Punish",      icon: "↩",  desc: "Opponent offers a gambit. Find the refutation.",      color: "#fbbf24" },
  convert: { label: "Convert the Edge",      icon: "♟",  desc: "Transition from initiative to endgame advantage.",     color: "#388bfd" },
};

export default function GambitLab({ boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" } }: Props) {
  const [phase, setPhase] = useState<Phase>("browse");
  const [selectedGambit, setSelectedGambit] = useState<typeof GAMBITS[number] | null>(null);
  const [selectedMode, setSelectedMode] = useState<GambitMode>("attack");
  const [playAs, setPlayAs] = useState<"white" | "black">("white");

  // Play state
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(new Chess().fen());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [gameStatus, setGameStatus] = useState("");
  const [bookMoveIdx, setBookMoveIdx] = useState(0);
  const bookMoveIdxRef = useRef(0);
  const [size, setSize] = useState(380);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerIdRef = useRef<number | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  // Compensation
  const [compensation, setCompensation] = useState<ReturnType<typeof computeCompensation> | null>(null);
  const [stockfishEval, setStockfishEval] = useState(0);

  // Responsive board size
  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { width, height } = wrapperRef.current.getBoundingClientRect();
      setSize(Math.max(Math.min(height - 160, width - 260), 220));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [phase]);

  // Init Stockfish
  useEffect(() => {
    const pool = getStockfishPool();
    if (!pool) return;
    const id = pool.acquire((line: string) => {
      if (line.startsWith("info") && line.includes("score cp")) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) setStockfishEval(parseInt(match[1]));
      }
      if (!line.startsWith("bestmove")) return;
      const bestMove = line.split(" ")[1];
      if (!bestMove || bestMove === "(none)") { setIsThinking(false); return; }
      const gameCopy = new Chess(gameRef.current.fen());
      try {
        const move = gameCopy.move({ from: bestMove.slice(0,2), to: bestMove.slice(2,4), promotion: bestMove[4] || "q" });
        if (move) {
          const nextIdx = bookMoveIdxRef.current + 1;
          setBookMoveIdx(nextIdx);
          bookMoveIdxRef.current = nextIdx;
          setGame(gameCopy);
          setFen(gameCopy.fen());
          setLastMove({ from: move.from, to: move.to });
          setMoveHistory(prev => [...prev, move.san]);
          const status = getStatus(gameCopy);
          setGameStatus(status);
          // Update compensation after engine move
          setCompensation(computeCompensation(gameCopy.fen(), stockfishEval));
        }
      } catch { /**/ }
      setIsThinking(false);
    });
    workerIdRef.current = id;
    return () => { pool.release(id); };
  }, []);

  function getStatus(g: Chess) {
    if (g.isCheckmate()) return g.turn() === "w" ? "Black wins" : "White wins";
    if (g.isStalemate()) return "Stalemate";
    if (g.isDraw()) return "Draw";
    if (g.isCheck()) return "Check!";
    return "";
  }

  function startSession() {
    if (!selectedGambit) return;
    const g = new Chess();
    // Play gambit moves to reach starting position
    const bookMoves = [...selectedGambit.moves];
    for (const m of bookMoves) {
      try { g.move(m); } catch { break; }
    }
    setGame(g);
    setFen(g.fen());
    setMoveHistory(g.history());
    setLastMove(null);
    setGameStatus("");
    setSelectedSquare(null);
    setPossibleMoves([]);
    setBookMoveIdx(bookMoves.length);
    bookMoveIdxRef.current = bookMoves.length;
    setCompensation(computeCompensation(g.fen(), 0));
    setPhase("playing");

    // If engine moves first
    const isPlayerTurn = (playAs === "white" && g.turn() === "w") || (playAs === "black" && g.turn() === "b");
    if (!isPlayerTurn) {
      setTimeout(() => triggerEngine(g.fen(), bookMoves.length), 600);
    }
  }

  function triggerEngine(fenStr: string, idx: number) {
    const pool = getStockfishPool();
    const wId = workerIdRef.current;
    if (!pool || wId === null) return;
    setIsThinking(true);
    pool.send(wId, `position fen ${fenStr}`);
    pool.send(wId, "setoption name UCI_LimitStrength value true");
    pool.send(wId, "setoption name UCI_Elo value 1800");
    pool.send(wId, "go movetime 800");
  }

  function isPlayerTurn() {
    const g = gameRef.current;
    return (playAs === "white" && g.turn() === "w") || (playAs === "black" && g.turn() === "b");
  }

  function handleMove(from: string, to: string): boolean {
    if (!isPlayerTurn() || isThinking) return false;
    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move({ from, to, promotion: "q" });
      if (!move) return false;
      const nextIdx = bookMoveIdxRef.current + 1;
      setBookMoveIdx(nextIdx);
      bookMoveIdxRef.current = nextIdx;
      setGame(gameCopy);
      setFen(gameCopy.fen());
      setLastMove({ from: move.from, to: move.to });
      setMoveHistory(prev => [...prev, move.san]);
      setSelectedSquare(null);
      setPossibleMoves([]);
      const status = getStatus(gameCopy);
      setGameStatus(status);
      setCompensation(computeCompensation(gameCopy.fen(), stockfishEval));
      if (!gameCopy.isGameOver()) {
        setTimeout(() => triggerEngine(gameCopy.fen(), nextIdx), 200);
      }
      return true;
    } catch { return false; }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string }) {
    return handleMove(sourceSquare, targetSquare);
  }

  function onSquareClick({ square }: { square: string }) {
    if (!isPlayerTurn() || isThinking) return;
    if (selectedSquare && selectedSquare !== square) {
      if (handleMove(selectedSquare, square)) return;
    }
    const moves = gameRef.current.moves({ square: square as any, verbose: true }) as any[];
    if (moves.length > 0) {
      setSelectedSquare(square);
      setPossibleMoves(moves.map((m: any) => m.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(56,139,253,0.2)" };
    squareStyles[lastMove.to]   = { backgroundColor: "rgba(56,139,253,0.35)" };
  }
  if (selectedSquare) squareStyles[selectedSquare] = { backgroundColor: "rgba(56,139,253,0.5)" };
  possibleMoves.forEach(sq => {
    squareStyles[sq] = { background: "radial-gradient(circle, rgba(56,139,253,0.65) 28%, transparent 30%)" };
  });

  const movePairs: [string, string?][] = [];
  for (let i = 0; i < moveHistory.length; i += 2) movePairs.push([moveHistory[i], moveHistory[i+1]]);

  // ── BROWSE ────────────────────────────────────────────────────────────────
  if (phase === "browse") return (
    <div style={{ width:"100%", height:"100%", overflowY:"auto", padding:20 }}>
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:800, color:"var(--text)", marginBottom:4 }}>Gambit Lab ⭐</div>
        <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:20 }}>
          Practice the sharpest gambits. Master compensation over material.
        </div>

        <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:10 }}>
          SELECT GAMBIT
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
          {GAMBITS.map(g => (
            <button key={g.id} onClick={() => { setSelectedGambit(g); setPhase("setup"); }}
              style={{
                textAlign:"left", padding:"12px 16px", borderRadius:12,
                background: "var(--glass)", border: "1px solid var(--glass-border)",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
                transition:"all 0.15s",
              }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"var(--text)" }}>{g.name}</div>
                <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2 }}>
                  {g.eco} · {g.moves.join(" ")}
                </div>
              </div>
              <IconChevronRight size={16} color="var(--text-3)" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (phase === "setup") return (
    <div style={{ width:"100%", height:"100%", overflowY:"auto", padding:20 }}>
      <div style={{ maxWidth:480, margin:"0 auto" }}>
        <button onClick={() => setPhase("browse")}
          style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none",
            color:"var(--text-3)", cursor:"pointer", fontSize:12, marginBottom:20 }}>
          <IconArrowBack size={14} /> Back to gambits
        </button>

        <div style={{ fontSize:18, fontWeight:800, color:"var(--text)", marginBottom:4 }}>
          {selectedGambit?.name}
        </div>
        <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:20 }}>
          {selectedGambit?.eco} · {selectedGambit?.moves.join(" ")}
        </div>

        <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:10 }}>
          TRAINING MODE
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          {(Object.entries(MODE_META) as [GambitMode, typeof MODE_META[GambitMode]][]).map(([id, meta]) => (
            <button key={id} onClick={() => setSelectedMode(id)}
              style={{
                textAlign:"left", padding:"12px 14px", borderRadius:10, border:"none",
                background: selectedMode === id ? "var(--accent-dim)" : "var(--glass)",
                cursor:"pointer", display:"flex", alignItems:"flex-start", gap:12,
                outline: selectedMode === id ? "1px solid rgba(56,139,253,0.4)" : "none",
                transition:"all 0.15s",
              }}
            >
              <span style={{ fontSize:20 }}>{meta.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color: selectedMode === id ? "var(--accent)" : "var(--text)" }}>
                  {meta.label}
                </div>
                <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2 }}>{meta.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:10 }}>
          PLAY AS
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          {(["white","black"] as const).map(c => (
            <button key={c} onClick={() => setPlayAs(c)}
              style={{
                flex:1, padding:"8px 0", borderRadius:8, border:"none",
                background: playAs === c ? "var(--accent)" : "var(--glass)",
                color: playAs === c ? "white" : "var(--text-2)",
                fontSize:13, fontWeight:600, cursor:"pointer",
              }}>
              {c === "white" ? "♙ White" : "♟ Black"}
            </button>
          ))}
        </div>

        <button onClick={startSession}
          style={{
            width:"100%", padding:"12px 0", borderRadius:10, border:"none",
            background:"var(--accent)", color:"white", fontSize:14, fontWeight:700,
            cursor:"pointer",
          }}>
          Start Session →
        </button>
      </div>
    </div>
  );

  // ── PLAYING ───────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{
      width:"100%", height:"100%", display:"flex",
      alignItems:"center", justifyContent:"center", padding:12, gap:10,
    }}>
      {/* LEFT — Compensation panel */}
      <div style={{ width:180, height:size + 60, display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
        {/* Mode indicator */}
        <div style={{
          padding:"8px 10px", borderRadius:10,
          background: MODE_META[selectedMode].color + "15",
          border: `1px solid ${MODE_META[selectedMode].color}33`,
        }}>
          <div style={{ fontSize:11, fontWeight:700, color:MODE_META[selectedMode].color, marginBottom:2 }}>
            {MODE_META[selectedMode].icon} {MODE_META[selectedMode].label}
          </div>
          <div style={{ fontSize:10, color:"var(--text-3)", lineHeight:1.4 }}>
            {MODE_META[selectedMode].desc}
          </div>
        </div>

        {/* Compensation meter */}
        <div className="glass" style={{ flex:1, borderRadius:10, padding:"10px 12px", overflow:"hidden" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:8 }}>
            COMPENSATION
          </div>
          {compensation ? (
            <>
              <div style={{ fontSize:11, color:"var(--accent)", fontWeight:600, marginBottom:10, lineHeight:1.4 }}>
                {compensation.verbalAssessment}
              </div>
              {([
                ["Material",    compensation.material / 3],
                ["Initiative",  compensation.initiative],
                ["King Safety", compensation.kingSafety],
                ["Activity",    compensation.activity],
                ["Structure",   compensation.structure],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:10, color:"var(--text-3)" }}>{label}</span>
                    <span style={{ fontSize:10, color: val >= 0 ? "#34d399" : "#f87171", fontWeight:600 }}>
                      {val >= 0 ? "+" : ""}{val.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden", position:"relative" }}>
                    <div style={{
                      position:"absolute",
                      left: val >= 0 ? "50%" : `${50 + val * 50}%`,
                      width: `${Math.abs(val) * 50}%`,
                      height:"100%",
                      background: val >= 0 ? "#34d399" : "#f87171",
                      borderRadius:2,
                      transition:"all 0.3s",
                    }} />
                    <div style={{ position:"absolute", left:"50%", top:0, bottom:0, width:1, background:"rgba(255,255,255,0.15)" }} />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize:11, color:"var(--text-3)" }}>Make a move to see compensation analysis</div>
          )}
        </div>

        <button onClick={() => setPhase("setup")}
          style={{ fontSize:11, padding:"7px 0", borderRadius:8,
            background:"var(--glass)", border:"1px solid var(--glass-border)",
            color:"var(--text-2)", cursor:"pointer" }}>
          ← New Setup
        </button>
      </div>

      {/* CENTER — Board */}
      <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 4px" }}>
          <div style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{selectedGambit?.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:6, height:6, borderRadius:"50%",
              background: gameStatus ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)" }} />
            <span style={{ fontSize:11, color:"var(--text-2)" }}>
              {gameStatus || (isThinking ? "Thinking..." : isPlayerTurn() ? "Your turn" : "Engine")}
            </span>
          </div>
        </div>

        <div className="glass" style={{ borderRadius:14, padding:6, overflow:"hidden",
          boxShadow:"0 0 40px rgba(0,0,0,0.5)" }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: playAs,
              boardStyle: { borderRadius:8, width:size, height:size },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              squareStyles,
              onPieceDrop: onDrop,
              onSquareClick,
              allowDragging: isPlayerTurn() && !isThinking,
              animationDurationInMs: 180,
            }}
          />
        </div>
      </div>

      {/* RIGHT — Moves */}
      <div style={{ width:160, height:size + 60, display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
        {/* Gambit intro tip */}
        <div className="glass" style={{ borderRadius:10, padding:"8px 10px" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:4 }}>
            OBJECTIVE
          </div>
          <div style={{ fontSize:10, color:"var(--text-2)", lineHeight:1.5 }}>
            {selectedMode === "attack" && "Press with initiative. Don't let the king escape. Look for forcing moves."}
            {selectedMode === "defend" && "Find the calmest, most accurate defense. Consolidate your material edge."}
            {selectedMode === "decline" && "Decline safely or punish the gambit. Find the exact refutation."}
            {selectedMode === "convert" && "Trade off initiative for a clean material or positional endgame advantage."}
          </div>
        </div>

        {/* Move list */}
        <div className="glass" style={{ flex:1, borderRadius:10, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"6px 10px 4px", borderBottom:"1px solid var(--glass-border)",
            fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1 }}>
            MOVES
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"4px 0" }}>
            {movePairs.map(([w, b], i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"18px 1fr 1fr", padding:"2px 6px" }}>
                <span style={{ fontSize:10, color:"var(--text-3)", fontFamily:"DM Mono, monospace" }}>{i+1}.</span>
                <span style={{ fontSize:10, fontFamily:"DM Mono, monospace", color:"var(--text)" }}>{w}</span>
                <span style={{ fontSize:10, fontFamily:"DM Mono, monospace", color:"var(--text-2)" }}>{b ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
