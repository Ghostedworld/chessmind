"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
const Chessboard = dynamic(() => import("react-chessboard").then(m => ({ default: m.Chessboard })), { ssr: false });
import { Chess } from "chess.js";
import { LIBRARY_OPENINGS, CATEGORIES, LibraryOpening, LibraryVariation } from "@/lib/openings/data";
import { db } from "@/lib/db";

interface OpeningLibraryProps {
  boardTheme?: { dark: string; light: string };
  onClose: () => void;
  onImported?: () => void;
  refreshTrigger?: number;
}

export default function OpeningLibrary({
  boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" },
  onClose,
  onImported,
  refreshTrigger = 0,
}: OpeningLibraryProps) {
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState<"all" | "white" | "black">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LibraryOpening | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<LibraryVariation | null>(null);
  const [previewFen, setPreviewFen] = useState<string>("start");
  const [previewMove, setPreviewMove] = useState(0);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [boardSize, setBoardSize] = useState(280);
  const rightRef = useRef<HTMLDivElement>(null);

  const refreshImported = () => {
    db.openingTrees.toArray().then(trees => {
      const ids = new Set(trees.map(t => t.name));
      setImported(ids);
    });
  };

  useEffect(() => {
    refreshImported();
  }, [refreshTrigger]);

  useEffect(() => {
    const update = () => {
      if (!rightRef.current) return;
      const { width, height } = rightRef.current.getBoundingClientRect();
      const s = Math.max(Math.min(width - 32, height * 0.45), 200);
      setBoardSize(s);
    };
    update();
    const ro = new ResizeObserver(update);
    if (rightRef.current) ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    setSelectedVariation(selected.variations[0]);
    setPreviewMove(selected.trunk.length);
  }, [selected]);

  useEffect(() => {
    if (!selectedVariation) return;
    const moves = selectedVariation.moves.slice(0, previewMove);
    const g = new Chess();
    moves.forEach(m => { try { g.move(m); } catch { /**/ } });
    setPreviewFen(g.fen());
  }, [selectedVariation, previewMove]);

  const filtered = LIBRARY_OPENINGS.filter(o => {
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.eco.toLowerCase().includes(search.toLowerCase());
    const matchColor = colorFilter === "all" || o.color === colorFilter || o.color === "both";
    const matchCat = categoryFilter === "all" || o.category === categoryFilter;
    return matchSearch && matchColor && matchCat;
  });

  async function importOpening(opening: LibraryOpening) {
    setImporting(true);
    try {
      // Determine color — if "both" default to asking, for now use white
      const color = opening.color === "both" ? "white" : opening.color;

      // Create tree
      const treeId = await db.openingTrees.add({
        name: opening.name,
        color,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as number;

      // Build node map — key: move sequence string -> node id
      const nodeMap = new Map<string, number>();

      for (const variation of opening.variations) {
        let parentId: number | undefined = undefined;
        const g = new Chess();

        for (let i = 0; i < variation.moves.length; i++) {
          const moveSan = variation.moves[i];
          const pathKey = variation.moves.slice(0, i + 1).join(",");

          // Check if node already exists (shared trunk)
          if (nodeMap.has(pathKey)) {
            parentId = nodeMap.get(pathKey);
            try { g.move(moveSan); } catch { break; }
            continue;
          }

          try {
            const move = g.move(moveSan);
            if (!move) break;

            // First move that differs between variations = branch point
            const isBranchPoint = i === opening.trunk.length &&
              opening.variations.length > 1;

            const id = await db.openingNodes.add({
              treeId,
              parentId,
              moveSan: move.san,
              fen: g.fen(),
              moveNumber: g.history().length,
              notes: "",
              evalTag: "",
              confidence: "green",
              variationName: isBranchPoint ? variation.name : undefined,
              referenceGameIds: [],
              patternIds: [],
            }) as number;

            nodeMap.set(pathKey, id);
            parentId = id;
          } catch { break; }
        }
      }

      onImported?.();
      refreshImported();
    } catch (e) {
      console.error(e);
      alert("Import failed");
    }
    setImporting(false);
  }

  const maxPreviewMove = selectedVariation?.moves.length ?? 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div className="glass" style={{
        width: "100%", maxWidth: 900, height: "90vh",
        borderRadius: 18, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 0 60px rgba(0,0,0,0.8)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", flexShrink: 0,
          borderBottom: "1px solid var(--glass-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
              Opening Library
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {LIBRARY_OPENINGS.length} openings · Click to preview · Add to your repertoire
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

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left — opening list */}
          <div style={{
            width: 300, flexShrink: 0,
            borderRight: "1px solid var(--glass-border)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Filters */}
            <div style={{ padding: "12px 12px 8px", flexShrink: 0 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search openings..."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--glass-border)", borderRadius: 8,
                  color: "var(--text)", padding: "7px 10px",
                  fontSize: 13, fontFamily: "DM Sans, sans-serif",
                  outline: "none", marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(["all", "white", "black"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setColorFilter(c)}
                    style={{
                      padding: "3px 10px", borderRadius: 20, border: "none",
                      background: colorFilter === c ? "var(--accent)" : "var(--glass)",
                      color: colorFilter === c ? "white" : "var(--text-2)",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {c === "all" ? "All" : c === "white" ? "♙ White" : "♟ Black"}
                  </button>
                ))}
              </div>
            </div>

            {/* Opening list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
              {filtered.length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: "var(--text-3)" }}>
                  No openings match your search.
                </div>
              )}
              {CATEGORIES.filter(cat =>
                categoryFilter === "all" || cat === categoryFilter
              ).map(cat => {
                const catOpenings = filtered.filter(o => o.category === cat);
                if (catOpenings.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                      letterSpacing: 1, padding: "6px 8px 4px",
                    }}>
                      {cat.toUpperCase()}
                    </div>
                    {catOpenings.map(opening => (
                      <button
                        key={opening.id}
                        onClick={() => setSelected(opening)}
                        style={{
                          width: "100%", padding: "9px 10px",
                          borderRadius: 8, border: "none",
                          background: selected?.id === opening.id ? "var(--accent-dim)" : "transparent",
                          borderLeft: selected?.id === opening.id
                            ? "2px solid var(--accent)" : "2px solid transparent",
                          cursor: "pointer", textAlign: "left",
                          transition: "all 0.15s", marginBottom: 2,
                        }}
                      >
                        <div style={{
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between",
                        }}>
                          <span style={{
                            fontSize: 13, fontWeight: 500,
                            color: selected?.id === opening.id ? "var(--accent)" : "var(--text)",
                          }}>
                            {opening.name}
                          </span>
                          {imported.has(opening.name) && (
                            <span style={{
                              fontSize: 10, color: "var(--success)",
                              background: "rgba(52,211,153,0.1)",
                              padding: "1px 6px", borderRadius: 10,
                            }}>✓ Added</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 11, color: "var(--text-3)", marginTop: 2,
                          display: "flex", gap: 8,
                        }}>
                          <span>{opening.eco}</span>
                          <span>{opening.variations.length} variations</span>
                          <span>{opening.color === "white" ? "♙" : opening.color === "black" ? "♟" : "♙♟"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — preview */}
          <div ref={rightRef} style={{
            flex: 1, overflow: "auto", padding: "20px 20px",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            {!selected ? (
              <div style={{
                flex: 1, display: "flex", alignItems: "center",
                justifyContent: "center", flexDirection: "column", gap: 12,
                color: "var(--text-3)",
              }}>
                <div style={{ fontSize: 32 }}>📖</div>
                <div style={{ fontSize: 14 }}>Select an opening to preview</div>
              </div>
            ) : (
              <>
                {/* Opening info */}
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                        {selected.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                        ECO {selected.eco} · {selected.category} · {selected.variations.length} variations
                      </div>
                    </div>
                    <button
                      className={imported.has(selected.name) ? "btn-glass" : "btn-accent"}
                      onClick={() => !imported.has(selected.name) && importOpening(selected)}
                      disabled={importing || imported.has(selected.name)}
                      style={{
                        padding: "8px 18px", fontSize: 13, flexShrink: 0,
                        opacity: importing ? 0.6 : 1,
                        cursor: imported.has(selected.name) ? "default" : "pointer",
                      }}
                    >
                      {importing ? "Adding..." : imported.has(selected.name) ? "✓ In Repertoire" : "+ Add to Repertoire"}
                    </button>
                  </div>
                  <div style={{
                    fontSize: 13, color: "var(--text-2)", marginTop: 10, lineHeight: 1.6,
                  }}>
                    {selected.description}
                  </div>
                </div>

                {/* Variation selector */}
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                    letterSpacing: 1, marginBottom: 8,
                  }}>
                    VARIATIONS
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selected.variations.map(v => (
                      <button
                        key={v.name}
                        onClick={() => {
                          setSelectedVariation(v);
                          setPreviewMove(v.moves.length);
                        }}
                        style={{
                          padding: "5px 12px", borderRadius: 20, border: "none",
                          background: selectedVariation?.name === v.name
                            ? "var(--accent)" : "var(--glass)",
                          color: selectedVariation?.name === v.name
                            ? "white" : "var(--text-2)",
                          fontSize: 12, fontWeight: 500, cursor: "pointer",
                          transition: "all 0.15s",
                          backdropFilter: "blur(12px)",
                        }}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Board + moves */}
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  {/* Board */}
                  <div>
                    <div className="glass" style={{
                      borderRadius: 12, overflow: "hidden", padding: 5,
                      boxShadow: "0 0 20px rgba(0,0,0,0.4)",
                    }}>
                      <Chessboard
                        options={{
                          position: previewFen,
                          boardOrientation: selected.color === "black" ? "black" : "white",
                          boardStyle: { borderRadius: 6, width: boardSize, height: boardSize },
                          darkSquareStyle: { backgroundColor: boardTheme.dark },
                          lightSquareStyle: { backgroundColor: boardTheme.light },
                          allowDragging: false,
                        }}
                      />
                    </div>
                    {/* Move scrubber */}
                    <div style={{ marginTop: 8, width: boardSize }}>
                      <input
                        type="range"
                        min={0}
                        max={maxPreviewMove}
                        value={previewMove}
                        onChange={e => setPreviewMove(Number(e.target.value))}
                        style={{ width: "100%", accentColor: "var(--accent)" }}
                      />
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        fontSize: 11, color: "var(--text-3)", marginTop: 2,
                      }}>
                        <span>Start</span>
                        <span>Move {Math.ceil(previewMove / 2)}</span>
                        <span>End</span>
                      </div>
                    </div>
                  </div>

                  {/* Move list */}
                  {selectedVariation && (
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                        letterSpacing: 1, marginBottom: 8,
                      }}>
                        MOVES
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                        {selectedVariation.moves.map((m, i) => (
                          <span
                            key={i}
                            onClick={() => setPreviewMove(i + 1)}
                            style={{
                              fontSize: 13, fontFamily: "DM Mono, monospace",
                              padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                              background: i + 1 === previewMove ? "var(--accent-dim)" : "transparent",
                              color: i + 1 <= previewMove ? "var(--text)" : "var(--text-3)",
                              transition: "all 0.1s",
                            }}
                          >
                            {i % 2 === 0 && (
                              <span style={{ color: "var(--text-3)", marginRight: 2, fontSize: 11 }}>
                                {Math.floor(i / 2) + 1}.
                              </span>
                            )}
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
