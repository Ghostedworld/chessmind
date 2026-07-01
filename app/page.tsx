"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePersistedState } from "@/lib/hooks/useSettings";
import { saveGame, fixMoveNumbers, db } from "@/lib/db";

const PlatformSync = dynamic(() => import("@/components/sync/PlatformSync"), { ssr: false });
const ChessBoard = dynamic(() => import("@/components/board/ChessBoard"), {
  ssr: false,
  loading: () => (
    <div style={{ color: "var(--text-2)", fontSize: 14 }}>Loading board...</div>
  ),
});

const RepertoireBuilder = dynamic(() => import("@/components/board/RepertoireBoard"), {
  ssr: false,
  loading: () => (
    <div style={{ color: "var(--text-2)", fontSize: 14 }}>Loading repertoire...</div>
  ),
});

const FacingOpenings = dynamic(() => import("@/components/board/FacingOpenings"), {
  ssr: false,
  loading: () => <div style={{ color: "var(--text-2)", fontSize: 14 }}>Loading...</div>,
});

const HistoricalReplayer = dynamic(() => import("@/components/board/HistoricalReplayer"), {
  ssr: false,
  loading: () => <div style={{ color: "var(--text-2)", fontSize: 14 }}>Loading...</div>,
});

const RepertoirePage = dynamic(() => import("@/app/repertoire/page"), {
  ssr: false,
  loading: () => (
    <div style={{ color: "var(--text-2)", fontSize: 14 }}>Loading...</div>
  ),
});

const BOARD_THEMES = [
  { name: "Ocean", dark: "#1e3a5f", light: "#4a7eb5" },
  { name: "Forest", dark: "#2d4a22", light: "#6b9e52" },
  { name: "Classic", dark: "#b58863", light: "#f0d9b5" },
  { name: "Midnight", dark: "#1a1a2e", light: "#4a4a8a" },
  { name: "Rose", dark: "#7b3f5e", light: "#d4a0b5" },
  { name: "Slate", dark: "#2c3e50", light: "#7f8c8d" },
  { name: "Coral", dark: "#8b3a3a", light: "#e8a598" },
  { name: "Sage", dark: "#3a5a4a", light: "#a8c5b0" },
];

