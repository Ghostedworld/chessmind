"use client";
import { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { db, HistoricalGame } from "@/lib/db";
import { HISTORICAL_SEED_GAMES } from "@/lib/openings/historicalSeed";
import { detectOpening } from "@/lib/openings/detect";
import { parseGame } from "@/lib/import/bundleParser";
import dynamic from "next/dynamic";

const BundleImport = dynamic(() => import("@/components/import/BundleImport"), { ssr: false });

interface HistoricalReplayerProps {
  boardTheme?: { dark: string; light: string };
}

type DeviationMode = "correct" | "punishment";
type Phase = "browse" | "follow" | "playing" | "punishment_active";

export default function HistoricalReplayer({
  boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" },
}: HistoricalReplayerProps) {
  const [games, setGames] = useState<(HistoricalGame & { isSeed?: boolean })[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGame, setSelectedGame] = useState<(HistoricalGame & { isSeed?: boolean }) | null>(null);
  const [playAs, setPlayAs] = useState<"white" | "black">("white");
  const [deviationMode, setDeviationMode] = useState<DeviationMode>("punishment");
  const [showBundleImport, setShowBundleImport] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const listRef = useRef<HTMLDivElement>(null);
  const [followIdx, setFollowIdx] = useState(0);
  const [followGame, setFollowGame] = useState(new Chess());
  const [followAutoplay, setFollowAutoplay] = useState(false);

  // Play state
  const [phase, setPhase] = useState<Phase>("browse");
  const [game, setGame] = useState(new Chess());
  const [historicalMoves, setHistoricalMoves] = useState<string[]>([]);
  const [moveIdx, setMoveIdx] = useState(0);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [size, setSize] = useState(400);
  const [deviated, setDeviated] = useState(false);
  const [punishmentMovesLeft, setPunishmentMovesLeft] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [gameStatus, setGameStatus] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [engineElo] = useState(1600);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { loadGames(); }, []);

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      const boardW = width - 216;
      // Follow mode has extra chrome: name+event (44px) + scrubber (28px) + controls (40px) + gaps (24px) + padding (24px)
      const chromeHeight = phase === "follow" ? 180 : 100;
      const boardH = height - chromeHeight;
      setSize(Math.max(Math.min(boardH, boardW), 220));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    const w = new Worker("/stockfish.js");
    workerRef.current = w;
    w.onmessage = (e: MessageEvent) => {
      const line: string = typeof e.data === "string" ? e.data : "";
      if (!line.startsWith("bestmove")) return;
      const bestMove = line.split(" ")[1];
      if (!bestMove || bestMove === "(none)") { setIsThinking(false); return; }
      const gameCopy = new Chess(gameRef.current.fen());
      try {
        const move = gameCopy.move({ from: bestMove.slice(0,2), to: bestMove.slice(2,4), promotion: bestMove[4]||"q" });
        if (move) {
          setGame(gameCopy);
          setLastMove({ from: move.from, to: move.to });
          setMoveHistory(prev => [...prev, move.san]);
          const status = getStatus(gameCopy);
          setGameStatus(status);
        }
      } catch { /**/ }
      setIsThinking(false);
    };
    w.postMessage("uci");
    w.postMessage("isready");
    return () => w.terminate();
  }, []);

  async function loadGames() {
    const seedGames = HISTORICAL_SEED_GAMES.map((g, i) => ({
      id: -1 - i,
      ...g,
      tags: [],
      source: "manual" as const,
      addedAt: new Date(),
      isSeed: true,
    }));

    const userGames = await db.historicalGames.toArray();

    // Fix opening names for games that are missing them
    const needsOpening = userGames.filter(g => !g.openingName);
    if (needsOpening.length > 0) {
      for (const g of needsOpening) {
        try {
          const parsed = parseGame(g.pgn);
          if (parsed && parsed.moves.length > 0) {
            const detected = detectOpening(parsed.moves);
            if (detected && g.id) {
              await db.historicalGames.update(g.id, { openingName: detected });
              g.openingName = detected;
            }
          }
        } catch { /**/ }
      }
    }

    setGames([...seedGames, ...userGames]);
  }

  function getStatus(g: Chess) {
    if (g.isCheckmate()) return g.turn()==="w" ? "Black wins ✓" : "White wins ✓";
    if (g.isStalemate()) return "Stalemate";
    if (g.isDraw()) return "Draw";
    if (g.isCheck()) return "Check!";
    return "";
  }

  function startGame(g: HistoricalGame & { isSeed?: boolean }) {
    const chess = new Chess();
    try { chess.loadPgn(g.pgn); } catch { alert("Couldn't parse this game's PGN"); return; }
    const moves = chess.history();

    setSelectedGame(g);
    setHistoricalMoves(moves);
    setMoveIdx(0);
    setGame(new Chess());
    setMoveHistory([]);
    setLastMove(null);
    setGameStatus("");
    setDeviated(false);
    setPunishmentMovesLeft(0);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setPhase("playing");

    // If player chose black, play white's first historical move automatically
    if (playAs === "black") {
      setTimeout(() => playHistoricalMove(0, new Chess()), 500);
    }
  }

  function startFollowMode(g: HistoricalGame & { isSeed?: boolean }) {
    const chess = new Chess();
    try { chess.loadPgn(g.pgn); } catch { alert("Couldn't parse this game's PGN"); return; }
    const moves = chess.history();

    setSelectedGame(g);
    setHistoricalMoves(moves);
    setFollowIdx(0);
    setFollowGame(new Chess());
    setFollowAutoplay(false);
    if (autoplayIntervalRef.current) { clearInterval(autoplayIntervalRef.current); autoplayIntervalRef.current = null; }
    setPhase("follow");
  }

  function followGoTo(idx: number) {
    const clamped = Math.max(0, Math.min(idx, historicalMoves.length));
    const g = new Chess();
    for (let i = 0; i < clamped; i++) {
      try { g.move(historicalMoves[i]); } catch { break; }
    }
    setFollowGame(g);
    setFollowIdx(clamped);
  }

  function followNext() {
    if (followIdx >= historicalMoves.length) { setFollowAutoplay(false); followAutoplayRef.current = false; return; }
    followGoTo(followIdx + 1);
  }

  function followPrev() {
    followGoTo(followIdx - 1);
  }

  function toggleFollowAutoplay() {
    const next = !followAutoplay;
    setFollowAutoplay(next);

    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current);
      autoplayIntervalRef.current = null;
    }

    if (next) {
      autoplayIntervalRef.current = setInterval(() => {
        setFollowIdx(prevIdx => {
          const nextIdx = prevIdx + 1;
          if (nextIdx > historicalMoves.length) {
            if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
            autoplayIntervalRef.current = null;
            setFollowAutoplay(false);
            return prevIdx;
          }
          const g = new Chess();
          for (let i = 0; i < nextIdx; i++) {
            try { g.move(historicalMoves[i]); } catch { break; }
          }
          setFollowGame(g);
          if (nextIdx >= historicalMoves.length) {
            if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
            autoplayIntervalRef.current = null;
            setFollowAutoplay(false);
          }
          return nextIdx;
        });
      }, 1000);
    }
  }

  useEffect(() => {
    return () => {
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current);
    };
  }, []);

  function enterChallengeFromFollow() {
    if (!selectedGame) return;
    setFollowAutoplay(false);
    if (autoplayIntervalRef.current) { clearInterval(autoplayIntervalRef.current); autoplayIntervalRef.current = null; }
    startGame(selectedGame);
  }

  function playHistoricalMove(idx: number, currentGame: Chess) {
    if (idx >= historicalMoves.length) return;
    const moveSan = historicalMoves[idx];
    const gameCopy = new Chess(currentGame.fen());
    try {
      const move = gameCopy.move(moveSan);
      if (move) {
        setGame(gameCopy);
        setLastMove({ from: move.from, to: move.to });
        setMoveHistory(prev => [...prev, move.san]);
        setMoveIdx(idx + 1);
        const status = getStatus(gameCopy);
        setGameStatus(status);
      }
    } catch { /**/ }
  }

  function isPlayerTurn() {
    const g = gameRef.current;
    return (playAs==="white" && g.turn()==="w") || (playAs==="black" && g.turn()==="b");
  }

  function handlePlayerMove(san: string, from: string, to: string) {
    const expected = historicalMoves[moveIdx];
    const isMatch = san === expected || san.replace(/[+#]/g,"") === (expected||"").replace(/[+#]/g,"");

    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move(san);
      if (!move) return false;

      setGame(gameCopy);
      setLastMove({ from: move.from, to: move.to });
      setMoveHistory(prev => [...prev, move.san]);
      setSelectedSquare(null);
      setPossibleMoves([]);
      const status = getStatus(gameCopy);
      setGameStatus(status);

      if (gameCopy.isGameOver()) return true;

      if (isMatch && !deviated) {
        // Still in book — play next historical move for opponent
        setMoveIdx(prev => prev + 1);
        setTimeout(() => playHistoricalMove(moveIdx + 1, gameCopy), 500);
      } else if (!deviated) {
        // Just deviated!
        setDeviated(true);
        if (deviationMode === "punishment") {
          setPunishmentMovesLeft(4); // 4 more moves of punishment phase before... well it's continuous now
          setPhase("punishment_active");
        }
        triggerEngine(gameCopy.fen());
      } else {
        // Already deviated, continue with engine
        triggerEngine(gameCopy.fen());
        if (punishmentMovesLeft > 0) setPunishmentMovesLeft(prev => prev - 1);
      }
      return true;
    } catch { return false; }
  }

  function triggerEngine(fen: string) {
    const w = workerRef.current;
    if (!w) return;
    setIsThinking(true);
    w.postMessage(`position fen ${fen}`);
    w.postMessage("setoption name UCI_LimitStrength value true");
    w.postMessage(`setoption name UCI_Elo value ${engineElo}`);
    w.postMessage("go movetime 800");
  }

  function onSquareClick({ square }: { square: string; piece?: unknown }) {
    if (!isPlayerTurn() || isThinking) { setSelectedSquare(null); setPossibleMoves([]); return; }
    const current = gameRef.current;

    if (selectedSquare && selectedSquare !== square) {
      const gameCopy = new Chess(current.fen());
      try {
        const move = gameCopy.move({ from: selectedSquare, to: square, promotion:"q" });
        if (move) { handlePlayerMove(move.san, move.from, move.to); return; }
      } catch { /**/ }
    }
    const moves = current.moves({ square: square as any, verbose: true });
    if ((moves as any[]).length > 0) {
      setSelectedSquare(square);
      setPossibleMoves((moves as any[]).map((m:any) => m.to));
    } else { setSelectedSquare(null); setPossibleMoves([]); }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string }) {
    if (!isPlayerTurn() || isThinking) return false;
    const current = gameRef.current;
    const gameCopy = new Chess(current.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      return handlePlayerMove(move.san, move.from, move.to);
    } catch { return false; }
  }

  function exitToBrowse() {
    setPhase("browse");
    workerRef.current?.postMessage("stop");
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

  const filtered = games.filter(g => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      g.white.toLowerCase().includes(q) ||
      g.black.toLowerCase().includes(q) ||
      (g.openingName||"").toLowerCase().includes(q) ||
      (g.eco||"").toLowerCase().includes(q) ||
      (g.event||"").toLowerCase().includes(q) ||
      (g.date||"").toLowerCase().includes(q)
    );
  });
  const visibleGames = filtered.slice(0, visibleCount);

  const movePairs: [string,string?][] = [];
  for (let i=0; i<moveHistory.length; i+=2) movePairs.push([moveHistory[i], moveHistory[i+1]]);

  // ── BROWSE SCREEN ─────────────────────────────────────────────────────────
  if (phase === "browse") {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", overflow:"hidden" }}>
        <div style={{ flex:1, padding:"20px 24px", overflowY:"auto" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:"var(--text)" }}>Historical Game Replayer</div>
              <div style={{ fontSize:12, color:"var(--text-3)", marginTop:2 }}>
                Play through real games. Deviate, and face the consequences yourself.
              </div>
            </div>
            <button className="btn-glass" onClick={() => setShowBundleImport(true)} style={{ fontSize:12, padding:"7px 14px", flexShrink:0 }}>
              + Import Games
            </button>
          </div>

          <div style={{ fontSize:11, color:"var(--text-3)", marginBottom:6 }}>
            {games.length} games loaded{search ? ` · ${filtered.length} match "${search}"` : ""}
          </div>
          <input
            value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(50); }}
            placeholder="Search by player, opening, ECO, or year..."
            style={{
              width:"100%", background:"rgba(255,255,255,0.05)",
              border:"1px solid var(--glass-border)", borderRadius:8,
              color:"var(--text)", padding:"9px 12px",
              fontSize:13, fontFamily:"DM Sans, sans-serif", outline:"none", marginBottom:16,
            }}
          />

          {/* Play as + deviation mode */}
          <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:6 }}>PLAY AS</div>
              <div style={{ display:"flex", gap:6 }}>
                {(["white","black"] as const).map(c => (
                  <button key={c} onClick={() => setPlayAs(c)}
                    style={{
                      padding:"5px 14px", borderRadius:8, border:"none",
                      background: playAs===c ? "var(--accent)" : "var(--glass)",
                      color: playAs===c ? "white" : "var(--text-2)",
                      fontSize:12, fontWeight:600, cursor:"pointer",
                    }}>
                    {c==="white" ? "♙ White" : "♟ Black"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:6 }}>ON DEVIATION</div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => setDeviationMode("punishment")}
                  style={{
                    padding:"5px 14px", borderRadius:8, border:"none",
                    background: deviationMode==="punishment" ? "var(--accent)" : "var(--glass)",
                    color: deviationMode==="punishment" ? "white" : "var(--text-2)",
                    fontSize:12, fontWeight:600, cursor:"pointer",
                  }}>
                  Punishment Phase
                </button>
                <button onClick={() => setDeviationMode("correct")}
                  style={{
                    padding:"5px 14px", borderRadius:8, border:"none",
                    background: deviationMode==="correct" ? "var(--accent)" : "var(--glass)",
                    color: deviationMode==="correct" ? "white" : "var(--text-2)",
                    fontSize:12, fontWeight:600, cursor:"pointer",
                  }}>
                  Just Continue
                </button>
              </div>
            </div>
          </div>

          {/* Game list */}
          <div ref={listRef} style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {visibleGames.map(g => (
              <div key={g.id}
                style={{
                  padding:"12px 16px", borderRadius:12,
                  background:"var(--glass)", border:"1px solid var(--glass-border)",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"var(--text)" }}>
                    {g.white} <span style={{ color:"var(--text-3)" }}>vs</span> {g.black}
                  </div>
                  <div style={{
                    fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10,
                    background: g.result==="1-0" ? "rgba(255,255,255,0.08)" : g.result==="0-1" ? "rgba(0,0,0,0.3)" : "rgba(251,191,36,0.15)",
                    color: g.result==="1-0" ? "var(--text)" : g.result==="0-1" ? "var(--text-2)" : "var(--warning)",
                  }}>
                    {g.result === "1-0" ? "White won" : g.result === "0-1" ? "Black won" : g.result === "1/2-1/2" ? "Draw" : g.result}
                  </div>
                </div>
                <div style={{ fontSize:11, color:"var(--text-3)", marginTop:4, marginBottom:10 }}>
                  {[
                    g.event,
                    g.date ? g.date.split(".")[0].replace(/\?/g, "").trim() || g.date : null,
                    g.eco,
                    g.openingName
                  ].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => startFollowMode(g)}
                    style={{
                      flex:1, padding:"6px 0", borderRadius:8, border:"none",
                      background:"var(--glass)", border1:"1px solid var(--glass-border)",
                      color:"var(--text)", cursor:"pointer", fontSize:12, fontWeight:600,
                    }}>
                    ▶ Follow Along
                  </button>
                  <button onClick={() => startGame(g)}
                    style={{
                      flex:1, padding:"6px 0", borderRadius:8, border:"none",
                      background:"var(--accent)", color:"white",
                      cursor:"pointer", fontSize:12, fontWeight:600,
                    }}>
                    ⚔ Challenge Me
                  </button>
                </div>
              </div>
            ))}
            {filtered.length===0 && (
              <div style={{ padding:20, fontSize:13, color:"var(--text-3)", textAlign:"center" }}>
                No games found. Try a different search or import games using the button above.
              </div>
            )}
          </div>
          {visibleCount < filtered.length && (
            <button
              className="btn-glass"
              onClick={() => setVisibleCount(v => v + 50)}
              style={{ width:"100%", padding:"10px 0", fontSize:13, marginTop:8 }}
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>

        {showBundleImport && (
          <BundleImport onClose={() => setShowBundleImport(false)} onImported={loadGames} />
        )}
      </div>
    );
  }

  // ── FOLLOW MODE SCREEN ───────────────────────────────────────────────────
  if (phase === "follow") {
    const followMoveListItems: [string,string?][] = [];
    for (let i=0; i<historicalMoves.length; i+=2) followMoveListItems.push([historicalMoves[i], historicalMoves[i+1]]);
    const currentMoveSan = followIdx > 0 ? historicalMoves[followIdx-1] : null;

    return (
      <div ref={wrapperRef} style={{
        width:"100%", height:"100%", display:"flex",
        alignItems:"center", justifyContent:"center", padding:12, gap:12,
        overflow:"auto", boxSizing:"border-box",
      }}>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8, flexShrink:0, maxHeight:"100%" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>
              {selectedGame?.white} <span style={{ color:"var(--text-3)" }}>vs</span> {selectedGame?.black}
            </div>
            <div style={{ fontSize:11, color:"var(--text-3)" }}>
              {selectedGame?.event} · {selectedGame?.date} {selectedGame?.openingName && `· ${selectedGame.openingName}`}
            </div>
          </div>

          <div className="glass" style={{
            borderRadius:14, overflow:"hidden", padding:6,
            boxShadow:"0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
          }}>
            <Chessboard
              options={{
                position: followGame.fen(),
                boardOrientation: playAs,
                boardStyle: { borderRadius:8, width:size, height:size },
                darkSquareStyle: { backgroundColor:boardTheme.dark },
                lightSquareStyle: { backgroundColor:boardTheme.light },
                allowDragging: false,
              }}
            />
          </div>

          {/* Scrubber */}
          <div style={{ width:size+12 }}>
            <input
              type="range" min={0} max={historicalMoves.length} value={followIdx}
              onChange={e => followGoTo(Number(e.target.value))}
              style={{ width:"100%", accentColor:"var(--accent)" }}
            />
          </div>

          {/* Playback controls */}
          <div style={{ display:"flex", gap:8, width:size+12 }}>
            <button className="btn-glass" onClick={() => followGoTo(0)} style={{ flex:1, padding:"7px 0", fontSize:13 }}>⏮</button>
            <button className="btn-glass" onClick={followPrev} disabled={followIdx===0} style={{ flex:1, padding:"7px 0", fontSize:13, opacity: followIdx===0?0.4:1 }}>◀</button>
            <button className="btn-accent" onClick={toggleFollowAutoplay} style={{ flex:2, padding:"7px 0", fontSize:13 }}>
              {followAutoplay ? "⏸ Pause" : "▶ Autoplay"}
            </button>
            <button className="btn-glass" onClick={followNext} disabled={followIdx>=historicalMoves.length} style={{ flex:1, padding:"7px 0", fontSize:13, opacity: followIdx>=historicalMoves.length?0.4:1 }}>▶</button>
            <button className="btn-glass" onClick={() => followGoTo(historicalMoves.length)} style={{ flex:1, padding:"7px 0", fontSize:13 }}>⏭</button>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width:200, height:size+40, display:"flex", flexDirection:"column", flexShrink:0, gap:8 }}>
          <div className="glass" style={{ borderRadius:10, padding:"10px 12px" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:4 }}>
              MOVE {followIdx} / {historicalMoves.length}
            </div>
            {currentMoveSan && (
              <div style={{ fontSize:20, fontFamily:"DM Mono, monospace", color:"var(--accent)", fontWeight:700 }}>
                {currentMoveSan}
              </div>
            )}
          </div>

          <div className="glass" style={{ flex:1, borderRadius:10, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid var(--glass-border)", fontSize:10, fontWeight:700, color:"var(--text-3)", letterSpacing:1 }}>
              MOVES
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"4px 0" }}>
              {followMoveListItems.map(([white,black],i) => (
                <div key={i} style={{
                  display:"grid", gridTemplateColumns:"24px 1fr 1fr", padding:"3px 8px",
                  background: (i*2 === followIdx-1 || i*2+1 === followIdx-1) ? "var(--accent-dim)" : "transparent",
                }}>
                  <span style={{ fontSize:11, color:"var(--text-3)", fontFamily:"DM Mono, monospace" }}>{i+1}.</span>
                  <span
                    onClick={() => followGoTo(i*2+1)}
                    style={{
                      fontSize:12, fontFamily:"DM Mono, monospace", cursor:"pointer",
                      color: i*2 === followIdx-1 ? "var(--accent)" : "var(--text)",
                      fontWeight: i*2 === followIdx-1 ? 700 : 400,
                    }}>{white}</span>
                  <span
                    onClick={() => black && followGoTo(i*2+2)}
                    style={{
                      fontSize:12, fontFamily:"DM Mono, monospace", cursor: black ? "pointer" : "default",
                      color: i*2+1 === followIdx-1 ? "var(--accent)" : "var(--text-2)",
                      fontWeight: i*2+1 === followIdx-1 ? 700 : 400,
                    }}>{black??""}</span>
                </div>
              ))}
            </div>
          </div>

          <button className="btn-accent" onClick={enterChallengeFromFollow} style={{ fontSize:12, padding:"8px 0" }}>
            ⚔ Now Try It Yourself
          </button>
          <button className="btn-glass" onClick={() => setPhase("browse")} style={{ fontSize:11, padding:"7px 0" }}>
            ← Back to Games
          </button>
        </div>
      </div>
    );
  }

  // ── PLAYING SCREEN ───────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{
      width:"100%", height:"100%", display:"flex",
      alignItems:"center", justifyContent:"center", padding:12, gap:12,
    }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:4, flexShrink:0 }}>
        <div style={{ fontSize:11, color:"var(--text-3)" }}>
          {selectedGame?.white} vs {selectedGame?.black} · {selectedGame?.event}
        </div>
        {deviated && (
          <div style={{
            fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
            background: deviationMode==="punishment" ? "rgba(251,191,36,0.15)" : "rgba(59,158,255,0.15)",
            color: deviationMode==="punishment" ? "var(--warning)" : "var(--accent)",
          }}>
            {deviationMode==="punishment" ? "⚔ Punishment Phase — play it out" : "Off book — engine continues"}
          </div>
        )}

        <div className="glass" style={{
          borderRadius:14, overflow:"hidden", padding:6,
          boxShadow:"0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          <Chessboard
            options={{
              position: game.fen(),
              boardOrientation: playAs,
              boardStyle: { borderRadius:8, width:size, height:size },
              darkSquareStyle: { backgroundColor:boardTheme.dark },
              lightSquareStyle: { backgroundColor:boardTheme.light },
              squareStyles,
              onPieceDrop: onDrop,
              onSquareClick,
              allowDragging: isPlayerTurn() && !isThinking,
              animationDurationInMs: 180,
            }}
          />
        </div>
      </div>

      <div style={{ width:200, height:size+12, display:"flex", flexDirection:"column", flexShrink:0, gap:8 }}>
        <div className="glass" style={{ borderRadius:10, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{
            width:6, height:6, borderRadius:"50%", flexShrink:0,
            background: gameStatus ? "var(--danger)" : isThinking ? "var(--warning)" : "var(--success)",
          }} />
          <span style={{ fontSize:12, color:"var(--text-2)" }}>
            {gameStatus || (isThinking ? "Thinking..." : deviated ? "Free play" : "Find the historical move")}
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
                <span style={{ fontSize:12, fontFamily:"DM Mono, monospace", color: i*2 < moveIdx || deviated ? "var(--text)" : "var(--text-3)" }}>{white}</span>
                <span style={{ fontSize:12, fontFamily:"DM Mono, monospace", color: i*2+1 < moveIdx || deviated ? "var(--text-2)" : "var(--text-3)" }}>{black??""}</span>
              </div>
            ))}
          </div>
        </div>

        <button className="btn-glass" onClick={exitToBrowse} style={{ fontSize:11, padding:"7px 0" }}>
          ← Back to Games
        </button>
      </div>
    </div>
  );
}
