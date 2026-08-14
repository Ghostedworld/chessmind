import { db } from "@/lib/db";

const BASE = "https://lichess.org/api";

export async function syncLichess(username: string, onProgress?: (msg: string) => void): Promise<number> {
  const lower = username.toLowerCase();
  onProgress?.("Connecting to Lichess...");

  // Get last synced date
  const account = await db.platformAccounts
    .where("platform").equals("lichess")
    .and(a => a.username.toLowerCase() === lower)
    .first();

  const since = account?.lastSyncedAt
    ? account.lastSyncedAt.getTime()
    : 0;

  onProgress?.("Fetching games...");

  const url = `${BASE}/games/user/${lower}?since=${since}&pgnInJson=true&clocks=true&opening=true&max=2000`;

  const res = await fetch(url, {
    headers: { Accept: "application/x-ndjson" }
  });

  if (!res.ok) throw new Error(`Lichess user not found: ${username}`);

  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);

  let totalImported = 0;

  for (const line of lines) {
    try {
      const game = JSON.parse(line);
      if (!game.pgn) continue;

      const playedAt = new Date(game.lastMoveAt || game.createdAt);

      // Check not already imported
      const existing = await db.games
        .where("platformGameId").equals(game.id)
        .first();
      if (existing) continue;

      const isWhite = game.players?.white?.user?.name?.toLowerCase() === lower;
      const playerColor = isWhite ? "white" : "black";
      const opponent = isWhite ? game.players?.black : game.players?.white;
      const opponentRating = opponent?.rating ?? 0;

      const winner = game.winner;
      const result = winner === "white" ? "1-0" :
        winner === "black" ? "0-1" : "1/2-1/2";

      const hasClockData = !!(game.clocks && game.clocks.length > 0);

      await db.games.add({
        pgn: game.pgn,
        result,
        playerColor,
        engineElo: 0,
        opponentRating,
        hasClockData,
        source: "lichess",
        platformGameId: game.id,
        timeControl: game.speed ?? "",
        opening: game.opening?.name ?? "",
        playedAt,
      });
      totalImported++;

      if (totalImported % 50 === 0) {
        onProgress?.(`Imported ${totalImported} games...`);
      }
    } catch (e) {
      console.error("Error parsing game:", e);
    }
  }

  // Update or create account record
  if (account?.id) {
    await db.platformAccounts.update(account.id, {
      lastSyncedAt: new Date(),
      totalGamesImported: (account.totalGamesImported || 0) + totalImported,
    });
  } else {
    await db.platformAccounts.add({
      platform: "lichess",
      username: lower,
      lastSyncedAt: new Date(),
      totalGamesImported: totalImported,
      earliestGameAt: new Date(since || Date.now()),
    });
  }

  return totalImported;
}
