import { db, SavedGame } from "@/lib/db";

const BASE = "/api/chesscom";

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

export async function syncChessCom(username: string, onProgress?: (msg: string) => void): Promise<number> {
  const lower = username.toLowerCase();
  onProgress?.("Fetching Chess.com archives...");

  // Get list of monthly archives
  const archivesRes = await fetch(`${BASE}/archives?username=${lower}`);
  if (!archivesRes.ok) throw new Error(`Chess.com user not found: ${username}`);
  const { archives } = await archivesRes.json();

  // Get last synced date
  const account = await db.platformAccounts
    .where("platform").equals("chessdotcom")
    .and(a => a.username.toLowerCase() === lower)
    .first();

  const lastSync = account?.lastSyncedAt ?? new Date(0);

  // On first sync fetch all archives, on subsequent syncs only recent ones
  const lastSyncDate = account?.lastSyncedAt ?? new Date(0);
  const recentArchives = lastSyncDate.getTime() === 0 ? archives : archives.filter((url: string) => {
    const parts = url.split("/");
    const year = parseInt(parts[parts.length - 2]);
    const month = parseInt(parts[parts.length - 1]);
    const archiveDate = new Date(year, month - 1, 1);
    return archiveDate >= new Date(lastSyncDate.getFullYear(), lastSyncDate.getMonth(), 1);
  });

  let totalImported = 0;

  for (const archiveUrl of recentArchives) {
    const parts = archiveUrl.split("/");
    const year = parts[parts.length - 2];
    const month = parts[parts.length - 1];
    onProgress?.(`Importing ${year}/${month}...`);

    try {
      const res = await fetch(`${BASE}/games?url=${encodeURIComponent(archiveUrl)}`);
      if (!res.ok) continue;
      const data = await res.json();
      const games = data.games || [];
      console.log("Games in archive:", games.length, "first game keys:", games[0] ? Object.keys(games[0]) : "none");

      for (const game of games as ChessComGame[]) {
        if (!game.pgn) continue;

        const playedAt = new Date(game.end_time * 1000);
        // Check not already imported
        const existing = await db.games
          .where("platformGameId").equals(game.url)
          .first();
        if (existing) continue;

        const isWhite = game.white.username.toLowerCase() === lower;
        const playerColor = isWhite ? "white" : "black";
        const opponentRating = isWhite ? game.black.rating : game.white.rating;

        const result = game.white.result === "win" ? "1-0" :
          game.black.result === "win" ? "0-1" : "1/2-1/2";

        await db.games.add({
          pgn: game.pgn,
          result,
          playerColor,
          engineElo: 0,
          opponentRating,
          hasClockData: false,
          source: "chessdotcom",
          platformGameId: game.url,
          timeControl: game.time_control,
          playedAt,
        });
        totalImported++;
      }
    } catch (e) {
      console.error("Error fetching archive:", archiveUrl, e);
    }
  }

  // Update or create account record
  if (account?.id) {
    await db.platformAccounts.update(account.id, {
      lastSyncedAt: new Date(),
      totalGamesImported: (account.totalGamesImported || 0) + totalImported,
    });
  } else {
    const oldest = await db.games
      .where("source").equals("chessdotcom")
      .sortBy("playedAt");
    await db.platformAccounts.add({
      platform: "chessdotcom",
      username: lower,
      lastSyncedAt: new Date(),
      totalGamesImported: totalImported,
      earliestGameAt: oldest[0]?.playedAt ?? new Date(),
    });
  }

  return totalImported;
}
