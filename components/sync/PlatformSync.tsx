"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { syncChessCom } from "@/lib/sync/chesscom";
import { syncLichess } from "@/lib/sync/lichess";

interface AccountStatus {
  connected: boolean;
  username: string;
  totalGames: number;
  lastSync: Date | null;
}

export default function PlatformSync() {
  const [chesscom, setChesscom] = useState<AccountStatus>({
    connected: false, username: "155thx1", totalGames: 0, lastSync: null
  });
  const [lichess, setLichess] = useState<AccountStatus>({
    connected: false, username: "ISSTHx1", totalGames: 0, lastSync: null
  });
  const [syncing, setSyncing] = useState<"chessdotcom" | "lichess" | null>(null);
  const [progress, setProgress] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [syncCount, setSyncCount] = useState(0);

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    const accounts = await db.platformAccounts.toArray();
    const cc = accounts.find(a => a.platform === "chessdotcom");
    const li = accounts.find(a => a.platform === "lichess");
    if (cc) setChesscom({ connected: true, username: cc.username, totalGames: cc.totalGamesImported, lastSync: cc.lastSyncedAt });
    if (li) setLichess({ connected: true, username: li.username, totalGames: li.totalGamesImported, lastSync: li.lastSyncedAt });
  }

  async function handleSync(platform: "chessdotcom" | "lichess") {
    setSyncing(platform);
    setProgress("");
    setLastResult(null);
    try {
      const username = platform === "chessdotcom" ? chesscom.username : lichess.username;
      const count = platform === "chessdotcom"
        ? await syncChessCom(username, setProgress)
        : await syncLichess(username, setProgress);
      setLastResult(`✓ Imported ${count} new games from ${platform === "chessdotcom" ? "Chess.com" : "Lichess"}`);
      setSyncCount(c => c + 1); // trigger stats refresh
      await loadAccounts();
    } catch (e: any) {
      setLastResult(`✗ Error: ${e.message}`);
    }
    setSyncing(null);
    setProgress("");
  }

  const formatDate = (d: Date | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 8 }}>
        PLATFORM SYNC
      </div>

      {/* Chess.com */}
      <div className="glass" style={{ borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "#81b64c", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18,
          }}>♞</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Chess.com</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              {chesscom.connected
                ? `${chesscom.totalGames} games imported · Last sync: ${formatDate(chesscom.lastSync)}`
                : "Not synced yet"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {chesscom.connected && (
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "var(--success)", boxShadow: "0 0 6px var(--success)",
              }} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={chesscom.username}
            onChange={e => setChesscom(p => ({ ...p, username: e.target.value }))}
            placeholder="Chess.com username"
            style={{
              flex: 1, background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--glass-border)", borderRadius: 8,
              color: "var(--text)", padding: "7px 10px",
              fontSize: 13, fontFamily: "DM Sans, sans-serif", outline: "none",
            }}
          />
          <button
            className="btn-accent"
            onClick={() => handleSync("chessdotcom")}
            disabled={syncing !== null}
            style={{
              padding: "7px 16px", fontSize: 12, flexShrink: 0,
              opacity: syncing !== null ? 0.6 : 1,
            }}
          >
            {syncing === "chessdotcom" ? "Syncing..." : chesscom.connected ? "Sync Now" : "Connect"}
          </button>
        </div>
      </div>

      {/* Lichess */}
      <div className="glass" style={{ borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: "#ffffff", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18,
          }}>🐴</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Lichess</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              {lichess.connected
                ? `${lichess.totalGames} games imported · Last sync: ${formatDate(lichess.lastSync)}`
                : "Not synced yet"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {lichess.connected && (
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "var(--success)", boxShadow: "0 0 6px var(--success)",
              }} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={lichess.username}
            onChange={e => setLichess(p => ({ ...p, username: e.target.value }))}
            placeholder="Lichess username"
            style={{
              flex: 1, background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--glass-border)", borderRadius: 8,
              color: "var(--text)", padding: "7px 10px",
              fontSize: 13, fontFamily: "DM Sans, sans-serif", outline: "none",
            }}
          />
          <button
            className="btn-accent"
            onClick={() => handleSync("lichess")}
            disabled={syncing !== null}
            style={{
              padding: "7px 16px", fontSize: 12, flexShrink: 0,
              opacity: syncing !== null ? 0.6 : 1,
            }}
          >
            {syncing === "lichess" ? "Syncing..." : lichess.connected ? "Sync Now" : "Connect"}
          </button>
        </div>
      </div>

      {/* Progress / Result */}
      {(progress || lastResult) && (
        <div className="glass" style={{
          borderRadius: 10, padding: "10px 14px",
          fontSize: 12,
          color: lastResult?.startsWith("✓") ? "var(--success)" :
            lastResult?.startsWith("✗") ? "var(--danger)" : "var(--text-2)",
        }}>
          {progress || lastResult}
        </div>
      )}

      {/* Stats */}
      {(chesscom.connected || lichess.connected) && (
        <div style={{ marginTop: 12 }}>
          <TotalGamesStats refreshKey={syncCount} />
        </div>
      )}
    </div>
  );
}

function TotalGamesStats({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState({
    total: 0, wins: 0, losses: 0, draws: 0,
    chessdotcom: 0, lichess: 0,
  });

  useEffect(() => {
    db.games.toArray().then(games => {
      const platform = games.filter(g => g.source === "chessdotcom" || g.source === "lichess");
      const wins = platform.filter(g =>
        (g.playerColor === "white" && g.result === "1-0") ||
        (g.playerColor === "black" && g.result === "0-1")
      ).length;
      const losses = platform.filter(g =>
        (g.playerColor === "white" && g.result === "0-1") ||
        (g.playerColor === "black" && g.result === "1-0")
      ).length;
      setStats({
        total: platform.length,
        wins,
        losses,
        draws: platform.length - wins - losses,
        chessdotcom: platform.filter(g => g.source === "chessdotcom").length,
        lichess: platform.filter(g => g.source === "lichess").length,
      });
    });
  }, [refreshKey]);

  if (stats.total === 0) return null;

  const winPct = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <div className="glass" style={{ borderRadius: 12, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: 1, marginBottom: 10 }}>
        IMPORTED GAME STATS
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
        {[
          { label: "Total", value: stats.total, color: "var(--text)" },
          { label: "Wins", value: stats.wins, color: "var(--success)" },
          { label: "Losses", value: stats.losses, color: "var(--danger)" },
          { label: "Draws", value: stats.draws, color: "var(--text-2)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: `linear-gradient(to right, var(--success) ${winPct}%, var(--danger) ${winPct}%)`,
          width: "100%",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--text-3)", marginTop: 4,
      }}>
        <span>♟ Chess.com: {stats.chessdotcom}</span>
        <span>Win rate: {winPct}%</span>
        <span>Lichess: {stats.lichess}</span>
      </div>
    </div>
  );
}
