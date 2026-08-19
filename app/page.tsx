"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  IconChessKnight,
  IconBook2,
  IconSwords,
  IconChartBar,
  IconSettings,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import { saveGame, fixMoveNumbers, db } from "@/lib/db";
import { stopAllEngines } from "@/lib/engine/workerPool";

const ChessBoard         = dynamic(() => import("@/components/board/ChessBoard"),           { ssr: false });
const RepertoirePage     = dynamic(() => import("@/app/repertoire/page"),                   { ssr: false });
const FacingOpenings     = dynamic(() => import("@/components/board/FacingOpenings"),       { ssr: false });
const HistoricalReplayer = dynamic(() => import("@/components/board/HistoricalReplayer"),   { ssr: false });
const GambitLab      = dynamic(() => import("@/features/gambit-lab/components/GambitLab"),       { ssr: false });
const TacticsEngine  = dynamic(() => import("@/features/tactics/components/TacticsEngine"),    { ssr: false });
const PlatformSync       = dynamic(() => import("@/components/sync/PlatformSync"),          { ssr: false });

type Tab = "play" | "openings" | "train" | "stats" | "settings";
type TrainSub = "facing" | "historical" | "tactics" | "gambit";

function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  const set = useCallback((v: T) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /**/ }
  }, [key]);
  return [value, set] as const;
}

const BOARD_THEMES = [
  { id: "classic",  label: "Classic",  dark: "#b58863", light: "#f0d9b5" },
  { id: "ocean",    label: "Ocean",    dark: "#1e3a5f", light: "#4a7eb5" },
  { id: "midnight", label: "Midnight", dark: "#1a1a2e", light: "#16213e" },
  { id: "forest",   label: "Forest",   dark: "#2d5016", light: "#8bc34a" },
  { id: "rose",     label: "Rose",     dark: "#8b2252", light: "#f48fb1" },
  { id: "slate",    label: "Slate",    dark: "#37474f", light: "#90a4ae" },
  { id: "walnut",   label: "Walnut",   dark: "#5d4037", light: "#bcaaa4" },
  { id: "neon",     label: "Neon",     dark: "#0d1b2a", light: "#00b4d8" },
];

const NAV = [
  { id: "play",     label: "Play",     Icon: IconChessKnight },
  { id: "openings", label: "Openings", Icon: IconBook2       },
  { id: "train",    label: "Train",    Icon: IconSwords      },
  { id: "stats",    label: "Stats",    Icon: IconChartBar    },
  { id: "settings", label: "Settings", Icon: IconSettings    },
] as const;

