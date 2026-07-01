import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No url" }, { status: 400 });

  try {
    // URL is already the full archive URL e.g. .../games/2026/06
    // Chess.com games endpoint is just the archive URL directly, no /games appended
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ChessMind/1.0",
        "Accept": "application/json",
      }
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Chess.com returned ${res.status}`, detail: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
