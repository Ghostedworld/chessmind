"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const RepertoireBuilder = dynamic(() => import("@/components/board/RepertoireBoard"), { ssr: false });
const DrillMode = dynamic(() => import("@/components/repertoire/DrillMode"), { ssr: false });
const OpeningLibrary = dynamic(() => import("@/components/repertoire/OpeningLibrary"), { ssr: false });

export default function RepertoirePage({ boardTheme }: { boardTheme?: { dark: string; light: string } }) {
  const [mode, setMode] = useState<"build" | "drill">("build");
  const [showLibrary, setShowLibrary] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Sub-tabs */}
      <div style={{
        display: "flex", alignItems: "center", flexShrink: 0,
        borderBottom: "1px solid var(--glass-border)",
        background: "rgba(8,12,20,0.5)", backdropFilter: "blur(12px)",
      }}>
        {([
          { id: "build", label: "📝 Build" },
          { id: "drill", label: "⚡ Drill" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            style={{
              padding: "10px 24px", border: "none", cursor: "pointer",
              background: "transparent", fontSize: 13, fontWeight: 600,
              color: mode === tab.id ? "var(--accent)" : "var(--text-3)",
              borderBottom: mode === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setShowLibrary(true)}
          style={{
            marginLeft: "auto", marginRight: 12,
            padding: "6px 14px", borderRadius: 8, border: "none",
            background: "var(--accent-dim)", cursor: "pointer",
            fontSize: 12, fontWeight: 600, color: "var(--accent)",
            transition: "all 0.15s",
          }}
        >
          📖 Opening Library
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "build" && <RepertoireBuilder boardTheme={boardTheme} refreshKey={refreshKey} />}
        {mode === "drill" && <DrillMode boardTheme={boardTheme} onExit={() => setMode("build")} />}
      </div>

      {/* Library modal — kept mounted to avoid Chessboard context crash on remount */}
      <div style={{ display: showLibrary ? "block" : "none" }}>
        <OpeningLibrary
          boardTheme={boardTheme}
          onClose={() => setShowLibrary(false)}
          onImported={() => setRefreshKey(k => k + 1)}
          refreshTrigger={refreshKey}
        />
      </div>
    </div>
  );
}