const NAV_ITEMS = [
  { id: "board", label: "Board", icon: "♟" },
  { id: "repertoire", label: "Repertoire", icon: "📖" },
  { id: "facing", label: "Facing Openings", icon: "🎯" },
  { id: "historical", label: "Historical Games", icon: "📜" },
  { id: "tactics", label: "Tactics", icon: "⚡" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none",
        background: value ? "var(--accent)" : "rgba(255,255,255,0.1)",
        position: "relative", cursor: "pointer", transition: "background 0.2s",
        flexShrink: 0, boxShadow: value ? "0 0 12px var(--accent-glow)" : "none",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: "white",
        position: "absolute", top: 3, left: value ? 21 : 3,
        transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

function SettingRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 0", borderBottom: "1px solid var(--glass-border)",
    }}>
      <div>
        <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("activeTab") || "board";
    }
    return "board";
  });

  const setActiveTabPersisted = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem("activeTab", tab);
  };
  const [navOpen, setNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Persisted settings
  const [engineElo, setEngineElo] = usePersistedState("engineElo", 1200);
  const [playerColor, setPlayerColor] = usePersistedState<"white" | "black">("playerColor", "white");
  const [deviationProbability, setDeviationProbability] = usePersistedState("deviationProbability", 100);
  const [activeTreeId, setActiveTreeId] = usePersistedState<number | null>("activeTreeId", null);
  const [availableTrees, setAvailableTrees] = useState<{id:number; name:string; color:string}[]>([]);
  const [showMoveHistory, setShowMoveHistory] = usePersistedState("showMoveHistory", true);
  const [boardThemeName, setBoardThemeName] = usePersistedState("boardTheme", "Ocean");

  const boardTheme = BOARD_THEMES.find(t => t.name === boardThemeName) ?? BOARD_THEMES[0];

  useEffect(() => {
    setMounted(true);
    fixMoveNumbers();
  }, []);

  useEffect(() => {
    const opponentColor = playerColor === "white" ? "black" : "white";
    db.openingTrees.filter(t => t.color === opponentColor).toArray().then(trees => {
      setAvailableTrees(trees.map(t => ({ id: t.id!, name: t.name, color: t.color })));
      // Auto-select first tree if none selected or current selection invalid
      if (trees.length > 0 && (!activeTreeId || !trees.find(t => t.id === activeTreeId))) {
        setActiveTreeId(trees[0].id!);
      } else if (trees.length === 0) {
        setActiveTreeId(null);
      }
    });
  }, [playerColor]);

  async function handleGameOver(result: string, pgn: string) {
    await saveGame({
      pgn,
      result,
      playerColor,
      engineElo,
      playedAt: new Date(),
    });
  }

  const activeItem = NAV_ITEMS.find(n => n.id === activeTab);

  if (!mounted) return null;

  return (
    <div style={{
      height: "100dvh", width: "100dvw",
      background: "var(--bg)", position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Glow orbs */}
      <div style={{
        position: "fixed", top: -200, left: -200, width: 600, height: 600,
        background: "radial-gradient(circle, rgba(59,158,255,0.08) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "fixed", bottom: -200, right: -200, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(52,211,153,0.05) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", flexShrink: 0, position: "relative", zIndex: 20,
        borderBottom: "1px solid var(--glass-border)",
        background: "rgba(8,12,20,0.8)", backdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>♚</span>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>
            Chess<span style={{ color: "var(--accent)" }}>Mind</span>
          </span>
          {activeItem && (
            <>
              <span style={{ color: "var(--text-3)", fontSize: 14, marginLeft: 4 }}>/</span>
              <span style={{ color: "var(--text-2)", fontSize: 14 }}>{activeItem.label}</span>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {activeTab === "board" && (
            <>
              <select
                value={engineElo}
                onChange={e => setEngineElo(Number(e.target.value))}
                style={{
                  background: "var(--glass)", border: "1px solid var(--glass-border)",
                  borderRadius: 8, color: "var(--text)", padding: "4px 8px",
                  fontSize: 12, fontFamily: "DM Sans, sans-serif", cursor: "pointer",
                }}
              >
                {[800, 1000, 1200, 1400, 1600, 1800, 2000, 2500].map(e => (
                  <option key={e} value={e} style={{ background: "#0D1420" }}>{e}</option>
                ))}
              </select>
              <button
                className="btn-glass"
                style={{ padding: "4px 12px", fontSize: 12 }}
                onClick={() => setPlayerColor(playerColor === "white" ? "black" : "white")}
              >
                {playerColor === "white" ? "♙ White" : "♟ Black"}
              </button>
              {availableTrees.length > 0 && (
                <select
                  value={activeTreeId ?? ""}
                  onChange={e => setActiveTreeId(Number(e.target.value))}
                  style={{
                    background: "var(--glass)", border: "1px solid var(--glass-border)",
                    borderRadius: 8, color: "var(--text)", padding: "4px 8px",
                    fontSize: 11, fontFamily: "DM Sans, sans-serif", cursor: "pointer",
                    maxWidth: 130,
                  }}
                  title="Which repertoire to use for book moves"
                >
                  {availableTrees.map(t => (
                    <option key={t.id} value={t.id} style={{ background: "#0D1420" }}>
                      📖 {t.name}
                    </option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  {deviationProbability === 0 ? "Book" : deviationProbability === 100 ? "Engine" : `${deviationProbability}%`}
                </span>
                <input
                  type="range" min={0} max={100} step={10}
                  value={deviationProbability}
                  onChange={e => setDeviationProbability(Number(e.target.value))}
                  style={{ width: 70, accentColor: "var(--accent)", cursor: "pointer" }}
                  title={`Deviation: ${deviationProbability}% — 0% always follows your book, 100% pure engine`}
                />
              </div>
            </>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setNavOpen(o => !o)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: navOpen ? "var(--accent-dim)" : "var(--glass)",
              border: `1px solid ${navOpen ? "rgba(59,158,255,0.3)" : "var(--glass-border)"}`,
              cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              transition: "all 0.2s",
            }}
          >
            {navOpen ? (
              <span style={{ fontSize: 16, color: "var(--accent)", lineHeight: 1 }}>✕</span>
            ) : (
              <>
                <div style={{ width: 16, height: 1.5, background: "var(--text-2)", borderRadius: 2 }} />
                <div style={{ width: 16, height: 1.5, background: "var(--text-2)", borderRadius: 2 }} />
                <div style={{ width: 16, height: 1.5, background: "var(--text-2)", borderRadius: 2 }} />
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", zIndex: 1 }}>

        {/* Backdrop */}
        {navOpen && (
          <div
            onClick={() => setNavOpen(false)}
            style={{
              position: "absolute", inset: 0, zIndex: 30,
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
            }}
          />
        )}

        {/* Side nav */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 240, zIndex: 40,
          transform: navOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          background: "rgba(8,12,20,0.95)", backdropFilter: "blur(24px)",
          borderRight: "1px solid var(--glass-border)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "20px 12px", flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, padding: "0 8px", marginBottom: 8 }}>
              NAVIGATION
            </div>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTabPersisted(item.id); setNavOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 12px", borderRadius: 10, border: "none",
                  background: activeTab === item.id ? "var(--accent-dim)" : "transparent",
                  cursor: "pointer", marginBottom: 2, transition: "all 0.15s",
                  borderLeft: activeTab === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{
                  fontSize: 14, fontWeight: activeTab === item.id ? 600 : 400,
                  color: activeTab === item.id ? "var(--accent)" : "var(--text-2)",
                }}>
                  {item.label}
                </span>
                {activeTab === item.id && (
                  <div style={{
                    marginLeft: "auto", width: 6, height: 6, borderRadius: "50%",
                    background: "var(--accent)", boxShadow: "0 0 6px var(--accent)",
                  }} />
                )}
              </button>
            ))}
          </div>
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--glass-border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>ChessMind · Phase 1</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>1170 → 2000 🎯</div>
          </div>
        </div>

        {/* Content */}
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>

          {activeTab === "board" && (
            <ChessBoard
              engineElo={engineElo}
              playerColor={playerColor}
              showMoveHistory={showMoveHistory}
              boardTheme={boardTheme}
              deviationProbability={deviationProbability}
              activeTreeId={activeTreeId}
              onMoveMade={(move, fen, pgn) => {}}
              onGameOver={(result, pgn) => handleGameOver(result, pgn ?? "")}
            />
          )}

          {activeTab === "repertoire" && (
            <div style={{ width: "100%", height: "100%" }}>
              <RepertoirePage boardTheme={boardTheme} />
            </div>
          )}
          {activeTab === "facing" && (
            <div style={{ width: "100%", height: "100%" }}>
              <FacingOpenings boardTheme={boardTheme} onGameOver={(result, pgn, opening) => handleGameOver(result, pgn)} />
            </div>
          )}
          {activeTab === "historical" && (
            <div style={{ width: "100%", height: "100%" }}>
              <HistoricalReplayer boardTheme={boardTheme} />
            </div>
          )}
          {activeTab === "tactics" && (
            <div style={{ color: "var(--text-2)", fontSize: 15 }}>Tactics engine — Phase 3</div>
          )}
          {activeTab === "stats" && (
            <div style={{ color: "var(--text-2)", fontSize: 15 }}>Stats — Phase 4</div>
          )}

          {activeTab === "settings" && (
            <div style={{
              width: "100%", maxWidth: 480, height: "100%",
              overflowY: "auto", padding: "24px 16px 40px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
                BOARD
              </div>
              <div className="glass" style={{ borderRadius: 14, padding: "0 16px", marginBottom: 24 }}>
                <SettingRow label="Move History" description="Show move list beside the board">
                  <Toggle value={showMoveHistory} onChange={setShowMoveHistory} />
                </SettingRow>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
                BOARD THEME
              </div>
              <div className="glass" style={{ borderRadius: 14, padding: 16, marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                  {BOARD_THEMES.map(theme => (
                    <button
                      key={theme.name}
                      onClick={() => setBoardThemeName(theme.name)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 6, background: "none", border: "none", cursor: "pointer",
                      }}
                    >
                      <div style={{
                        width: 52, height: 52, borderRadius: 8, overflow: "hidden",
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        border: boardThemeName === theme.name
                          ? "2px solid var(--accent)"
                          : "2px solid rgba(255,255,255,0.08)",
                        boxShadow: boardThemeName === theme.name ? "0 0 12px var(--accent-glow)" : "none",
                        transition: "all 0.2s",
                      }}>
                        <div style={{ background: theme.light }} />
                        <div style={{ background: theme.dark }} />
                        <div style={{ background: theme.dark }} />
                        <div style={{ background: theme.light }} />
                      </div>
                      <span style={{
                        fontSize: 11,
                        color: boardThemeName === theme.name ? "var(--accent)" : "var(--text-3)",
                        fontWeight: boardThemeName === theme.name ? 600 : 400,
                      }}>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <PlatformSync />

              <div style={{ marginTop: 24, fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
                ENGINE
              </div>
              <div className="glass" style={{ borderRadius: 14, padding: "0 16px" }}>
                <SettingRow label="Engine Strength" description="Opponent difficulty level">
                  <select
                    value={engineElo}
                    onChange={e => setEngineElo(Number(e.target.value))}
                    style={{
                      background: "var(--glass)", border: "1px solid var(--glass-border)",
                      borderRadius: 8, color: "var(--text)", padding: "6px 10px",
                      fontSize: 13, fontFamily: "DM Sans, sans-serif", cursor: "pointer",
                    }}
                  >
                    {[800, 1000, 1200, 1400, 1600, 1800, 2000, 2500].map(e => (
                      <option key={e} value={e} style={{ background: "#0D1420" }}>{e}</option>
                    ))}
                  </select>
                </SettingRow>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
