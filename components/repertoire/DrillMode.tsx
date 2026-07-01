"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { db, OpeningTree, OpeningNode } from "@/lib/db";

interface DrillModeProps {
  boardTheme?: { dark: string; light: string };
  onExit: () => void;
}

interface DrillLine {
  nodes: OpeningNode[];
  treeName: string;
  treeColor: "white" | "black";
}

interface DrillResult {
  node: OpeningNode;
  firstTry: boolean;
  skipped: boolean;
}

type DrillState = "idle" | "drilling" | "feedback_wrong" | "feedback_correct" | "complete";

function ScoreBadge({ pts }: { pts: number }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "var(--accent-dim)", border: "1px solid rgba(59,158,255,0.3)",
      borderRadius: 100, padding: "3px 12px",
      fontSize: 13, fontWeight: 700, color: "var(--accent)",
    }}>
      {pts} pts
    </div>
  );
}

export default function DrillMode({ boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" }, onExit }: DrillModeProps) {
  const [trees, setTrees] = useState<OpeningTree[]>([]);
  const [hasDrillData, setHasDrillData] = useState(false);
  const [extractedLineCount, setExtractedLineCount] = useState(0);
  const [selectedTree, setSelectedTree] = useState<OpeningTree | null>(null);
  const [drillMode, setDrillMode] = useState<"all" | "random" | "weakest" | "variation">("all");
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [availableVariations, setAvailableVariations] = useState<string[]>([]);
  const [lines, setLines] = useState<DrillLine[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [currentNodeIdx, setCurrentNodeIdx] = useState(0);
  const [game, setGame] = useState(new Chess());
  const [size, setSize] = useState(400);
  const [drillState, setDrillState] = useState<DrillState>("idle");
  const [results, setResults] = useState<DrillResult[]>([]);
  const [score, setScore] = useState(0);
  const [wrongMove, setWrongMove] = useState<string | null>(null);
  const [correctMove, setCorrectMove] = useState<string | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [attemptedWrong, setAttemptedWrong] = useState(false);
  const [totalMoves, setTotalMoves] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      const s = Math.max(Math.min(height - 160, width * 0.55 - 20), 240);
      setSize(s);
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { loadTrees(); }, []);

  useEffect(() => {
    if (!selectedTree?.id) { setHasDrillData(false); setExtractedLineCount(0); setAvailableVariations([]); return; }
    db.openingNodes
      .where("treeId").equals(selectedTree.id)
      .filter(n => (n.drillScore ?? 0) > 0)
      .count()
      .then(count => setHasDrillData(count > 0));
    extractLines(selectedTree.id, selectedTree.color, selectedTree.name)
      .then(lines => {
        setExtractedLineCount(lines.length);
        // Collect variation names from both variationName field AND notes field (legacy)
        db.openingNodes
          .where("treeId").equals(selectedTree.id!)
          .toArray()
          .then(nodes => {
            const names = [...new Set(
              nodes
                .filter(n => !!(n as any).variationName || !!(n.notes && n.notes.trim()))
                .map(n => ((n as any).variationName || n.notes) as string)
                .filter(Boolean)
            )];
            setAvailableVariations(names);
          });
      });
  }, [selectedTree]);

  async function loadTrees() {
    const all = await db.openingTrees.orderBy("createdAt").reverse().toArray();
    setTrees(all);
  }

  // Extract all lines from a tree as flat arrays of nodes
  async function extractLines(treeId: number, treeColor: "white" | "black", treeName: string): Promise<DrillLine[]> {
    const nodes = await db.openingNodes.where("treeId").equals(treeId).toArray();
    if (nodes.length === 0) return [];

    const childMap = new Map<number | undefined, OpeningNode[]>();
    nodes.forEach(n => {
      const key = n.parentId;
      if (!childMap.has(key)) childMap.set(key, []);
      childMap.get(key)!.push(n);
    });

    const lines: DrillLine[] = [];

    function traverse(parentId: number | undefined, path: OpeningNode[]) {
      const children = childMap.get(parentId) || [];
      if (children.length === 0) {
        if (path.length > 0) lines.push({ nodes: [...path], treeName, treeColor });
        return;
      }
      for (const child of children) {
        traverse(child.id, [...path, child]);
      }
    }

    traverse(undefined, []);
    return lines;
  }

  function isPlayerMove(line: DrillLine, nodeIdx: number): boolean {
    const node = line.nodes[nodeIdx];
    if (!node) return false;
    return (
      (line.treeColor === "white" && node.moveNumber % 2 === 1) ||
      (line.treeColor === "black" && node.moveNumber % 2 === 0)
    );
  }

  function buildGameUpToNode(line: DrillLine, upToIdx: number): Chess {
    const g = new Chess();
    for (let i = 0; i < upToIdx && i < line.nodes.length; i++) {
      try { g.move(line.nodes[i].moveSan); } catch { break; }
    }
    return g;
  }

  function findFirstPlayerNodeIdx(line: DrillLine): number {
    for (let i = 0; i < line.nodes.length; i++) {
      if (isPlayerMove(line, i)) return i;
    }
    return -1;
  }

  async function startDrill() {
    if (!selectedTree?.id) return;

    const extracted = await extractLines(selectedTree.id, selectedTree.color, selectedTree.name);
    if (extracted.length === 0) {
      alert("This repertoire has no lines yet. Add some moves in the Build tab first.");
      return;
    }

    let finalLines = [...extracted];
    if (drillMode === "variation" && selectedVariation) {
      // Filter lines that contain the selected variation name
      const nodes = await db.openingNodes
        .where("treeId").equals(selectedTree.id!)
        .filter(n => (n as any).variationName === selectedVariation || n.notes === selectedVariation)
        .toArray();
      const variationNodeIds = new Set(nodes.map(n => n.id));
      finalLines = extracted.filter(line =>
        line.nodes.some(n => variationNodeIds.has(n.id))
      );
      if (finalLines.length === 0) finalLines = extracted;
    } else if (drillMode === "random") {
      const randomIdx = Math.floor(Math.random() * extracted.length);
      finalLines = [extracted[randomIdx]];
    } else if (drillMode === "weakest") {
      // Find lines that have been drilled (have at least one node with drillScore > 0)
      const drilledLines = extracted.filter(l =>
        l.nodes.some(n => (n.drillScore ?? 0) > 0)
      );
      if (drilledLines.length === 0) {
        // Fallback — just pick the line with most nodes (hardest)
        finalLines = [...extracted].sort((a, b) => b.nodes.length - a.nodes.length);
      } else {
        // Sort drilled lines by average score ascending (weakest first)
        finalLines = drilledLines.sort((a, b) => {
          const scoreA = a.nodes.reduce((s, n) => s + (n.drillScore || 0), 0) / a.nodes.length;
          const scoreB = b.nodes.reduce((s, n) => s + (n.drillScore || 0), 0) / b.nodes.length;
          return scoreA - scoreB;
        });
      }
    }

    const total = finalLines.reduce((sum, line) =>
      sum + line.nodes.filter((_, i) => isPlayerMove(line, i)).length, 0);

    // Find first player move index in first line
    const firstLine = finalLines[0];
    const firstPlayerIdx = findFirstPlayerNodeIdx(firstLine);

    if (firstPlayerIdx === -1) {
      alert("No player moves found in this repertoire. Make sure the color matches your moves.");
      return;
    }

    // Build game state up to first player move (opponent moves already played)
    const g = buildGameUpToNode(firstLine, firstPlayerIdx);

    setLines(finalLines);
    setTotalMoves(total);
    setCurrentLineIdx(0);
    setCurrentNodeIdx(firstPlayerIdx);
    setResults([]);
    setScore(0);
    setWrongMove(null);
    setCorrectMove(null);
    setUsedHint(false);
    setShowHint(false);
    setAttemptedWrong(false);
    setGame(g);
    setLastMove(
      firstPlayerIdx > 0
        ? null
        : null
    );
    setSelectedSquare(null);
    setPossibleMoves([]);
    setDrillState("drilling");
  }

  function getCurrentExpectedMove(): string | null {
    if (!lines[currentLineIdx]) return null;
    const line = lines[currentLineIdx];
    const node = line.nodes[currentNodeIdx];
    if (!node) return null;
    return node.moveSan;
  }

  function isPlayerTurn(): boolean {
    if (!lines[currentLineIdx]) return false;
    const line = lines[currentLineIdx];
    const g = gameRef.current;
    return (
      (line.treeColor === "white" && g.turn() === "w") ||
      (line.treeColor === "black" && g.turn() === "b")
    );
  }

  async function handlePlayerMove(san: string, from: string, to: string) {
    const expected = getCurrentExpectedMove();
    if (!expected) return;

    // Normalize move comparison - just compare SAN
    const normalizedSan = san.replace(/[+#?!]/g, "");
    const normalizedExpected = expected.replace(/[+#?!]/g, "");

    if (normalizedSan === normalizedExpected || san === expected) {
      // Correct — apply move visually first
      const line = lines[currentLineIdx];
      const nodeIdx = currentNodeIdx;
      const g = buildGameUpToNode(line, nodeIdx + 1);

      const pts = usedHint ? 1 : attemptedWrong ? 1 : 3;
      setScore(prev => prev + pts);
      setResults(prev => [...prev, {
        node: line.nodes[nodeIdx],
        firstTry: !usedHint && !attemptedWrong,
        skipped: false,
      }]);

      // Update drill score in DB
      const node = line.nodes[nodeIdx];
      if (node.id) {
        const newScore = Math.min((node.drillScore || 0) + (usedHint ? 0.5 : 1), 10);
        await db.openingNodes.update(node.id, { drillScore: newScore });
      }

      setGame(g);
      setLastMove({ from, to });
      setSelectedSquare(null);
      setPossibleMoves([]);
      setUsedHint(false);
      setShowHint(false);
      setAttemptedWrong(false);
      setWrongMove(null);
      setCorrectMove(null);
      setDrillState("feedback_correct");

      setTimeout(() => advanceToNext(g, nodeIdx + 1), 800);
    } else {
      // Wrong — don't move piece, just show feedback
      setWrongMove(san);
      setCorrectMove(expected);
      setAttemptedWrong(true);
      setDrillState("feedback_wrong");
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  async function advanceToNext(currentGame: Chess, nextNodeIdx: number) {
    const line = lines[currentLineIdx];
    if (!line) return;

    // Find next player move index
    let idx = nextNodeIdx;
    while (idx < line.nodes.length && !isPlayerMove(line, idx)) {
      idx++;
    }

    if (idx >= line.nodes.length) {
      // Line complete
      const nextLineIdx = currentLineIdx + 1;
      if (nextLineIdx >= lines.length) {
        setDrillState("complete");
        return;
      }
      // Move to next line
      const nextLine = lines[nextLineIdx];
      const firstPlayerIdx = findFirstPlayerNodeIdx(nextLine);
      if (firstPlayerIdx === -1) {
        setDrillState("complete");
        return;
      }
      const freshGame = buildGameUpToNode(nextLine, firstPlayerIdx);
      setCurrentLineIdx(nextLineIdx);
      setCurrentNodeIdx(firstPlayerIdx);
      setGame(freshGame);
      setLastMove(null);
      setDrillState("drilling");
    } else {
      // Play opponent moves between last player move and next player move
      // Build game up to this idx (all moves up to here already committed)
      const g = buildGameUpToNode(line, idx);
      // Show last opponent move
      if (idx > nextNodeIdx) {
        const lastOpponentNode = line.nodes[idx - 1];
        const prevGame = buildGameUpToNode(line, idx - 1);
        try {
          const move = prevGame.move(lastOpponentNode.moveSan);
          if (move) setLastMove({ from: move.from, to: move.to });
        } catch { /**/ }
      }
      setGame(g);
      setCurrentNodeIdx(idx);
      setDrillState("drilling");
    }
  }

  function onSquareClick({ square }: { square: string; piece?: unknown }) {
    if (drillState !== "drilling" || !isPlayerTurn()) return;
    const current = gameRef.current;

    if (selectedSquare && selectedSquare !== square) {
      const gameCopy = new Chess(current.fen());
      try {
        const move = gameCopy.move({ from: selectedSquare, to: square, promotion: "q" });
        if (move) { handlePlayerMove(move.san, move.from, move.to); return; }
      } catch { /**/ }
    }

    const moves = current.moves({ square: square as any, verbose: true });
    if ((moves as any[]).length > 0) {
      setSelectedSquare(square);
      setPossibleMoves((moves as any[]).map((m: any) => m.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  function onDrop({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string }) {
    if (drillState !== "drilling" || !isPlayerTurn()) return false;
    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      const expected = getCurrentExpectedMove();
      const normalizedSan = move.san.replace(/[+#?!]/g, "");
      const normalizedExpected = (expected || "").replace(/[+#?!]/g, "");
      const isCorrect = normalizedSan === normalizedExpected || move.san === expected;
      handlePlayerMove(move.san, move.from, move.to);
      // Only snap back if wrong — return false to prevent board from showing the move
      return isCorrect;
    } catch { return false; }
  }

  function tryAgain() {
    setDrillState("drilling");
    setWrongMove(null);
    setCorrectMove(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function skipMove() {
    const expected = getCurrentExpectedMove();
    if (!expected) return;
    setResults(prev => [...prev, {
      node: lines[currentLineIdx].nodes[currentNodeIdx],
      firstTry: false,
      skipped: true,
    }]);
    const gameCopy = new Chess(gameRef.current.fen());
    try {
      const move = gameCopy.move(expected);
      if (move) {
        setGame(gameCopy);
        setLastMove({ from: move.from, to: move.to });
        setDrillState("feedback_correct");
        setTimeout(() => advanceToNext(gameCopy, currentNodeIdx + 1), 600);
      }
    } catch { /**/ }
    setWrongMove(null);
    setCorrectMove(null);
  }

  // Square styles
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(59,158,255,0.2)" };
    squareStyles[lastMove.to] = { backgroundColor: "rgba(59,158,255,0.35)" };
  }
  if (drillState === "feedback_correct" && lastMove) {
    squareStyles[lastMove.to] = { backgroundColor: "rgba(52,211,153,0.45)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: "rgba(59,158,255,0.5)" };
  }
  possibleMoves.forEach(sq => {
    squareStyles[sq] = { background: "radial-gradient(circle, rgba(59,158,255,0.65) 28%, transparent 30%)" };
  });

  const currentLine = lines[currentLineIdx];
  const firstTryCount = results.filter(r => r.firstTry).length;
  const totalDrilled = results.length;
  const accuracy = totalDrilled > 0 ? Math.round((firstTryCount / totalDrilled) * 100) : 0;

  // ── IDLE SCREEN ───────────────────────────────────────────────────────────
  if (drillState === "idle") return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
          Repertoire Drill
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 32, lineHeight: 1.6 }}>
          Practice your lines until they're automatic. The engine plays your opponent's moves exactly from your tree — you find your response.
        </div>

        {/* Tree selector */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
            SELECT REPERTOIRE
          </div>
          {trees.length === 0 ? (
            <div className="glass" style={{ borderRadius: 12, padding: 16, fontSize: 13, color: "var(--text-3)" }}>
              No repertoires yet. Build one in the Build tab first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {trees.map(tree => (
                <button
                  key={tree.id}
                  onClick={() => setSelectedTree(tree)}
                  style={{
                    padding: "12px 16px", borderRadius: 10, border: "none",
                    background: selectedTree?.id === tree.id ? "var(--accent-dim)" : "var(--glass)",
                    borderLeft: selectedTree?.id === tree.id ? "3px solid var(--accent)" : "3px solid transparent",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: selectedTree?.id === tree.id ? "var(--accent)" : "var(--text)",
                  }}>
                    {tree.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {tree.color === "white" ? "♙ White" : "♟ Black"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drill mode */}
        {selectedTree && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
              DRILL MODE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {([
                { id: "all", label: "All Lines", desc: "Every line in order", disabled: false },
                { id: "random", label: "Random", desc: "One random line", disabled: false },
                { id: "weakest", label: "Weakest",
                  desc: extractedLineCount < 2 ? "Need 2+ variations" : !hasDrillData ? "Drill once first" : "Lines you miss most",
                  disabled: extractedLineCount < 2 || !hasDrillData },
                { id: "variation", label: "By Variation",
                  desc: availableVariations.length === 0 ? "Name branches first" : `${availableVariations.length} named`,
                  disabled: availableVariations.length === 0 },
              ] as const).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => !mode.disabled && setDrillMode(mode.id)}
                  title={mode.disabled ? "Complete at least one drill session first" : ""}
                  style={{
                    padding: "10px 8px", borderRadius: 10, border: "none",
                    background: drillMode === mode.id ? "var(--accent)" : "var(--glass)",
                    cursor: mode.disabled ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    backdropFilter: "blur(12px)",
                    opacity: mode.disabled ? 0.4 : 1,
                  }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: drillMode === mode.id ? "white" : "var(--text)",
                  }}>
                    {mode.label}
                  </div>
                  <div style={{
                    fontSize: 10, marginTop: 2,
                    color: drillMode === mode.id ? "rgba(255,255,255,0.7)" : "var(--text-3)",
                  }}>
                    {mode.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {drillMode === "variation" && availableVariations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
              SELECT VARIATION
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {availableVariations.map(v => (
                <button
                  key={v}
                  onClick={() => setSelectedVariation(v)}
                  style={{
                    padding: "8px 12px", borderRadius: 8, border: "none",
                    background: selectedVariation === v ? "var(--accent)" : "var(--glass)",
                    color: selectedVariation === v ? "white" : "var(--text-2)",
                    cursor: "pointer", textAlign: "left", fontSize: 13,
                    fontWeight: selectedVariation === v ? 600 : 400,
                    transition: "all 0.15s", backdropFilter: "blur(12px)",
                  }}
                >
                  ⑂ {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-glass" onClick={onExit} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
            ← Back
          </button>
          {selectedTree && (
            <button
              className="btn-accent"
              onClick={startDrill}
              disabled={drillMode === "variation" && !selectedVariation}
              style={{
                flex: 2, padding: "10px 0", fontSize: 13,
                opacity: drillMode === "variation" && !selectedVariation ? 0.4 : 1,
              }}
            >
              Start Drill →
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── COMPLETE SCREEN ───────────────────────────────────────────────────────
  if (drillState === "complete") return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {accuracy >= 80 ? "🎯" : accuracy >= 50 ? "📈" : "💪"}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
          Drill Complete!
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 28 }}>
          {selectedTree?.name}
        </div>

        {/* Score cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Score", value: score, unit: "pts" },
            { label: "Accuracy", value: accuracy, unit: "%" },
            { label: "First Try", value: firstTryCount, unit: `/ ${totalDrilled}` },
          ].map(({ label, value, unit }) => (
            <div key={label} className="glass" style={{
              padding: "14px 8px", borderRadius: 12, textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>
                {value}<span style={{ fontSize: 13, color: "var(--text-3)" }}>{unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Move breakdown */}
        <div className="glass" style={{ borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{
            padding: "8px 14px", borderBottom: "1px solid var(--glass-border)",
            fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1,
          }}>
            MOVE BREAKDOWN
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 14px",
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}>
                <span style={{ fontSize: 13, fontFamily: "DM Mono, monospace", color: "var(--text)" }}>
                  {Math.ceil(r.node.moveNumber / 2)}{r.node.moveNumber % 2 === 1 ? "." : "..."} {r.node.moveSan}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: r.skipped ? "var(--danger)" : r.firstTry ? "var(--success)" : "var(--warning)",
                }}>
                  {r.skipped ? "Skipped" : r.firstTry ? "✓ +3" : "~ +1"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-glass" onClick={onExit} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
            ← Exit
          </button>
          <button className="btn-accent" onClick={() => setDrillState("idle")} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
            Drill Again
          </button>
        </div>
      </div>
    </div>
  );

  // ── DRILLING SCREEN ───────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 16, padding: 12,
    }}>
      {/* Board column */}
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        {/* Prompt */}
        <div style={{
          width: size + 12, padding: "10px 14px",
          borderRadius: 10, textAlign: "center",
          background: drillState === "feedback_wrong"
            ? "rgba(248,113,113,0.12)"
            : drillState === "feedback_correct"
              ? "rgba(52,211,153,0.12)"
              : "var(--glass)",
          border: `1px solid ${drillState === "feedback_wrong"
            ? "rgba(248,113,113,0.3)"
            : drillState === "feedback_correct"
              ? "rgba(52,211,153,0.3)"
              : "var(--glass-border)"}`,
          backdropFilter: "blur(12px)",
          transition: "all 0.3s",
        }}>
          {drillState === "feedback_wrong" && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>
                ✗ Wrong — correct move was{" "}
                <span style={{ fontFamily: "DM Mono, monospace" }}>{correctMove}</span>
              </div>
              {showHint && (
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                  Try playing <span style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{correctMove}</span> on the board
                </div>
              )}
            </div>
          )}
          {drillState === "feedback_correct" && (
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)" }}>
              ✓ Correct! {usedHint ? "+1" : "+3"}
            </div>
          )}
          {drillState === "drilling" && (
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>
              {isPlayerTurn()
                ? `Find your move as ${currentLine?.treeColor}`
                : "Opponent moving..."}
            </div>
          )}
        </div>

        {/* Board */}
        <div className="glass" style={{
          borderRadius: 14, overflow: "hidden", padding: 6,
          boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          <Chessboard
            options={{
              position: game.fen(),
              boardOrientation: currentLine?.treeColor ?? "white",
              boardStyle: { borderRadius: 8, width: size, height: size },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              squareStyles,
              onPieceDrop: onDrop,
              onSquareClick,
              allowDragging: drillState === "drilling" && isPlayerTurn(),
              animationDurationInMs: 200,
            }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, width: size + 12 }}>
          {drillState === "feedback_wrong" && (
            <>
              <button
                className="btn-glass"
                onClick={() => { setShowHint(true); setUsedHint(true); setDrillState("drilling"); }}
                style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
              >
                Show Hint
              </button>
              <button
                className="btn-glass"
                onClick={tryAgain}
                style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
              >
                Try Again
              </button>
              <button
                className="btn-glass"
                onClick={skipMove}
                style={{ flex: 1, fontSize: 12, padding: "7px 0", color: "var(--danger)" }}
              >
                Skip
              </button>
            </>
          )}
          {drillState === "drilling" && (
            <button
              className="btn-glass"
              onClick={onExit}
              style={{ flex: 1, fontSize: 12, padding: "7px 0" }}
            >
              ← Exit Drill
            </button>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: 200, height: size + 60,
        display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
      }}>
        {/* Progress */}
        <div className="glass" style={{ borderRadius: 10, padding: "12px 14px" }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "var(--text-3)",
            letterSpacing: 1, marginBottom: 10,
          }}>
            PROGRESS
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
              <span>Lines</span>
              <span>{currentLineIdx + 1} / {lines.length}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${((currentLineIdx) / Math.max(lines.length, 1)) * 100}%`,
                background: "var(--accent)", transition: "width 0.3s",
              }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-2)" }}>Score</span>
            <span style={{ fontWeight: 700, color: "var(--accent)" }}>{score} pts</span>
          </div>
        </div>

        {/* Current line */}
        {currentLine && (
          <div className="glass" style={{ flex: 1, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{
              padding: "8px 12px 6px",
              borderBottom: "1px solid var(--glass-border)",
              fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1,
            }}>
              CURRENT LINE
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 4px" }}>
              {currentLine.nodes.map((node, i) => {
                const isPlayer =
                  (currentLine.treeColor === "white" && node.moveNumber % 2 === 1) ||
                  (currentLine.treeColor === "black" && node.moveNumber % 2 === 0);
                const isCurrent = i === currentNodeIdx;
                const isDone = i < currentNodeIdx;
                return (
                  <div key={node.id ?? i} style={{
                    padding: "3px 8px", borderRadius: 4,
                    display: "flex", alignItems: "center", gap: 6,
                    background: isCurrent ? "var(--accent-dim)" : "transparent",
                  }}>
                    <span style={{ fontSize: 11, color: "var(--text-3)", minWidth: 24 }}>
                      {Math.ceil(node.moveNumber / 2)}{node.moveNumber % 2 === 1 ? "." : "..."}
                    </span>
                    <span style={{
                      fontSize: 12, fontFamily: "DM Mono, monospace",
                      color: isDone ? "var(--text-3)" : isCurrent ? "var(--accent)" : isPlayer ? "var(--text)" : "var(--text-2)",
                      fontWeight: isCurrent ? 700 : 400,
                      textDecoration: isDone ? "line-through" : "none",
                    }}>
                      {isPlayer && !isDone && drillState === "drilling" && isCurrent ? "???" : node.moveSan}
                    </span>
                    {isCurrent && isPlayer && (
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>←</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results so far */}
        {results.length > 0 && (
          <div className="glass" style={{ borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
              SO FAR
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: r.skipped ? "var(--danger)" : r.firstTry ? "var(--success)" : "var(--warning)",
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
              {firstTryCount} first try · {results.filter(r => !r.firstTry && !r.skipped).length} hinted · {results.filter(r => r.skipped).length} skipped
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
