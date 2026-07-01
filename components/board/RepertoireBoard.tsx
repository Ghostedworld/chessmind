"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { db, OpeningNode, OpeningTree } from "@/lib/db";

interface TreeNode {
  id?: number;
  treeId: number;
  parentId?: number;
  moveSan: string;
  fen: string;
  moveNumber: number;
  notes: string;
  evalTag: "best" | "good" | "inaccuracy" | "mistake" | "";
  confidence: "green" | "amber" | "red";
  variationName?: string;
  children?: TreeNode[];
}

const CONFIDENCE_COLORS = {
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
};

const EVAL_TAGS = [
  { value: "", label: "—" },
  { value: "best", label: "Best ★" },
  { value: "good", label: "Good ✓" },
  { value: "inaccuracy", label: "Inaccuracy ?!" },
  { value: "mistake", label: "Mistake ?" },
];

function buildTree(nodes: OpeningNode[]): TreeNode[] {
  const map = new Map<number | undefined, TreeNode[]>();
  nodes.forEach(n => {
    const node: TreeNode = { ...n, children: [] };
    const key = n.parentId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(node);
  });

  function attach(parentId?: number): TreeNode[] {
    return (map.get(parentId) || []).map(node => ({
      ...node,
      children: attach(node.id),
    }));
  }
  return attach(undefined);
}

