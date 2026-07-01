import { LIBRARY_OPENINGS } from "./data";

// Build a lookup of move-sequence -> opening name from our library data
function buildOpeningLookup(): Map<string, string> {
  const map = new Map<string, string>();

  for (const opening of LIBRARY_OPENINGS) {
    for (const variation of opening.variations) {
      // Index every prefix of the variation
      for (let i = 1; i <= variation.moves.length; i++) {
        const key = variation.moves.slice(0, i).join(",");
        const name = i <= opening.trunk.length
          ? opening.name
          : `${opening.name}: ${variation.name}`;
        map.set(key, name);
      }
    }
  }

  return map;
}

let lookupCache: Map<string, string> | null = null;

export function detectOpening(moveHistory: string[]): string {
  if (!lookupCache) lookupCache = buildOpeningLookup();

  for (let i = moveHistory.length; i >= 1; i--) {
    const key = moveHistory.slice(0, i).join(",");
    const match = lookupCache.get(key);
    if (match) return match;
  }

  return "";
}
