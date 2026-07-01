"use client";
import { useState, useRef } from "react";
import { db } from "@/lib/db";
import { parseMultiGameBundle, classifyBundle, ParsedGame } from "@/lib/import/bundleParser";
import { detectOpening } from "@/lib/openings/detect";

interface BundleImportProps {
  onClose: () => void;
  onImported?: () => void;
}

type Destination = "historical" | "repertoire" | "skip";

export default function BundleImport({ onClose, onImported }: BundleImportProps) {
  const [step, setStep] = useState<"input" | "review" | "importing" | "done">("input");
  const [rawText, setRawText] = useState("");
  const [parsedGames, setParsedGames] = useState<ParsedGame[]>([]);
  const [suggestion, setSuggestion] = useState<"historical" | "opening_theory" | "mixed">("mixed");
  const [destination, setDestination] = useState<Destination>("historical");
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawText(text);
      processBundleText(text);
    };
    reader.readAsText(file);
  }

  function processBundleText(text: string) {
    if (!text.trim()) { setError("No content found"); return; }
    setParsing(true);
    setError("");
    // Use setTimeout to let the UI update before the heavy parsing begins
    setTimeout(() => {
      try {
        const games = parseMultiGameBundle(text);
        if (games.length === 0) {
          setError("Couldn't parse any valid games. Make sure it's standard PGN format.");
          setParsing(false);
          return;
        }
        const classification = classifyBundle(games);
        setParsedGames(games);
        setSuggestion(classification);
        setDestination(classification === "opening_theory" ? "repertoire" : "historical");
        setStep("review");
      } catch (e) {
        setError("Parse failed — file may be corrupted or not valid PGN.");
      }
      setParsing(false);
    }, 50);
  }

  async function confirmImport() {
    setStep("importing");
    let count = 0;
    let skipped = 0;
    setSkippedCount(0);

    if (destination === "historical") {
      // Build a set of existing game fingerprints for fast duplicate detection
      const existing = await db.historicalGames.toArray();
      const existingKeys = new Set(existing.map(g =>
        `${g.white}|${g.black}|${g.date || ""}|${g.result}`.toLowerCase()
      ));

      for (const game of parsedGames) {
        const key = `${game.white}|${game.black}|${game.date || ""}|${game.result}`.toLowerCase();
        if (existingKeys.has(key)) { skipped++; continue; }

        try {
          await db.historicalGames.add({
            pgn: game.pgn,
            white: game.white,
            black: game.black,
            event: game.event,
            date: game.date ? game.date.split(".")[0].replace(/\?/g, "").trim() : "",
            result: game.result,
            eco: game.eco,
            openingName: game.openingName || detectOpening(game.moves) || "",
            tags: [],
            source: "bundle_import",
            addedAt: new Date(),
          });
          existingKeys.add(key); // prevent duplicates within the same import batch
          count++;
        } catch { skipped++; }
      }
    } else if (destination === "repertoire") {
      // Create a single tree from all games, merging shared paths
      const treeId = await db.openingTrees.add({
        name: `Imported Bundle (${new Date().toLocaleDateString()})`,
        color: "white", // user can fix this after import
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as number;

      const nodeMap = new Map<string, number>();

      for (const game of parsedGames) {
        let parentId: number | undefined = undefined;
        for (let i = 0; i < game.moves.length; i++) {
          const pathKey = game.moves.slice(0, i + 1).join(",");
          if (nodeMap.has(pathKey)) {
            parentId = nodeMap.get(pathKey);
            continue;
          }
          const id = await db.openingNodes.add({
            treeId,
            parentId,
            moveSan: game.moves[i],
            fen: "", // could compute but not critical for this path
            moveNumber: i + 1,
            notes: "",
            evalTag: "",
            confidence: "green",
            referenceGameIds: [],
            patternIds: [],
          }) as number;
          nodeMap.set(pathKey, id);
          parentId = id;
        }
        count++;
      }
    }

    setImportedCount(count);
    setSkippedCount(skipped);
    setStep("done");
    onImported?.();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div className="glass" style={{
        width: "100%", maxWidth: 560, maxHeight: "85vh", borderRadius: 18,
        padding: 24, overflow: "auto", boxShadow: "0 0 60px rgba(0,0,0,0.8)",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Bundle Import</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Import multiple games at once — from chessgames.com, Lichess studies, or any PGN collection
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, background: "var(--glass)",
            border: "1px solid var(--glass-border)", color: "var(--text-2)",
            cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {parsing && (
          <div style={{
            position:"absolute", inset:0, borderRadius:18,
            background:"rgba(8,12,20,0.85)", backdropFilter:"blur(4px)",
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, zIndex:10,
          }}>
            <div style={{ fontSize:28 }}>⚙️</div>
            <div style={{ fontSize:14, fontWeight:600, color:"var(--text)" }}>Parsing games...</div>
            <div style={{ fontSize:12, color:"var(--text-3)" }}>This may take a moment for large files</div>
          </div>
        )}

        {step === "input" && (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--glass-border)", borderRadius: 12,
                padding: "32px 20px", textAlign: "center", cursor: "pointer",
                marginBottom: 16, transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>
                Click to upload a .pgn file
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                Or paste multi-game PGN text below
              </div>
              <input
                ref={fileInputRef} type="file" accept=".pgn,.txt"
                onChange={handleFileUpload} style={{ display: "none" }}
              />
            </div>

            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={`[Event "World Championship"]\n[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 ...\n\n[Event "..."]\n...`}
              rows={8}
              style={{
                width: "100%", background: "var(--glass)",
                border: "1px solid var(--glass-border)", borderRadius: 8,
                color: "var(--text)", padding: "10px 12px",
                fontSize: 12, fontFamily: "DM Mono, monospace",
                resize: "vertical", outline: "none", marginBottom: 12,
              }}
            />

            {error && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>{error}</div>
            )}

            <button
              className="btn-accent"
              onClick={() => processBundleText(rawText)}
              disabled={parsing}
              style={{ width: "100%", padding: "10px 0", fontSize: 13, opacity: parsing ? 0.6 : 1 }}
            >
              {parsing ? "Parsing games..." : "Parse Games →"}
            </button>
          </div>
        )}

        {step === "review" && (
          <div>
            <div className="glass" style={{ borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                Found {parsedGames.length} game{parsedGames.length !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
                {suggestion === "historical" && "These look like complete historical games (real players, full games). Suggested: add to Historical Games collection."}
                {suggestion === "opening_theory" && "These look like opening theory lines (shorter games). Suggested: add as a Repertoire tree."}
                {suggestion === "mixed" && "Mixed content detected. Choose where these should go."}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
                IMPORT AS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => setDestination("historical")}
                  style={{
                    padding: "12px", borderRadius: 10, border: "none",
                    background: destination === "historical" ? "var(--accent)" : "var(--glass)",
                    color: destination === "historical" ? "white" : "var(--text)",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>📜 Historical Games</div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>
                    Full games to replay & study
                  </div>
                </button>
                <button
                  onClick={() => setDestination("repertoire")}
                  style={{
                    padding: "12px", borderRadius: 10, border: "none",
                    background: destination === "repertoire" ? "var(--accent)" : "var(--glass)",
                    color: destination === "repertoire" ? "white" : "var(--text)",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>📖 Repertoire Tree</div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>
                    Merge into opening lines
                  </div>
                </button>
              </div>
            </div>

            {/* Preview list */}
            <div className="glass" style={{ borderRadius: 10, overflow: "hidden", marginBottom: 16, maxHeight: 200 }}>
              <div style={{
                padding: "8px 12px", borderBottom: "1px solid var(--glass-border)",
                fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1,
              }}>
                PREVIEW ({Math.min(parsedGames.length, 10)} of {parsedGames.length})
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {parsedGames.slice(0, 10).map((g, i) => (
                  <div key={i} style={{
                    padding: "6px 12px", fontSize: 12,
                    borderBottom: i < 9 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <span style={{ color: "var(--text)" }}>{g.white}</span>
                    <span style={{ color: "var(--text-3)" }}> vs </span>
                    <span style={{ color: "var(--text)" }}>{g.black}</span>
                    {g.event && <span style={{ color: "var(--text-3)" }}> · {g.event}</span>}
                    <span style={{ color: "var(--text-3)" }}> · {g.moves.length} moves</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-glass" onClick={() => setStep("input")} style={{ flex: 1, padding: "9px 0", fontSize: 13 }}>
                ← Back
              </button>
              <button className="btn-accent" onClick={confirmImport} style={{ flex: 2, padding: "9px 0", fontSize: 13 }}>
                Import {parsedGames.length} Game{parsedGames.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 14, color: "var(--text-2)" }}>Importing games...</div>
          </div>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--success)", marginBottom: 6 }}>
              Imported {importedCount} game{importedCount !== 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>
              {destination === "historical"
                ? "Find them in Historical Games"
                : "Find the new tree in your Repertoire Build tab"}
            </div>
            <button className="btn-accent" onClick={onClose} style={{ padding: "9px 24px", fontSize: 13 }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