export default function Home() {
  const [mounted, setMounted]         = useState(false);
  const [tab, setTab]                 = usePersistedState<Tab>("tab", "play");
  const [trainSub, setTrainSub]       = usePersistedState<TrainSub>("trainSub", "facing");
  const [playerColor, setPlayerColor] = usePersistedState<"white"|"black">("playerColor", "white");
  const [engineElo, setEngineElo]     = usePersistedState<number>("engineElo", 1200);
  const [showMoveHistory, setShowMoveHistory] = usePersistedState<boolean>("showMoveHistory", true);
  const [boardThemeId, setBoardThemeId]       = usePersistedState<string>("boardThemeId", "ocean");
  const [deviationProbability, setDeviationProbability] = usePersistedState<number>("deviationProbability", 100);
  const [activeTreeId, setActiveTreeId] = usePersistedState<number|null>("activeTreeId", null);
  const [availableTrees, setAvailableTrees] = useState<{id:number;name:string;color:string}[]>([]);
  const [showBoardSettings, setShowBoardSettings] = useState(false);

  const boardTheme = BOARD_THEMES.find(t => t.id === boardThemeId) ?? BOARD_THEMES[1];

  useEffect(() => {
    setMounted(true);
    fixMoveNumbers();
  }, []);

  useEffect(() => {
    const opponentColor = playerColor === "white" ? "black" : "white";
    db.openingTrees.filter(t => t.color === opponentColor).toArray().then(trees => {
      setAvailableTrees(trees.map(t => ({ id: t.id!, name: t.name, color: t.color })));
      if (trees.length > 0 && (!activeTreeId || !trees.find(t => t.id === activeTreeId))) {
        setActiveTreeId(trees[0].id!);
      } else if (trees.length === 0) {
        setActiveTreeId(null);
      }
    });
  }, [playerColor]);

  async function handleGameOver(result: string, pgn: string) {
    if (!pgn) return;
    await saveGame({ pgn, result, playerColor, engineElo, playedAt: new Date(), source: "simulator" });
  }

  function switchTab(t: Tab) {
    if (t !== "play") stopAllEngines();
    setTab(t);
  }

  if (!mounted) return null;

  return (
    <div style={{ width:"100vw", height:"100dvh", display:"flex", flexDirection:"column", background:"var(--bg)", overflow:"hidden" }}>

      {/* ── TOP BAR (non-play tabs only) ── */}
      {tab !== "play" && (
        <div style={{
          height: 48, flexShrink: 0,
          background: "rgba(10,10,11,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", padding: "0 16px", gap: 10,
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="10" height="10" fill="var(--accent)" rx="1"/>
            <rect x="10" width="10" height="10" fill="var(--text-3)" rx="1"/>
            <rect y="10" width="10" height="10" fill="var(--text-3)" rx="1"/>
            <rect x="10" y="10" width="10" height="10" fill="var(--accent)" rx="1"/>
          </svg>
          <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>ChessMind</span>
          <span style={{ fontSize:12, color:"var(--text-3)" }}>
            / {NAV.find(n => n.id === tab)?.label}
          </span>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>

        {/* PLAY */}
        {tab === "play" && (
          <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column" }}>
            {/* Board top bar */}
            <div style={{
              height: 44, flexShrink: 0,
              display: "flex", alignItems: "center", padding: "0 12px", gap: 8,
              background: "rgba(5,5,7,0.95)",
              backdropFilter: "blur(20px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <button
                onClick={() => setPlayerColor(playerColor === "white" ? "black" : "white")}
                style={{
                  padding: "4px 12px", borderRadius: 8,
                  border: "1px solid var(--glass-border)",
                  background: "var(--glass)", color: "var(--text-2)",
                  cursor: "pointer", fontSize: 12, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span>{playerColor === "white" ? "♙" : "♟"}</span>
                {playerColor === "white" ? "White" : "Black"}
              </button>

              <div style={{
                padding: "4px 10px", borderRadius: 8,
                background: "var(--glass)", border: "1px solid var(--glass-border)",
                fontSize: 11, color: "var(--text-3)",
              }}>
                {engineElo} Elo
              </div>

              <div style={{ marginLeft:"auto" }}>
                <button
                  onClick={() => setShowBoardSettings(v => !v)}
                  style={{
                    height: 32, padding: "0 10px", borderRadius: 8,
                    background: showBoardSettings ? "var(--accent-dim)" : "var(--glass)",
                    border: `1px solid ${showBoardSettings ? "rgba(56,139,253,0.3)" : "var(--glass-border)"}`,
                    color: showBoardSettings ? "var(--accent)" : "var(--text-2)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5, fontSize: 11,
                  }}
                >
                  <IconAdjustmentsHorizontal size={14} />
                  Settings
                </button>
              </div>
            </div>

            {/* Board settings dropdown */}
            {showBoardSettings && (
              <div style={{
                position: "absolute", top: 50, right: 12, zIndex: 50,
                background: "rgba(13,13,15,0.98)", backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
                padding: 16, width: 240,
              }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:12 }}>
                  ENGINE
                </div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:"var(--text-3)", marginBottom:6 }}>Strength</div>
                  <select
                    value={engineElo}
                    onChange={e => setEngineElo(Number(e.target.value))}
                    style={{
                      width:"100%", background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.08)", borderRadius:8,
                      color:"var(--text)", padding:"6px 10px", fontSize:13,
                    }}
                  >
                    {[800,1000,1200,1400,1600,1800,2000,2500,3000].map(e => (
                      <option key={e} value={e} style={{ background:"#0D0D0F" }}>{e} Elo</option>
                    ))}
                  </select>
                </div>

                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:12 }}>
                  BOOK SETTINGS
                </div>

                {availableTrees.length > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"var(--text-3)", marginBottom:6 }}>Active Repertoire</div>
                    <select
                      value={activeTreeId ?? ""}
                      onChange={e => setActiveTreeId(Number(e.target.value))}
                      style={{
                        width:"100%", background:"rgba(255,255,255,0.05)",
                        border:"1px solid rgba(255,255,255,0.08)", borderRadius:8,
                        color:"var(--text)", padding:"6px 10px", fontSize:13,
                      }}
                    >
                      {availableTrees.map(t => (
                        <option key={t.id} value={t.id} style={{ background:"#0D0D0F" }}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-3)", marginBottom:6 }}>
                    <span>Deviation</span>
                    <span style={{ color:"var(--accent)" }}>
                      {deviationProbability === 0 ? "Book only" : deviationProbability === 100 ? "Engine only" : `${deviationProbability}% engine`}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={10}
                    value={deviationProbability}
                    onChange={e => setDeviationProbability(Number(e.target.value))}
                    style={{ width:"100%", accentColor:"var(--accent)" }}
                  />
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--text-3)", marginTop:2 }}>
                    <span>Always book</span>
                    <span>Always engine</span>
                  </div>
                </div>

                <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:12, color:"var(--text-2)", cursor:"pointer" }}>
                  Show move list
                  <input
                    type="checkbox" checked={showMoveHistory}
                    onChange={e => setShowMoveHistory(e.target.checked)}
                    style={{ accentColor:"var(--accent)" }}
                  />
                </label>
              </div>
            )}

            {/* Board */}
            <div
              style={{
                flex:1, overflow:"hidden",
                backgroundImage: "radial-gradient(ellipse at center, rgba(56,139,253,0.04) 0%, transparent 65%)",
              }}
              onClick={() => setShowBoardSettings(false)}
            >
              <ChessBoard
                key={playerColor}
                engineElo={engineElo}
                playerColor={playerColor}
                showMoveHistory={showMoveHistory}
                boardTheme={boardTheme}
                deviationProbability={deviationProbability}
                activeTreeId={activeTreeId}
                onMoveMade={() => {}}
                onGameOver={(result, pgn) => handleGameOver(result, pgn ?? "")}
              />
            </div>
          </div>
        )}

        {/* OPENINGS */}
        {tab === "openings" && <RepertoirePage boardTheme={boardTheme} />}

        {/* TRAIN */}
        {tab === "train" && (
          <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column" }}>
            <div style={{
              display:"flex", flexShrink:0,
              borderBottom:"1px solid rgba(255,255,255,0.06)",
              background:"rgba(5,5,7,0.8)", backdropFilter:"blur(16px)",
            }}>
              {([
                { id:"facing",     label:"Facing Openings" },
                { id:"historical", label:"Historical Games" },
                { id:"tactics",    label:"Tactics"         },
                { id:"gambit",     label:"Gambit Lab"      },
              ] as const).map(s => (
                <button
                  key={s.id}
                  onClick={() => setTrainSub(s.id)}
                  style={{
                    padding:"10px 20px", border:"none", cursor:"pointer",
                    background:"transparent", fontSize:12, fontWeight:600,
                    letterSpacing:"0.02em", textTransform:"uppercase",
                    color: trainSub === s.id ? "var(--text)" : "var(--text-3)",
                    borderBottom: trainSub === s.id ? "2px solid var(--accent)" : "2px solid transparent",
                    transition:"all 0.15s",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflow:"hidden" }}>
              {trainSub === "facing" && (
                <FacingOpenings boardTheme={boardTheme} onGameOver={(result, pgn) => handleGameOver(result, pgn)} />
              )}
              {trainSub === "historical" && (
                <HistoricalReplayer boardTheme={boardTheme} />
              )}
              {trainSub === "tactics" && (
                <TacticsEngine />
              )}
              {trainSub === "gambit" && (
                <GambitLab boardTheme={boardTheme} />
              )}
            </div>
          </div>
        )}

        {/* STATS */}
        {tab === "stats" && (
          <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8, color:"var(--text-3)" }}>
            <IconChartBar size={32} opacity={0.3} />
            <div style={{ fontSize:14 }}>Stats Dashboard — Phase 4</div>
            <div style={{ fontSize:12, opacity:0.6 }}>Coming soon</div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ height:"100%", overflowY:"auto", padding:20 }}>
            <div style={{ maxWidth:480, margin:"0 auto" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--text)", marginBottom:20 }}>Settings</div>

              <PlatformSync />

              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:8 }}>ENGINE</div>
                <div className="glass" style={{ borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:12, color:"var(--text-2)", marginBottom:6 }}>Default Strength</div>
                  <select
                    value={engineElo}
                    onChange={e => setEngineElo(Number(e.target.value))}
                    style={{
                      width:"100%", background:"rgba(255,255,255,0.05)",
                      border:"1px solid rgba(255,255,255,0.08)", borderRadius:8,
                      color:"var(--text)", padding:"8px 12px", fontSize:13,
                    }}
                  >
                    {[800,1000,1200,1400,1600,1800,2000,2500,3000].map(e => (
                      <option key={e} value={e} style={{ background:"#0D0D0F" }}>{e} Elo</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"var(--text-3)", letterSpacing:1, marginBottom:8 }}>BOARD THEME</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {BOARD_THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setBoardThemeId(t.id)}
                      style={{
                        display:"flex", alignItems:"center", gap:8,
                        padding:"8px 12px", borderRadius:10, border:"none",
                        background: boardThemeId === t.id ? "var(--accent-dim)" : "var(--glass)",
                        cursor:"pointer",
                      }}
                    >
                      <div style={{
                        width:24, height:24, borderRadius:5, flexShrink:0,
                        background:`linear-gradient(135deg, ${t.dark} 50%, ${t.light} 50%)`,
                      }} />
                      <span style={{ fontSize:13, color: boardThemeId === t.id ? "var(--accent)" : "var(--text-2)" }}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{
        height: 56, flexShrink: 0,
        background: "rgba(10,10,11,0.95)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px)",
        display: "flex", alignItems: "stretch",
      }}>
        {NAV.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => switchTab(id as Tab)}
              style={{
                flex:1, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                gap:3, border:"none", background:"transparent",
                cursor:"pointer", position:"relative", padding:0,
              }}
            >
              {active && (
                <div style={{
                  position:"absolute", top:0, left:"50%",
                  transform:"translateX(-50%)",
                  width:28, height:2,
                  background:"var(--accent)",
                  borderRadius:"0 0 2px 2px",
                }} />
              )}
              <Icon size={20} stroke={1.5} color={active ? "var(--accent)" : "var(--text-3)"} />
              <span style={{
                fontSize:9, fontWeight: active ? 600 : 400,
                color: active ? "var(--accent)" : "var(--text-3)",
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