function TreeLine({
  nodes, depth, selectedId, onSelect, onRenameVariation,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedId?: number;
  onSelect: (n: TreeNode) => void;
  onRenameVariation: (n: TreeNode) => void;
}) {
  if (!nodes.length) return null;
  return (
    <div>
      {nodes.map((node, i) => {
        const isBranchPoint = node.children && node.children.length >= 2;
        const isVariationStart = !!(node as any).variationName;
        return (
          <div key={node.id ?? i}>
            {/* Variation name label */}
            {isVariationStart && (
              <div style={{
                padding: "3px 8px 1px " + (8 + depth * 16) + "px",
                fontSize: 10, fontWeight: 700, color: "var(--accent)",
                letterSpacing: 0.5, opacity: 0.8,
              }}>
                {(node as any).variationName}
              </div>
            )}
            <div
              onClick={() => onSelect(node)}
              onContextMenu={e => { e.preventDefault(); onRenameVariation(node); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px 4px " + (8 + depth * 16) + "px",
                cursor: "pointer", borderRadius: 6,
                background: selectedId === node.id ? "var(--accent-dim)" : "transparent",
                borderLeft: selectedId === node.id ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {/* Branch indicator */}
              {isBranchPoint ? (
                <span style={{
                  fontSize: 10, color: "var(--warning)",
                  flexShrink: 0, lineHeight: 1,
                }}>⑂</span>
              ) : (
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: CONFIDENCE_COLORS[node.confidence] || "var(--text-3)",
                  boxShadow: `0 0 4px ${CONFIDENCE_COLORS[node.confidence] || "transparent"}`,
                }} />
              )}
              <span style={{
                fontSize: 13, fontFamily: "DM Mono, monospace",
                color: selectedId === node.id
                  ? "var(--accent)"
                  : isBranchPoint ? "var(--warning)" : "var(--text)",
                fontWeight: isBranchPoint ? 600 : 400,
              }}>
                {Math.ceil(node.moveNumber / 2)}{node.moveNumber % 2 === 1 ? "." : "..."} {node.moveSan}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
                {node.evalTag && (
                  <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                    {node.evalTag === "best" ? "★" : node.evalTag === "good" ? "✓" : node.evalTag === "inaccuracy" ? "?!" : "?"}
                  </span>
                )}
                {node.notes && (
                  <span style={{ fontSize: 10, color: "var(--text-3)" }}>✎</span>
                )}
                {isBranchPoint && (
                  <span style={{ fontSize: 9, color: "var(--warning)", opacity: 0.6 }}>
                    {node.children!.length} lines
                  </span>
                )}
              </div>
            </div>
            {node.children && node.children.length > 0 && (
              <TreeLine
                nodes={node.children}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onRenameVariation={onRenameVariation}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RepertoireBuilder({ boardTheme = { dark: "#1e3a5f", light: "#4a7eb5" }, refreshKey = 0 }: { boardTheme?: { dark: string; light: string }; refreshKey?: number }) {
  const [trees, setTrees] = useState<OpeningTree[]>([]);
  const [selectedTree, setSelectedTree] = useState<OpeningTree | null>(null);
  const [nodes, setNodes] = useState<OpeningNode[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [game, setGame] = useState(new Chess());
  const [size, setSize] = useState(400);
  const [showNewTreeModal, setShowNewTreeModal] = useState(false);
  const [newTreeName, setNewTreeName] = useState("");
  const [newTreeColor, setNewTreeColor] = useState<"white" | "black">("white");
  const [showPgnImport, setShowPgnImport] = useState(false);
  const [pgnInput, setPgnInput] = useState("");
  const [editingNote, setEditingNote] = useState("");
  const [renamingNode, setRenamingNode] = useState<TreeNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<TreeNode[]>([]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    const update = () => {
      if (!wrapperRef.current) return;
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      const boardW = width * 0.48 - 24;
      const boardH = height - 120; // breadcrumb + controls + padding
      setSize(Math.max(Math.min(boardH, boardW), 240));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { loadTrees(); }, [refreshKey]);

  useEffect(() => {
    if (selectedTree) loadNodes(selectedTree.id!);
  }, [selectedTree]);

  useEffect(() => {
    setTreeData(buildTree(nodes));
  }, [nodes]);

  useEffect(() => {
    if (selectedNode) setEditingNote(selectedNode.notes || "");
  }, [selectedNode]);

  async function loadTrees() {
    const all = await db.openingTrees.orderBy("createdAt").reverse().toArray();
    setTrees(all);
    if (all.length > 0 && !selectedTree) setSelectedTree(all[0]);
  }

  function handleRenameVariation(node: TreeNode) {
    setRenamingNode(node);
    setRenameValue(node.variationName || "");
  }

  async function saveVariationName() {
    if (!renamingNode?.id) { setRenamingNode(null); return; }
    await db.openingNodes.update(renamingNode.id, { variationName: renameValue.trim() || undefined });
    if (selectedTree?.id) await loadNodes(selectedTree.id);
    setRenamingNode(null);
    setRenameValue("");
  }

  async function loadNodes(treeId: number) {
    const all = await db.openingNodes.where("treeId").equals(treeId).toArray();
    setNodes(all);
    // Reset board
    setGame(new Chess());
    setSelectedNode(null);
    setCurrentPath([]);
    setLastMove(null);
  }

  async function createTree() {
    if (!newTreeName.trim()) return;
    const id = await db.openingTrees.add({
      name: newTreeName.trim(),
      color: newTreeColor,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as number;
    const tree = await db.openingTrees.get(id);
    setShowNewTreeModal(false);
    setNewTreeName("");
    await loadTrees();
    if (tree) setSelectedTree(tree);
  }

  async function deleteTree(treeId: number) {
    if (!confirm("Delete this tree and all its lines?")) return;
    await db.openingNodes.where("treeId").equals(treeId).delete();
    await db.openingTrees.delete(treeId);
    setSelectedTree(null);
    setNodes([]);
    setTreeData([]);
    await loadTrees();
  }

  function onNodeSelect(node: TreeNode) {
    // Rebuild game to this position
    const fresh = new Chess();
    // Find path from root to this node
    const path: TreeNode[] = [];
    function findPath(nodes: TreeNode[], target: TreeNode): boolean {
      for (const n of nodes) {
        if (n.id === target.id) { path.push(n); return true; }
        if (n.children && findPath(n.children, target)) { path.unshift(n); return true; }
      }
      return false;
    }
    // Build flat list and find ancestors
    const flat = new Map<number, OpeningNode>();
    nodes.forEach(n => { if (n.id) flat.set(n.id, n); });

    const ancestors: OpeningNode[] = [];
    let current: OpeningNode | undefined = flat.get(node.id!);
    while (current) {
      ancestors.unshift(current);
      current = current.parentId ? flat.get(current.parentId) : undefined;
    }

    ancestors.forEach(n => {
      try { fresh.move(n.moveSan); } catch { /**/ }
    });

    setGame(fresh);
    setSelectedNode(node);
    setCurrentPath(ancestors as any);
    setLastMove(
      ancestors.length > 0
        ? null // we don't store from/to, just highlight selected square
        : null
    );
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function onSquareClick({ square }: { square: string; piece?: unknown }) {
    if (!selectedTree) return;
    const current = gameRef.current;

    if (selectedSquare && selectedSquare !== square) {
      const gameCopy = new Chess(current.fen());
      try {
        const move = gameCopy.move({ from: selectedSquare, to: square, promotion: "q" });
        if (move) {
          handleMove(move.san, gameCopy, move.from, move.to);
          return;
        }
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

  function onDrop({ sourceSquare, targetSquare }: {
    piece: unknown; sourceSquare: string; targetSquare: string;
  }) {
    const current = gameRef.current;
    const gameCopy = new Chess(current.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      handleMove(move.san, gameCopy, move.from, move.to);
      return true;
    } catch { return false; }
  }

  async function handleMove(san: string, gameCopy: Chess, from: string, to: string) {
    if (!selectedTree?.id) return;

    const moveNumber = gameCopy.history().length;
    const fen = gameCopy.fen();
    const parentId = selectedNode?.id;

    // Check if this move already exists
    const existing = nodes.find(n =>
      n.treeId === selectedTree.id &&
      n.parentId === parentId &&
      n.moveSan === san
    );

    let node: TreeNode;

    if (existing) {
      node = { ...existing, children: [] };
    } else {
      const id = await db.openingNodes.add({
        treeId: selectedTree.id,
        parentId,
        moveSan: san,
        fen,
        moveNumber,
        notes: "",
        evalTag: "",
        confidence: "green",
        referenceGameIds: [],
        patternIds: [],
      }) as number;
      const saved = await db.openingNodes.get(id);
      node = { ...saved!, children: [] };
      await loadNodes(selectedTree.id);
    }

    setGame(gameCopy);
    setLastMove({ from, to });
    setSelectedNode(node);
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function goBack() {
    if (!selectedNode) return;
    // Find parent node
    const parent = nodes.find(n => n.id === selectedNode.parentId);
    if (parent) {
      onNodeSelect({ ...parent, children: [] });
    } else {
      // Go to root
      setGame(new Chess());
      setSelectedNode(null);
      setCurrentPath([]);
      setLastMove(null);
    }
  }

  async function updateNode(field: Partial<OpeningNode>) {
    if (!selectedNode?.id) return;
    await db.openingNodes.update(selectedNode.id, field);
    setSelectedNode(prev => prev ? { ...prev, ...field } : prev);
    if (selectedTree?.id) await loadNodes(selectedTree.id);
  }

  async function deleteNode() {
    if (!selectedNode?.id) return;
    if (!confirm("Delete this move and all its continuations?")) return;
    // Delete this node and all descendants
    async function deleteRecursive(id: number) {
      const children = nodes.filter(n => n.parentId === id);
      for (const child of children) if (child.id) await deleteRecursive(child.id);
      await db.openingNodes.delete(id);
    }
    await deleteRecursive(selectedNode.id);
    goBack();
    if (selectedTree?.id) await loadNodes(selectedTree.id);
  }

  async function importPgn() {
    if (!selectedTree?.id || !pgnInput.trim()) return;
    const fresh = new Chess();
    try {
      fresh.loadPgn(pgnInput.trim());
    } catch {
      alert("Invalid PGN");
      return;
    }
    const history = fresh.history({ verbose: true }) as any[];
    let parentId: number | undefined = undefined;
    const g = new Chess();

    for (const move of history) {
      g.move(move.san);
      const fen = g.fen();
      const moveNumber = g.history().length; // correct here - full replay from start
      const existing = await db.openingNodes
        .where("treeId").equals(selectedTree.id!)
        .and(n => n.parentId === parentId && n.moveSan === move.san)
        .first();

      if (existing?.id) {
        parentId = existing.id;
      } else {
        const id = await db.openingNodes.add({
          treeId: selectedTree.id!,
          parentId,
          moveSan: move.san,
          fen,
          moveNumber,
          notes: "",
          evalTag: "",
          confidence: "green",
          referenceGameIds: [],
          patternIds: [],
        }) as number;
        parentId = id;
      }
    }

    await loadNodes(selectedTree.id!);
    setShowPgnImport(false);
    setPgnInput("");
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(59,158,255,0.2)" };
    squareStyles[lastMove.to] = { backgroundColor: "rgba(59,158,255,0.35)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: "rgba(59,158,255,0.5)" };
  }
  possibleMoves.forEach(sq => {
    squareStyles[sq] = {
      background: "radial-gradient(circle, rgba(59,158,255,0.65) 28%, transparent 30%)",
    };
  });

  return (
    <div ref={wrapperRef} style={{
      width: "100%", height: "100%",
      display: "flex", gap: 0, overflow: "hidden",
    }}>

      {/* Left — tree list */}
      <div className="glass" style={{
        width: 200, flexShrink: 0,
        borderRadius: 0, borderTop: "none", borderBottom: "none", borderLeft: "none",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Trees header */}
        <div style={{
          padding: "12px 12px 8px",
          borderBottom: "1px solid var(--glass-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1 }}>
            REPERTOIRES
          </span>
          <button
            onClick={() => setShowNewTreeModal(true)}
            style={{
              width: 20, height: 20, borderRadius: 5,
              background: "var(--accent-dim)", border: "1px solid rgba(59,158,255,0.3)",
              color: "var(--accent)", cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
        </div>

        {/* Tree list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          {trees.length === 0 && (
            <div style={{ padding: "12px 8px", fontSize: 12, color: "var(--text-3)" }}>
              No repertoires yet. Create one to start.
            </div>
          )}
          {trees.map(tree => (
            <div
              key={tree.id}
              onClick={() => setSelectedTree(tree)}
              style={{
                padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                marginBottom: 2,
                background: selectedTree?.id === tree.id ? "var(--accent-dim)" : "transparent",
                borderLeft: selectedTree?.id === tree.id ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: selectedTree?.id === tree.id ? "var(--accent)" : "var(--text)",
              }}>
                {tree.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                {tree.color === "white" ? "♙" : "♟"} {tree.color}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center — board */}
      <div style={{
        flex: "0 0 auto",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "12px 12px",
        gap: 10,
      }}>
        {/* Breadcrumb path */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 12, color: "var(--text-3)", flexWrap: "wrap",
          width: size, minHeight: 20,
        }}>
          <span
            onClick={() => {
              setGame(new Chess());
              setSelectedNode(null);
              setCurrentPath([]);
              setLastMove(null);
            }}
            style={{ cursor: "pointer", color: "var(--text-2)" }}
          >
            Start
          </span>
          {currentPath.map((n, i) => (
            <span key={n.id ?? i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "var(--text-3)" }}>›</span>
              <span
                onClick={() => onNodeSelect(n as any)}
                style={{ cursor: "pointer", fontFamily: "DM Mono, monospace", color: "var(--text-2)" }}
              >
                {n.moveSan}
              </span>
            </span>
          ))}
        </div>

        {/* Board */}
        <div className="glass" style={{
          borderRadius: 14, overflow: "hidden", padding: 6,
          boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
        }}>
          <Chessboard
            options={{
              position: game.fen(),
              boardOrientation: selectedTree?.color ?? "white",
              boardStyle: { borderRadius: 8, width: size, height: size },
              darkSquareStyle: { backgroundColor: boardTheme.dark },
              lightSquareStyle: { backgroundColor: boardTheme.light },
              squareStyles,
              onPieceDrop: onDrop,
              onSquareClick,
              allowDragging: true,
              animationDurationInMs: 150,
            }}
          />
        </div>

        {/* Board controls */}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-glass" onClick={goBack} style={{ fontSize: 12, padding: "5px 12px" }}>
            ← Back
          </button>
          <button
            className="btn-glass"
            onClick={() => { setGame(new Chess()); setSelectedNode(null); setCurrentPath([]); setLastMove(null); }}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            ↩ Root
          </button>
          <button
            className="btn-glass"
            onClick={() => setShowPgnImport(true)}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            ↑ Import PGN
          </button>
          {selectedTree && (
            <button
              className="btn-glass"
              onClick={() => deleteTree(selectedTree.id!)}
              style={{ fontSize: 12, padding: "5px 12px", color: "var(--danger)" }}
            >
              🗑 Delete Tree
            </button>
          )}
        </div>
      </div>

      {/* Right — tree view + node editor */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", minWidth: 0, padding: "12px 12px 12px 0", gap: 10,
      }}>
        {/* Move tree */}
        <div className="glass" style={{
          flex: 1, borderRadius: 14, overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid var(--glass-border)",
            fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1,
          }}>
            LINES {selectedTree ? `— ${selectedTree.name}` : ""}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px" }}>
            {!selectedTree && (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--text-3)" }}>
                Select or create a repertoire to start adding lines.
              </div>
            )}
            {selectedTree && treeData.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--text-3)" }}>
                No moves yet. Make a move on the board to start building your repertoire.
              </div>
            )}
            <TreeLine
              nodes={treeData}
              depth={0}
              selectedId={selectedNode?.id}
              onSelect={onNodeSelect}
              onRenameVariation={handleRenameVariation}
            />
          </div>
        </div>

        {/* Node editor */}
        {selectedNode && (
          <div className="glass" style={{
            borderRadius: 14, padding: 14, flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "var(--text-3)",
              letterSpacing: 1, marginBottom: 10,
            }}>
              MOVE: {Math.ceil(selectedNode.moveNumber / 2)}
              {selectedNode.moveNumber % 2 === 1 ? ". " : "... "}
              {selectedNode.moveSan}
            </div>

            {/* Confidence */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Confidence</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["green", "amber", "red"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => updateNode({ confidence: c })}
                    style={{
                      flex: 1, padding: "5px 0", borderRadius: 6, border: "none",
                      cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: selectedNode.confidence === c
                        ? CONFIDENCE_COLORS[c]
                        : "rgba(255,255,255,0.05)",
                      color: selectedNode.confidence === c ? "white" : CONFIDENCE_COLORS[c],
                      transition: "all 0.15s",
                    }}
                  >
                    {c === "green" ? "Solid" : c === "amber" ? "Learning" : "Shaky"}
                  </button>
                ))}
              </div>
            </div>

            {/* Eval tag */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Evaluation</div>
              <select
                value={selectedNode.evalTag}
                onChange={e => updateNode({ evalTag: e.target.value as any })}
                style={{
                  width: "100%", background: "var(--glass)",
                  border: "1px solid var(--glass-border)", borderRadius: 8,
                  color: "var(--text)", padding: "6px 10px",
                  fontSize: 13, fontFamily: "DM Sans, sans-serif", cursor: "pointer",
                }}
              >
                {EVAL_TAGS.map(t => (
                  <option key={t.value} value={t.value} style={{ background: "#0D1420" }}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Notes</div>
              <textarea
                value={editingNote}
                onChange={e => setEditingNote(e.target.value)}
                onBlur={() => updateNode({ notes: editingNote })}
                placeholder="Add notes about this move..."
                rows={3}
                style={{
                  width: "100%", background: "var(--glass)",
                  border: "1px solid var(--glass-border)", borderRadius: 8,
                  color: "var(--text)", padding: "8px 10px",
                  fontSize: 13, fontFamily: "DM Sans, sans-serif",
                  resize: "vertical", outline: "none",
                }}
              />
            </div>

            <button
              onClick={deleteNode}
              style={{
                width: "100%", padding: "7px 0", borderRadius: 8,
                background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                color: "var(--danger)", fontSize: 12, cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              🗑 Delete this move
            </button>
          </div>
        )}
      </div>

      {/* New tree modal */}
      {showNewTreeModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="glass" style={{
            width: 360, borderRadius: 16, padding: 24,
            boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>
              New Repertoire
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>Name</div>
              <input
                value={newTreeName}
                onChange={e => setNewTreeName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createTree()}
                placeholder="e.g. Caro-Kann Exchange"
                autoFocus
                style={{
                  width: "100%", background: "var(--glass)",
                  border: "1px solid var(--glass-border)", borderRadius: 8,
                  color: "var(--text)", padding: "10px 12px",
                  fontSize: 14, fontFamily: "DM Sans, sans-serif", outline: "none",
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>Playing as</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["white", "black"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setNewTreeColor(c)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                      cursor: "pointer", fontSize: 13, fontWeight: 600,
                      background: newTreeColor === c ? "var(--accent)" : "var(--glass)",
                      color: newTreeColor === c ? "white" : "var(--text-2)",
                      transition: "all 0.15s",
                    }}
                  >
                    {c === "white" ? "♙ White" : "♟ Black"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-glass"
                onClick={() => setShowNewTreeModal(false)}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                className="btn-accent"
                onClick={createTree}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename variation modal */}
      {renamingNode && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="glass" style={{
            width: 340, borderRadius: 16, padding: 24,
            boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              Name this variation
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>
              After{" "}
              <span style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>
                {Math.ceil(renamingNode.moveNumber / 2)}{renamingNode.moveNumber % 2 === 1 ? "." : "..."} {renamingNode.moveSan}
              </span>
            </div>
            <input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveVariationName(); if (e.key === "Escape") setRenamingNode(null); }}
              placeholder="e.g. Advance Variation"
              autoFocus
              style={{
                width: "100%", background: "var(--glass)",
                border: "1px solid var(--glass-border)", borderRadius: 8,
                color: "var(--text)", padding: "10px 12px",
                fontSize: 14, fontFamily: "DM Sans, sans-serif",
                outline: "none", marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              {renameValue && (
                <button
                  className="btn-glass"
                  onClick={async () => {
                    if (renamingNode?.id) {
                      await db.openingNodes.update(renamingNode.id, { variationName: undefined });
                      if (selectedTree?.id) await loadNodes(selectedTree.id);
                    }
                    setRenamingNode(null);
                  }}
                  style={{ fontSize: 12, padding: "8px 0", color: "var(--danger)", flex: 1 }}
                >
                  Clear Name
                </button>
              )}
              <button
                className="btn-glass"
                onClick={() => setRenamingNode(null)}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                className="btn-accent"
                onClick={saveVariationName}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PGN import modal */}
      {showPgnImport && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="glass" style={{
            width: 440, borderRadius: 16, padding: 24,
            boxShadow: "0 0 60px rgba(0,0,0,0.8)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Import PGN
            </div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
              Paste a PGN and all moves will be added to your repertoire.
            </div>
            <textarea
              value={pgnInput}
              onChange={e => setPgnInput(e.target.value)}
              placeholder="1. e4 c6 2. d4 d5 3. exd5 cxd5..."
              rows={8}
              style={{
                width: "100%", background: "var(--glass)",
                border: "1px solid var(--glass-border)", borderRadius: 8,
                color: "var(--text)", padding: "10px 12px",
                fontSize: 13, fontFamily: "DM Mono, monospace",
                resize: "vertical", outline: "none", marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-glass"
                onClick={() => { setShowPgnImport(false); setPgnInput(""); }}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                className="btn-accent"
                onClick={importPgn}
                style={{ flex: 1, padding: "9px 0", fontSize: 13 }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
