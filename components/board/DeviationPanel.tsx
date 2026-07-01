"use client";
import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { analyseDeviation, DeviationResult } from "@/lib/chess/deviation";

interface DeviationPanelProps {
  pgn: string;
  playerColor: "white" | "black";
  onClose: () => void;
}

export default function DeviationPanel({ pgn, playerColor, onClose }: DeviationPanelProps) {
  const [results, setResults] = useState<DeviationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<DeviationResult | null>(null);

  async function analyse() {
    setLoading(true);
    try {
      const res = await analyseDeviation(pgn, playerColor);
      setResults(res);
      if (res.length > 0) setSelectedResult(res[0]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const boardSize = 220;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div className="glass" style={{
        width: 560, maxWidth: "95vw", maxHeight: "90vh",
        borderRadius: 18, padding: 24, overflow: "auto",
        boxShadow: "0 0 60px rgba(0,0,0,0.8)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
              Deviation Analysis
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Compare this game against your repertoire trees
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "var(--glass)", border: "1px solid var(--glass-border)",
              color: "var(--text-2)", cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Analyse button */}
        {!results && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20, lineHeight: 1.6 }}>
              This will check your game moves against all your{" "}
              <span style={{ color: "var(--accent)" }}>{playerColor}</span> repertoire trees
              and show you where you first went off-book.
            </div>
            <button
              className="btn-accent"
              onClick={analyse}
              disabled={loading}
              style={{ padding: "10px 28px", fontSize: 14 }}
            >
              {loading ? "Analysing..." : "Analyse Game"}
            </button>
          </div>
        )}

        {/* Results */}
        {results && results.length === 0 && (
          <div style={{
            textAlign: "center", padding: "20px 0",
            fontSize: 13, color: "var(--text-2)",
          }}>
            No {playerColor} repertoire trees found. Create one in the Repertoire tab first.
          </div>
        )}

        {results && results.length > 0 && (
          <div>
            {/* Tree selector if multiple */}
            {results.length > 1 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {results.map(r => (
                  <button
                    key={r.treeId}
                    onClick={() => setSelectedResult(r)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, border: "none",
                      background: selectedResult?.treeId === r.treeId
                        ? "var(--accent)" : "var(--glass)",
                      color: selectedResult?.treeId === r.treeId
                        ? "white" : "var(--text-2)",
                      cursor: "pointer", fontSize: 12, fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                  >
                    {r.treeName}
                  </button>
                ))}
              </div>
            )}

            {selectedResult && (
              <div>
                {/* Coverage bar */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 12, color: "var(--text-2)", marginBottom: 6,
                  }}>
                    <span>Prep coverage — <b>{selectedResult.treeName}</b></span>
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {selectedResult.coveredMoves}/{selectedResult.totalMoves} moves
                    </span>
                  </div>
                  <div style={{
                    height: 6, borderRadius: 3,
                    background: "rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: selectedResult.totalMoves > 0
                        ? `${(selectedResult.coveredMoves / selectedResult.totalMoves) * 100}%`
                        : "0%",
                      background: selectedResult.deviationMove === null
                        ? "var(--success)"
                        : selectedResult.coveredMoves > selectedResult.totalMoves / 2
                          ? "var(--warning)" : "var(--danger)",
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>

                {/* Result card */}
                {selectedResult.opponentLeftBook ? (
                  <div style={{
                    padding: 20, borderRadius: 12,
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🤔</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--warning)" }}>
                      Opponent left your book first
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>
                      On move {Math.ceil((selectedResult.opponentLeftBookMove ?? 0) / 2)}, your opponent played a move outside your repertoire tree. You can't deviate from prep that no longer applies — nothing to evaluate here, but consider adding this opponent response to your tree.
                    </div>
                  </div>
                ) : selectedResult.deviationMove === null ? (
                  <div style={{
                    padding: 20, borderRadius: 12,
                    background: "rgba(52,211,153,0.08)",
                    border: "1px solid rgba(52,211,153,0.2)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#34D399" }}>
                      Stayed in book the entire game!
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>
                      All {selectedResult.coveredMoves} of your moves matched your repertoire.
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Deviation info */}
                    <div style={{
                      padding: 16, borderRadius: 12, marginBottom: 16,
                      background: "rgba(248,113,113,0.08)",
                      border: "1px solid rgba(248,113,113,0.2)",
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: "var(--danger)",
                        letterSpacing: 0.5, marginBottom: 10,
                      }}>
                        DEVIATION ON MOVE {Math.ceil(selectedResult.deviationMove / 2)}
                        {playerColor === "black" ? "..." : "."}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div style={{
                          padding: "10px 14px", borderRadius: 8,
                          background: "rgba(248,113,113,0.1)",
                        }}>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>
                            YOU PLAYED
                          </div>
                          <div style={{
                            fontSize: 20, fontFamily: "DM Mono, monospace",
                            color: "var(--danger)", fontWeight: 700,
                          }}>
                            {selectedResult.playerMoveSan}
                          </div>
                        </div>
                        <div style={{
                          padding: "10px 14px", borderRadius: 8,
                          background: "rgba(52,211,153,0.1)",
                        }}>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>
                            BOOK MOVE{selectedResult.bookMoveOptions.length > 1 ? "S" : ""}
                          </div>
                          <div style={{
                            fontSize: 20, fontFamily: "DM Mono, monospace",
                            color: "#34D399", fontWeight: 700,
                          }}>
                            {selectedResult.bookMoveOptions.join(" / ")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Position at deviation */}
                    {selectedResult.deviationFen && (
                      <div>
                        <div style={{
                          fontSize: 11, color: "var(--text-3)", fontWeight: 700,
                          letterSpacing: 1, marginBottom: 8,
                        }}>
                          POSITION AT DEVIATION
                        </div>
                        <div style={{
                          display: "flex", justifyContent: "center",
                        }}>
                          <div className="glass" style={{
                            borderRadius: 12, overflow: "hidden", padding: 5,
                            boxShadow: "0 0 20px rgba(0,0,0,0.4)",
                          }}>
                            <Chessboard
                              options={{
                                position: selectedResult.deviationFen,
                                boardOrientation: playerColor,
                                boardStyle: {
                                  borderRadius: 6,
                                  width: boardSize,
                                  height: boardSize,
                                },
                                darkSquareStyle: { backgroundColor: "#1e3a5f" },
                                lightSquareStyle: { backgroundColor: "#4a7eb5" },
                                allowDragging: false,
                              }}
                            />
                          </div>
                        </div>
                        <div style={{
                          textAlign: "center", marginTop: 10,
                          fontSize: 12, color: "var(--text-2)",
                        }}>
                          Go to the Repertoire tab to add{" "}
                          <span style={{
                            fontFamily: "DM Mono, monospace",
                            color: "var(--accent)",
                          }}>
                            {selectedResult.playerMoveSan}
                          </span>{" "}
                          as an alternative line.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Analyse again */}
                <div style={{ textAlign: "center", marginTop: 20 }}>
                  <button
                    className="btn-glass"
                    onClick={() => { setResults(null); setSelectedResult(null); }}
                    style={{ fontSize: 12, padding: "7px 18px" }}
                  >
                    ← Analyse Again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
