import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "No username" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
      { headers: { "User-Agent": "ChessMind/1.0" } }
    );
    if (!res.ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
