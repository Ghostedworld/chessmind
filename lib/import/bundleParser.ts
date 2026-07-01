import { Chess } from "chess.js";

export interface ParsedGame {
  pgn: string;
  white: string;
  black: string;
  event?: string;
  date?: string;
  result: string;
  eco?: string;
  openingName?: string;
  moves: string[];
}

/**
 * Splits a multi-game PGN text blob into individual games.
 * Multi-game PGN files separate games by blank lines after the
 * move text, with each game starting with [Event "..."] headers.
 */
export function splitMultiGamePgn(text: string): string[] {
  const games: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("[Event ") && current.length > 0) {
      // Check if current has actual move text (not just headers) before splitting
      const hasMovesAlready = current.some(l => !l.trim().startsWith("[") && l.trim().length > 0);
      if (hasMovesAlready) {
        games.push(current.join("\n").trim());
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length > 0) {
    const hasMovesAlready = current.some(l => !l.trim().startsWith("[") && l.trim().length > 0);
    if (hasMovesAlready) games.push(current.join("\n").trim());
  }

  return games.filter(g => g.length > 0);
}

export function parseGame(pgnText: string): ParsedGame | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgnText);
  } catch {
    return null;
  }

  const headers = chess.header();
  const moves = chess.history();

  // Clean up PGN date format (e.g. "1908.??.??" -> "1908")
  const rawDate = headers.Date || "";
  const cleanDate = rawDate.split(".")[0].replace(/[^0-9]/g, "") || rawDate;

  return {
    pgn: pgnText,
    white: headers.White || "Unknown",
    black: headers.Black || "Unknown",
    event: headers.Event,
    date: cleanDate,
    result: headers.Result || "*",
    eco: headers.ECO,
    openingName: headers.Opening || headers.Variation || "",
    moves,
  };
}

export function parseMultiGameBundle(text: string): ParsedGame[] {
  const rawGames = splitMultiGamePgn(text);
  const parsed: ParsedGame[] = [];

  for (const raw of rawGames) {
    const game = parseGame(raw);
    if (game) parsed.push(game);
  }

  return parsed;
}

/**
 * Heuristic: does this look like a "famous/historical game" collection
 * (has real player names, not generic usernames) vs an "opening theory"
 * collection (many short games of the same opening, often unnamed)?
 */
export function classifyBundle(games: ParsedGame[]): "historical" | "opening_theory" | "mixed" {
  if (games.length === 0) return "mixed";

  const avgMoveCount = games.reduce((s, g) => s + g.moves.length, 0) / games.length;
  const hasEvents = games.filter(g => g.event && g.event !== "?" && g.event !== "Unknown").length;
  const eventRatio = hasEvents / games.length;

  // Historical games tend to be longer and have real event names
  if (avgMoveCount > 30 && eventRatio > 0.5) return "historical";
  // Opening theory dumps tend to be shorter, less complete games
  if (avgMoveCount < 20) return "opening_theory";
  return "mixed";
}
