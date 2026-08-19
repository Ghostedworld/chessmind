"use client";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { IconSwords, IconTarget, IconChartBar, IconPlayerPlay, IconX, IconCpu } from "@tabler/icons-react";
import { db } from "@/lib/db";
import { runStockfishScan } from "../engine/stockfishScanner";
import dynamic from "next/dynamic";
const PuzzleBoard = dynamic(() => import("./PuzzleBoard"), { ssr: false });

type ScanStatus = "idle" | "scanning" | "done" | "error";
type TacticsTab = "scan" | "solve";

export default function TacticsEngine() {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [tacticsTab, setTacticsTab] = useState<TacticsTab>("scan");
  const [recentOnly, setRecentOnly] = useState(true);
  const [progress, setProgress] = useState({ scanned: 0, total: 0 });
  const [puzzleCount, setPuzzleCount] = useState(0);
  const [gameCount, setGameCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const scanSignalRef = useRef({ cancelled: false });

  useEffect(() => {
    loadCounts();
    return () => workerRef.current?.terminate();
  }, []);

  async function loadCounts() {
    const games = await db.games.count();
    setGameCount(games);
    try {
      const puzzles = await db.table("tacticsPuzzles").count();
      setPuzzleCount(puzzles);
    } catch { setPuzzleCount(0); }
  }

  async function startScan() {
    setStatus("scanning");
    setProgress({ scanned: 0, total: 0 });
    setErrorMsg("");
    scanSignalRef.current = { cancelled: false };

    try {
      await runStockfishScan(
        (scanned, total, found) => {
          setProgress({ scanned, total });
          if (found > 0) setPuzzleCount(found);
        },
        scanSignalRef.current,
        recentOnly
      );
      setStatus("done");
      loadCounts();
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  function stopScan() {
    scanSignalRef.current.cancelled = true;
    setStatus("idle");
  }

  const pct = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;

  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Sub-tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--glass-border)", flexShrink:0,
        background:"rgba(5,5,7,0.6)", backdropFilter:"blur(12px)" }}>
        {([["scan","Scanner"],["solve","Solve Puzzles"]] as [TacticsTab,string][]).map(([id,label]) => (
          <button key={id} onClick={() => setTacticsTab(id)}
            style={{
              padding:"8px 18px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:12, fontWeight:600, letterSpacing:"0.02em", textTransform:"uppercase",
              color: tacticsTab===id ? "var(--text)" : "var(--text-3)",
              borderBottom: tacticsTab===id ? "2px solid var(--accent)" : "2px solid transparent",
            }}>
            {label}
            {id==="solve" && puzzleCount > 0 && (
              <span style={{ marginLeft:6, fontSize:10, padding:"1px 6px", borderRadius:10,
                background:"var(--accent-dim)", color:"var(--accent)" }}>
                {puzzleCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tacticsTab === "solve" && <PuzzleBoard />}
      {tacticsTab === "scan" && <div style={{ flex:1, overflowY:"auto", padding:20 }}>
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        <div style={{ fontSize:18, fontWeight:800, color:"var(--text)", marginBottom:4 }}>
          Tactics Engine
        </div>
        <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:24 }}>
          Scan your real games for missed captures and blunders. Build a personal puzzle bank.
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:24 }}>
          {[
            { label:"Games Available", value: gameCount.toLocaleString(), icon:<IconChartBar size={18}/> },
            { label:"Puzzles Generated", value: puzzleCount.toLocaleString(), icon:<IconTarget size={18}/> },
            { label:"Ready to Solve", value: puzzleCount > 0 ? puzzleCount.toLocaleString() : "0", icon:<IconSwords size={18}/> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="glass" style={{ borderRadius:12, padding:"12px 14px" }}>
              <div style={{ color:"var(--text-3)", marginBottom:6 }}>{icon}</div>
              <div style={{ fontSize:20, fontWeight:700, color:"var(--text)", marginBottom:2 }}>{value}</div>
              <div style={{ fontSize:10, color:"var(--text-3)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Scan card */}
        <div className="glass" style={{ borderRadius:14, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:8 }}>
            Blunder Scanner
          </div>
          <div style={{ fontSize:12, color:"var(--text-3)", marginBottom:16, lineHeight:1.6 }}>
            Runs in a background worker — UI stays responsive. Detects missed captures
            and hanging pieces from your real games. Duplicates are skipped automatically.
          </div>

          {status === "scanning" && (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-3)", marginBottom:6 }}>
                <span>Game {progress.scanned} of {progress.total} — {puzzleCount} puzzles found</span>
                <span style={{ color:"var(--accent)", fontWeight:600 }}>{pct}%</span>
              </div>
              <div style={{ height:6, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                <div style={{
                  height:"100%", background:"var(--accent)", borderRadius:3,
                  width:`${pct}%`, transition:"width 0.3s",
                }} />
              </div>
            </div>
          )}

          {status === "done" && (
            <div style={{ marginBottom:16, padding:"10px 12px", borderRadius:8,
              background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.3)" }}>
              <div style={{ fontSize:12, color:"var(--success)", fontWeight:600 }}>
                ✓ Scan complete — {puzzleCount} puzzles in your bank
              </div>
            </div>
          )}

          {status === "error" && (
            <div style={{ marginBottom:16, padding:"10px 12px", borderRadius:8,
              background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.3)" }}>
              <div style={{ fontSize:12, color:"var(--danger)", fontWeight:600 }}>
                Error: {errorMsg}
              </div>
            </div>
          )}

          {/* Recent vs Full toggle */}
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            {([["recent","Last 100 games (~90s)"],["full","All games (~8-12 min)"]] as const).map(([id,label]) => (
              <button key={id}
                onClick={() => setRecentOnly(id === "recent")}
                style={{
                  flex:1, padding:"6px 0", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:11, fontWeight:600,
                  background: (recentOnly ? id==="recent" : id==="full") ? "var(--accent)" : "var(--glass)",
                  color: (recentOnly ? id==="recent" : id==="full") ? "white" : "var(--text-3)",
                }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={startScan} disabled={status === "scanning"}
              style={{
                flex:1, padding:"10px 0", borderRadius:10, border:"none",
                background: status === "scanning" ? "rgba(56,139,253,0.3)" : "var(--accent)",
                color:"white", fontSize:13, fontWeight:700,
                cursor: status === "scanning" ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}>
              <IconPlayerPlay size={16} />
              {status === "scanning" ? `Scanning... ${pct}%` : status === "done" ? "Re-scan" : "Start Scan"}
            </button>
            {status === "scanning" && (
              <button onClick={stopScan}
                style={{
                  padding:"10px 14px", borderRadius:10, border:"1px solid var(--glass-border)",
                  background:"var(--glass)", color:"var(--danger)", cursor:"pointer", fontSize:13,
                  display:"flex", alignItems:"center", gap:6,
                }}>
                <IconX size={14} /> Stop
              </button>
            )}
          </div>
        </div>

        {/* Puzzle board — coming after scan */}
        <div className="glass" style={{ borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:4 }}>
            {puzzleCount > 0 ? `${puzzleCount} Puzzles Ready` : "Puzzle Training Board"}
          </div>
          <div style={{ fontSize:12, color:"var(--text-3)" }}>
            {puzzleCount > 0
              ? "Switch to the Solve tab to start training with your personal puzzles."
              : "Run a scan first to generate your personal puzzle bank from your real games."}
          </div>
          {puzzleCount > 0 && (
            <button onClick={() => setTacticsTab("solve")}
              style={{ marginTop:12, padding:"8px 16px", borderRadius:8, border:"none",
                background:"var(--accent)", color:"white", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Go to Puzzles →
            </button>
          )}
        </div>
      </div>
    </div>}
    </div>
  );
}
