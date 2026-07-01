"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { LIBRARY_OPENINGS, CATEGORIES, LibraryOpening, LibraryVariation } from "@/lib/openings/data";

interface FacingOpeningsProps {
  boardTheme?: { dark: string; light: string };
  onGameOver?: (result: string, pgn: string, opponentOpening: string) => void;
}

type VariationMode = "specific" | "all" | "random";

export default function FacingOpenings({
  boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" },
  onGameOver,
}: FacingOpeningsProps) {
  const [phase, setPhase] = useState<"setup" | "playing">("setup");
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">("all");
  const [selectedOpening, setSelectedOpening] = useState<LibraryOpening | null>(null);
  const [variationMode, setVariationMode] = useState<VariationMode>("all");
  const [hideVariationName, setHideVariationName] = useState(false);
  const [selectedVariationName, setSelectedVariationName] = useState<string | null>(null);
  const [engineElo, setEngineElo] = useState(1200);

  // Game state
  const [game, setGame] = useState(new Chess());
  const [size, setSize] = useState(400);
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [activeVariation, setActiveVariation] = useState<LibraryVariation | null>(null);
  const [bookMoveIdx, setBookMoveIdx] = useState(0); // tracks how far into the opponent's book line we are
  const [playerColor, setPlayerColor] = useState<"white" | "black">("black");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const bookMoveIdxRef = useRef(0);
  bookMoveIdxRef.current = bookMoveIdx;

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      const chrome = 22+22+24+48;
      const boardH = height - chrome;
      const boardW = width - 216;
      setSize(Math.max(Math.min(boardH, boardW), 240));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Init Stockfish
  useEffect(() => {
    const w = new Worker("/stockfish.js");
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === "string" ? e.data : "";
      if (!line.startsWith("bestmove")) return;
      const bestMove = line.split(" ")[1];
      if (!bestMove || bestMove === "(none)") { setIsThinking(false); return; }
      playEngineUciMove(bestMove);
    };
    w.postMessage("uci");
    w.postMessage("isready");
    return () => w.terminate();
  }, []);

  function getStatus(g: Chess) {
    if (g.isCheckmate()) return g.turn()==="w" ? "Black wins ✓" : "White wins ✓";
    if (g.isStalemate()) return "Stalemate";
    if (g.isDraw()) return "Draw";
    if (g.isCheck()) return "Check!";
    return "";
  }

  function playEngineUciMove(uciMove: string) {
    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move({
        from: uciMove.slice(0,2), to: uciMove.slice(2,4),
        promotion: uciMove[4] || "q",
      });
      if (move) {
        setGame(gameCopy);
        setLastMove({ from: move.from, to: move.to });
        setMoveHistory(prev => [...prev, move.san]);
        const status = getStatus(gameCopy);
        setGameStatus(status);
        if (gameCopy.isGameOver()) {
          onGameOver?.(status, gameCopy.pgn(), selectedOpening?.name ?? "");
        }
      }
    } catch { /**/ }
    setIsThinking(false);
  }

  function triggerEngine(fen: string, idx?: number) {
    const current = gameRef.current;
    setIsThinking(true);
    const currentIdx = idx ?? bookMoveIdxRef.current;

    // Check if we're still within the chosen opponent line
    if (activeVariation && currentIdx < activeVariation.moves.length) {
      const bookMove = activeVariation.moves[currentIdx];
      console.log("Book move at idx", currentIdx, ":", bookMove, "for", activeVariation.name);
      const gameCopy = new Chess(fen);
      try {
        const move = gameCopy.move(bookMove);
        if (move) {
          const nextIdx = currentIdx + 1;
          setBookMoveIdx(nextIdx);
          bookMoveIdxRef.current = nextIdx;
          setTimeout(() => {
            setGame(gameCopy);
            setLastMove({ from: move.from, to: move.to });
            setMoveHistory(prev => [...prev, move.san]);
            const status = getStatus(gameCopy);
            setGameStatus(status);
            setIsThinking(false);
            if (gameCopy.isGameOver()) {
              onGameOver?.(status, gameCopy.pgn(), selectedOpening?.name ?? "");
            }
          }, 400);
          return;
        }
      } catch { /* book move invalid in this position, fall through to engine */ }
    }

    // Outside book line — pure Stockfish
    const w = workerRef.current;
    if (!w) return;
    w.postMessage(`position fen ${fen}`);
    w.postMessage("setoption name UCI_LimitStrength value true");
    w.postMessage(`setoption name UCI_Elo value ${engineElo}`);
    w.postMessage("go movetime 800");
  }

  function onSquareClick({ square }: { square: string; piece?: unknown }) {
    const current = gameRef.current;
    const isMyTurn =
      (playerColor==="white" && current.turn()==="w") ||
      (playerColor==="black" && current.turn()==="b");

    if (selectedSquare && selectedSquare !== square) {
      const gameCopy = new Chess(current.fen());
      try {
        const move = gameCopy.move({ from: selectedSquare, to: square, promotion: "q" });
        if (move) {
          setGame(gameCopy);
          setLastMove({ from: move.from, to: move.to });
          setMoveHistory(prev => [...prev, move.san]);
          setSelectedSquare(null);
          setPossibleMoves([]);
          const nextIdx2 = bookMoveIdxRef.current + 1;
          setBookMoveIdx(nextIdx2);
          bookMoveIdxRef.current = nextIdx2;
          const status = getStatus(gameCopy);
          setGameStatus(status);
          if (gameCopy.isGameOver()) {
            onGameOver?.(status, gameCopy.pgn(), selectedOpening?.name ?? "");
            return;
          }
          setTimeout(() => triggerEngine(gameCopy.fen(), nextIdx2), 200);
          return;
        }
      } catch { /**/ }
    }

    if (!isMyTurn || isThinking) { setSelectedSquare(null); setPossibleMoves([]); return; }
    const moves = current.moves({ square: square as any, verbose: true });
    if ((moves as any[]).length > 0) {
      setSelectedSquare(square);
      setPossibleMoves((moves as any[]).map((m:any) => m.to));
    } else { setSelectedSquare(null); setPossibleMoves([]); }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string }) {
    const current = gameRef.current;
    const isMyTurn =
      (playerColor==="white" && current.turn()==="w") ||
      (playerColor==="black" && current.turn()==="b");
    if (!isMyTurn || isThinking || current.isGameOver()) return false;

    const gameCopy = new Chess(current.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion:"q" });
      if (!move) return false;
      setGame(gameCopy);
      setLastMove({ from: move.from, to: move.to });
      setMoveHistory(prev => [...prev, move.san]);
      setSelectedSquare(null);
      setPossibleMoves([]);
      const nextIdx3 = bookMoveIdxRef.current + 1;
      setBookMoveIdx(nextIdx3);
      bookMoveIdxRef.current = nextIdx3;
      const status = getStatus(gameCopy);
      setGameStatus(status);
      if (gameCopy.isGameOver()) {
        onGameOver?.(status, gameCopy.pgn(), selectedOpening?.name ?? "");
        return true;
      }
      setTimeout(() => triggerEngine(gameCopy.fen(), nextIdx3), 200);
      return true;
    } catch { return false; }
  }

  function startSession() {
    if (!selectedOpening) return;

    let variation: LibraryVariation;
    if (variationMode === "random") {
      variation = selectedOpening.variations[Math.floor(Math.random() * selectedOpening.variations.length)];
    } else if (variationMode === "specific" && selectedVariationName) {
      variation = selectedOpening.variations.find(v => v.name === selectedVariationName) ?? selectedOpening.variations[0];
    } else {
      // "all" mode — still need to start with one variation, picked randomly each game
      variation = selectedOpening.variations[Math.floor(Math.random() * selectedOpening.variations.length)];
    }

    // Player plays the OPPOSITE color of the opening's natural color
    // If opening.color is "white" (e.g. London System), player faces it as Black
    // If opening.color is "black" (e.g. Caro-Kann), player faces it as White
    const facingColor: "white" | "black" = selectedOpening.color === "black" ? "white" : "black";

    setPlayerColor(facingColor);
    setHideVariationName(variationMode === "random");
    setActiveVariation(variation);
    setBookMoveIdx(0);
    bookMoveIdxRef.current = 0;
    setGame(new Chess());
    setMoveHistory([]);
    setLastMove(null);
    setGameStatus("");
    setSelectedSquare(null);
    setPossibleMoves([]);
    setPhase("playing");

    // If player is black, engine (opponent) moves first
    if (facingColor === "black") {
      setTimeout(() => triggerEngine(new Chess().fen(), 0), 500);
    }
  }

  function endSession() {
    setPhase("setup");
    workerRef.current?.postMessage("stop");
  }

  function newGameSameOpening() {
    if (!selectedOpening) return;
    startSession();
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor:"rgba(59,158,255,0.2)" };
    squareStyles[lastMove.to] = { backgroundColor:"rgba(59,158,255,0.35)" };
  }
  if (selectedSquare) squareStyles[selectedSquare] = { backgroundColor:"rgba(59,158,255,0.5)" };
  possibleMoves.forEach(sq => {
    squareStyles[sq] = { background:"radial-gradient(circle, rgba(59,158,255,0.65) 28%, transparent 30%)" };
  });

  const filtered = LIBRARY_OPENINGS.filter(o => {
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase());
    const matchColor = colorFilter==="all" || o.color===colorFilter || o.color==="both";
    return matchSearch && matchColor;
  });

  const movePairs: [string,string?][] = [];
  for (let i=0; i<moveHistory.length; i+=2) movePairs.push([moveHistory[i], moveHistory[i+1]]);

  const isGameOver = (() => {
    const g = gameRef.current;
    return g.isGameOver();
  })();

  // ── SETUP SCREEN ──────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", overflow:"hidden" }}>
        {/* Left — opening list */}
        <div className="glass" style={{
          width: 300, flexShrink:0, borderRadius:0,
          borderTop:"none", borderBottom:"none", borderLeft:"none",
          display:"flex", flexDirection:"column", overflow:"hidden",
        }}>
          <div style={{ padding:"16px 16px 8px" }}>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:4 }}>
              Facing Openings
            </div>
            <div style={{ fontSize:11, color:"var(--text-3)", marginBottom:12 }}>
              Practice defending against specific systems
            </div>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search openings..."
              style={{
                width:"100%", background:"rgba(255,255,255,0.05)",
                border:"1px solid var(--glass-border)", borderRadius:8,
                color:"var(--text)", padding:"7px 10px",
                fontSize:13, fontFamily:"DM Sans, sans-serif", outline:"none", marginBottom:8,
              }}
            />
            <div style={{ display:"flex", gap:4 }}>
              {(["all","white","black"] as const).map(c => (
                <button key={c} onClick={() => setColorFilter(c)}
                  style={{
                    padding:"3px 10px", borderRadius:20, border:"none",
                    background: colorFilter===c ? "var(--accent)" : "var(--glass)",
                    color: colorFilter===c ? "white" : "var(--text-2)",
                    fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s",
                  }}>
                  {c==="all" ? "All" : c==="white" ? "♙ Opp. White" : "♟ Opp. Black"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"4px 8px" }}>
            {CATEGORIES.map(cat => {
              const catOpenings = filtered.filter(o => o.category===cat);
              if (catOpenings.length===0) return null;
              return (
                <div key={cat} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, padding:"6px 8px 4px" }}>
                    {cat.toUpperCase()}
                  </div>
                  {catOpenings.map(opening => (
                    <button key={opening.id}
                      onClick={() => { setSelectedOpening(opening); setSelectedVariationName(opening.variations[0].name); }}
                      style={{
                        width:"100%", padding:"9px 10px", borderRadius:8, border:"none",
                        background: selectedOpening?.id===opening.id ? "var(--accent-dim)" : "transparent",
                        borderLeft: selectedOpening?.id===opening.id ? "2px solid var(--accent)" : "2px solid transparent",
                        cursor:"pointer", textAlign:"left", transition:"all 0.15s", marginBottom:2,
                      }}>
                      <div style={{
                        fontSize:13, fontWeight:500,
                        color: selectedOpening?.id===opening.id ? "var(--accent)" : "var(--text)",
                      }}>
                        {opening.name}
                      </div>
                      <div style={{ fontSize:11, color:"var(--text-3)", marginTop:2 }}>
                        {opening.eco} · {opening.variations.length} variations
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — config */}
        <div style={{ flex:1, padding:"32px", overflowY:"auto" }}>
          {!selectedOpening ? (
            <div style={{
              height:"100%", display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center", gap:12, color:"var(--text-3)",
            }}>
              <div style={{ fontSize:32 }}>🎯</div>
              <div style={{ fontSize:14 }}>Select an opening to practice against</div>
            </div>
          ) : (
            <div style={{ maxWidth:480 }}>
              <div style={{ fontSize:20, fontWeight:800, color:"var(--text)", marginBottom:6 }}>
                {selectedOpening.name}
              </div>
              <div style={{ fontSize:13, color:"var(--text-2)", marginBottom:8, lineHeight:1.6 }}>
                {selectedOpening.description}
              </div>
              <div style={{
                display:"inline-flex", alignItems:"center", gap:6,
                background:"var(--accent-dim)", padding:"6px 12px", borderRadius:20,
                fontSize:12, color:"var(--accent)", marginBottom:24,
              }}>
                You'll play as {selectedOpening.color==="black" ? "♙ White" : "♟ Black"} against this opening
              </div>

              {/* Variation mode */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:8 }}>
                  VARIATION
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                  {([
                    { id:"all", label:"Random Each Game", desc:"New variation every game" },
                    { id:"specific", label:"Specific Line", desc:"Always this exact line" },
                    { id:"random", label:"Surprise Me", desc:"Variation name hidden" },
                  ] as const).map(mode => (
                    <button key={mode.id} onClick={() => setVariationMode(mode.id)}
                      style={{
                        padding:"10px 8px", borderRadius:10, border:"none",
                        background: variationMode===mode.id ? "var(--accent)" : "var(--glass)",
                        cursor:"pointer", transition:"all 0.15s", textAlign:"left",
                      }}>
                      <div style={{
                        fontSize:12, fontWeight:600,
                        color: variationMode===mode.id ? "white" : "var(--text)",
                      }}>{mode.label}</div>
                      <div style={{
                        fontSize:10, marginTop:2,
                        color: variationMode===mode.id ? "rgba(255,255,255,0.7)" : "var(--text-3)",
                      }}>{mode.desc}</div>
                    </button>
                  ))}
                </div>
                {variationMode === "specific" && (
                  <select
                    value={selectedVariationName ?? ""}
                    onChange={e => setSelectedVariationName(e.target.value)}
                    style={{
                      width:"100%", background:"var(--glass)", border:"1px solid var(--glass-border)",
                      borderRadius:8, color:"var(--text)", padding:"8px 12px",
                      fontSize:13, fontFamily:"DM Sans, sans-serif", cursor:"pointer",
                    }}>
                    {selectedOpening.variations.map(v => (
                      <option key={v.name} value={v.name} style={{ background:"#0D1420" }}>{v.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Engine strength */}
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:8 }}>
                  OPPONENT STRENGTH
                </div>
                <select
                  value={engineElo} onChange={e => setEngineElo(Number(e.target.value))}
                  style={{
                    width:"100%", background:"var(--glass)", border:"1px solid var(--glass-border)",
                    borderRadius:8, color:"var(--text)", padding:"8px 12px",
                    fontSize:13, fontFamily:"DM Sans, sans-serif", cursor:"pointer",
                  }}>
                  {[800,1000,1200,1400,1600,1800,2000,2500].map(e => (
                    <option key={e} value={e} style={{ background:"#0D1420" }}>{e}</option>
                  ))}
                </select>
              </div>

              <button className="btn-accent" onClick={startSession} style={{ padding:"12px 32px", fontSize:14, width:"100%" }}>
                Start Practice →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PLAYING SCREEN ───────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{
      width:"100%", height:"100%",
      display:"flex", alignItems:"center", justifyContent:"center", padding:12, gap:12,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4, flexShrink:0 }}>
        {/* Opponent label */}
        <div style={{ fontSize:11, color:"var(--text-3)" }}>
          Facing: <span style={{ color:"var(--accent)" }}>
            {hideVariationName
              ? "??? (guess the opening)"
              : activeVariation ? `${selectedOpening?.name} — ${activeVariation.name}` : selectedOpening?.name}
          </span>
        </div>

        <div className="glass" style={{
          borderRadius:14, overflow:"hidden", padding:6,
          boxShadow:"0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          <Chessboard
            options={{
              position: game.fen(),
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
      </div>

      {/* Right panel */}
      <div style={{ width:200, height:size+12, display:"flex", flexDirection:"column", flexShrink:0, gap:8 }}>
        <div className="glass" style={{ borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{
            width:6, height:6, borderRadius:"50%", flexShrink:0,
            background: gameStatus ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)",
            boxShadow: `0 0 6px ${gameStatus ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)"}`,
          }} />
          <span style={{ fontSize:12, color:"var(--text-2)" }}>
            {gameStatus || (isThinking ? "Thinking..." : "Your turn")}
          </span>
        </div>

        <div className="glass" style={{ flex:1, borderRadius:10, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid var(--glass-border)", fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1 }}>
            MOVES
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"4px 0" }}>
            {movePairs.map(([white,black],i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"24px 1fr 1fr", padding:"3px 8px" }}>
                <span style={{ fontSize:11, color:"var(--text-3)", fontFamily:"DM Mono, monospace" }}>{i+1}.</span>
                <span style={{ fontSize:12, fontFamily:"DM Mono, monospace", color:"var(--text)" }}>{white}</span>
                <span style={{ fontSize:12, fontFamily:"DM Mono, monospace", color:"var(--text-2)" }}>{black??""}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <button className="btn-glass" onClick={newGameSameOpening} style={{ fontSize:11, padding:"7px 0" }}>
            🔄 New Game, Same Opening
          </button>
          <button className="btn-glass" onClick={endSession} style={{ fontSize:11, padding:"7px 0" }}>
            ← Back to Selection
          </button>
        </div>
      </div>
    </div>
  );
}
