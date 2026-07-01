export interface LibraryVariation {
  name: string;
  moves: string[]; // full move list from start
}

export interface LibraryOpening {
  id: string;
  name: string;
  eco: string;
  color: "white" | "black" | "both";
  category: string;
  description: string;
  trunk: string[]; // shared moves before variations
  variations: LibraryVariation[];
}

export const LIBRARY_OPENINGS: LibraryOpening[] = [
  // ── BLACK RESPONSES TO 1.e4 ──────────────────────────────────────────────
  {
    id: "caro-kann",
    name: "Caro-Kann Defense",
    eco: "B10-B19",
    color: "black",
    category: "Semi-Open",
    description: "Solid defense against 1.e4. Black establishes a strong pawn center without blocking the light-squared bishop.",
    trunk: ["e4", "c6", "d4", "d5"],
    variations: [
      { name: "Advance Variation", moves: ["e4","c6","d4","d5","e5","Bf5","Nf3","e6","Be2","c5"] },
      { name: "Exchange Variation", moves: ["e4","c6","d4","d5","exd5","cxd5","Bd3","Nc6","c3","Nf6"] },
      { name: "Classical Variation", moves: ["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5","Ng3","Bg6","h4","h6","Nf3","Nd7"] },
      { name: "Karpov Variation", moves: ["e4","c6","d4","d5","Nd2","dxe4","Nxe4","Bf5","Ng3","Bg6","h4","h6","Nf3","Nd7"] },
      { name: "Two Knights Variation", moves: ["e4","c6","Nc3","d5","Nf3","Bg4","h3","Bxf3","Qxf3","e6","d3","Nf6"] },
    ]
  },
  {
    id: "sicilian",
    name: "Sicilian Defense",
    eco: "B20-B99",
    color: "black",
    category: "Semi-Open",
    description: "The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich complex positions.",
    trunk: ["e4", "c5"],
    variations: [
      { name: "Najdorf Variation", moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"] },
      { name: "Dragon Variation", moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","g6","Be3","Bg7","f3","O-O"] },
      { name: "Scheveningen Variation", moves: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","e6"] },
      { name: "Classical Variation", moves: ["e4","c5","Nf3","Nc6","d4","cxd4","Nxd4","Nf6","Nc3","d6"] },
      { name: "Kan / Taimanov", moves: ["e4","c5","Nf3","e6","d4","cxd4","Nxd4","a6","Nc3","Qc7"] },
      { name: "Alapin Variation", moves: ["e4","c5","c3","Nf6","e5","Nd5","d4","cxd4","cxd4","d6"] },
    ]
  },
  {
    id: "french",
    name: "French Defense",
    eco: "C00-C19",
    color: "black",
    category: "Semi-Open",
    description: "Solid and counterattacking. Black accepts a slightly cramped position in exchange for a solid pawn structure.",
    trunk: ["e4", "e6", "d4", "d5"],
    variations: [
      { name: "Advance Variation", moves: ["e4","e6","d4","d5","e5","c5","c3","Nc6","Nf3","Qb6"] },
      { name: "Winawer Variation", moves: ["e4","e6","d4","d5","Nc3","Bb4","e5","c5","a3","Bxc3+","bxc3","Ne7"] },
      { name: "Classical Variation", moves: ["e4","e6","d4","d5","Nc3","Nf6","Bg5","Be7","e5","Nfd7"] },
      { name: "Tarrasch Variation", moves: ["e4","e6","d4","d5","Nd2","Nf6","e5","Nfd7","Bd3","c5","c3","Nc6"] },
      { name: "Exchange Variation", moves: ["e4","e6","d4","d5","exd5","exd5","Nf3","Nf6","Bd3","Bd6"] },
    ]
  },
  {
    id: "pirc",
    name: "Pirc Defense",
    eco: "B07-B09",
    color: "black",
    category: "Semi-Open",
    description: "Hypermodern defense. Black allows White a strong center then attacks it with pieces.",
    trunk: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"],
    variations: [
      { name: "Austrian Attack", moves: ["e4","d6","d4","Nf6","Nc3","g6","f4","Bg7","Nf3","O-O"] },
      { name: "Classical Variation", moves: ["e4","d6","d4","Nf6","Nc3","g6","Nf3","Bg7","Be2","O-O"] },
      { name: "150 Attack", moves: ["e4","d6","d4","Nf6","Nc3","g6","Be3","Bg7","Qd2","O-O","f3","c6"] },
    ]
  },

  // ── BLACK RESPONSES TO 1.d4 ───────────────────────────────────────────────
  {
    id: "kings-indian",
    name: "King's Indian Defense",
    eco: "E60-E99",
    color: "black",
    category: "Indian Defense",
    description: "Dynamic counterattacking defense. Black allows White a big center then strikes back with f5 or c5.",
    trunk: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6", "Nf3", "O-O", "Be2"],
    variations: [
      { name: "Classical Variation", moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Nf3","O-O","Be2","e5","O-O","Nc6","d5","Ne7"] },
      { name: "Samisch Variation", moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","f3","O-O","Be3","e5","d5","Nh5"] },
      { name: "Four Pawns Attack", moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","f4","O-O","Nf3","c5","d5","e6"] },
      { name: "Averbakh Variation", moves: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Be2","O-O","Bg5","h6","Be3","c5"] },
    ]
  },
  {
    id: "nimzo-indian",
    name: "Nimzo-Indian Defense",
    eco: "E20-E59",
    color: "black",
    category: "Indian Defense",
    description: "One of Black's most reliable defenses. Black pins the knight and gains positional concessions.",
    trunk: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
    variations: [
      { name: "Classical Variation", moves: ["d4","Nf6","c4","e6","Nc3","Bb4","Qc2","O-O","a3","Bxc3+","Qxc3","b6"] },
      { name: "Rubinstein Variation", moves: ["d4","Nf6","c4","e6","Nc3","Bb4","e3","O-O","Bd3","d5","Nf3","c5"] },
      { name: "Samisch Variation", moves: ["d4","Nf6","c4","e6","Nc3","Bb4","a3","Bxc3+","bxc3","O-O","f3","d5"] },
      { name: "Kasparov Variation", moves: ["d4","Nf6","c4","e6","Nc3","Bb4","Nf3","c5","g3","cxd4","Nxd4","O-O"] },
    ]
  },
  {
    id: "queens-gambit-declined",
    name: "Queen's Gambit Declined",
    eco: "D30-D69",
    color: "black",
    category: "Closed Game",
    description: "Classical and solid. Black declines the gambit pawn and fights for equality with sound development.",
    trunk: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"],
    variations: [
      { name: "Orthodox Defense", moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","e3","O-O","Nf3","Nbd7"] },
      { name: "Tartakower Variation", moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","e3","O-O","Nf3","b6"] },
      { name: "Cambridge Springs", moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Nbd7","e3","c6","Nf3","Qa5"] },
      { name: "Exchange Variation", moves: ["d4","d5","c4","e6","cxd5","exd5","Nc3","Nf6","Bg5","Be7","e3","O-O"] },
    ]
  },
  {
    id: "dutch",
    name: "Dutch Defense",
    eco: "A80-A99",
    color: "black",
    category: "Closed Game",
    description: "Aggressive response to 1.d4. Black immediately fights for kingside space.",
    trunk: ["d4", "f5"],
    variations: [
      { name: "Leningrad Variation", moves: ["d4","f5","c4","Nf6","g3","g6","Bg2","Bg7","Nf3","O-O","O-O","d6"] },
      { name: "Stonewall Variation", moves: ["d4","f5","c4","Nf6","g3","e6","Bg2","d5","Nf3","c6","O-O","Bd6"] },
      { name: "Classical Variation", moves: ["d4","f5","c4","Nf6","g3","e6","Bg2","Be7","Nf3","O-O","O-O","Ne4"] },
    ]
  },

  // ── WHITE OPENINGS ────────────────────────────────────────────────────────
  {
    id: "london",
    name: "London System",
    eco: "D02",
    color: "white",
    category: "Closed Game",
    description: "Solid and easy to learn system for White. Build with d4, Nf3, Bf4 regardless of Black's setup.",
    trunk: ["d4", "d5", "Nf3", "Nf6", "Bf4"],
    variations: [
      { name: "Main Line", moves: ["d4","d5","Nf3","Nf6","Bf4","e6","e3","Bd6","Bg3","O-O","Nbd2","c5"] },
      { name: "vs King's Indian Setup", moves: ["d4","Nf6","Nf3","g6","Bf4","Bg7","e3","O-O","Be2","d6","O-O","Nbd7"] },
      { name: "Jobava London", moves: ["d4","d5","Nc3","Nf6","Bf4","e6","e3","Bd6","Bg3","O-O","Nf3","c5"] },
    ]
  },
  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    eco: "D06-D69",
    color: "white",
    category: "Closed Game",
    description: "Classical opening. White offers a pawn to gain central control and active piece play.",
    trunk: ["d4", "d5", "c4"],
    variations: [
      { name: "Queen's Gambit Accepted", moves: ["d4","d5","c4","dxc4","Nf3","Nf6","e3","e6","Bxc4","c5","O-O","a6"] },
      { name: "QGD Orthodox", moves: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","e3","O-O","Nf3","Nbd7"] },
      { name: "Slav Defense", moves: ["d4","d5","c4","c6","Nf3","Nf6","Nc3","dxc4","a4","Bf5","e3","e6"] },
      { name: "Semi-Slav", moves: ["d4","d5","c4","c6","Nf3","Nf6","Nc3","e6","e3","Nbd7","Bd3","dxc4"] },
      { name: "Catalan Opening", moves: ["d4","d5","c4","e6","g3","Nf6","Bg2","Be7","Nf3","O-O","O-O","dxc4"] },
    ]
  },
  {
    id: "ruy-lopez",
    name: "Ruy Lopez (Spanish)",
    eco: "C60-C99",
    color: "white",
    category: "Open Game",
    description: "One of the oldest and most respected openings. White pressures the e5 pawn indirectly.",
    trunk: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    variations: [
      { name: "Morphy Defense", moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","O-O"] },
      { name: "Berlin Defense", moves: ["e4","e5","Nf3","Nc6","Bb5","Nf6","O-O","Nxe4","d4","Nd6","Bxc6","dxc6","dxe5","Nf5"] },
      { name: "Marshall Attack", moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","O-O","c3","d5"] },
      { name: "Chigorin Defense", moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","d6","c3","Na5"] },
      { name: "Exchange Variation", moves: ["e4","e5","Nf3","Nc6","Bb5","a6","Bxc6","dxc6","O-O","f6","d4","exd4","Nxd4","c5"] },
    ]
  },
  {
    id: "italian",
    name: "Italian Game",
    eco: "C50-C59",
    color: "white",
    category: "Open Game",
    description: "Classic and evergreen. White develops naturally and aims for a strong center.",
    trunk: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
    variations: [
      { name: "Giuoco Piano", moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d4","exd4","cxd4","Bb4+","Nc3","Nxe4"] },
      { name: "Two Knights Defense", moves: ["e4","e5","Nf3","Nc6","Bc4","Nf6","Ng5","d5","exd5","Na5","Bb5+","c6","dxc6","bxc6"] },
      { name: "Hungarian Defense", moves: ["e4","e5","Nf3","Nc6","Bc4","Be7","d4","exd4","Nxd4","Nf6","Nc3","O-O"] },
      { name: "Evans Gambit", moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4","Bxb4","c3","Ba5","d4","exd4","O-O"] },
    ]
  },
  {
    id: "kings-gambit",
    name: "King's Gambit",
    eco: "C30-C39",
    color: "white",
    category: "Open Game",
    description: "Aggressive gambit. White sacrifices a pawn for rapid development and a kingside attack.",
    trunk: ["e4", "e5", "f4"],
    variations: [
      { name: "King's Gambit Accepted", moves: ["e4","e5","f4","exf4","Nf3","g5","h4","g4","Ne5","Nf6","Bc4","d5"] },
      { name: "King's Gambit Declined", moves: ["e4","e5","f4","Bc5","Nf3","d6","Bc4","Nf6","d3","Nc6","O-O"] },
      { name: "Falkbeer Countergambit", moves: ["e4","e5","f4","d5","exd5","e4","d3","Nf6","dxe4","Nxe4","Nf3","Bc5"] },
    ]
  },
  {
    id: "scotch",
    name: "Scotch Game",
    eco: "C44-C45",
    color: "white",
    category: "Open Game",
    description: "Sharp and direct. White immediately challenges the center with d4.",
    trunk: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"],
    variations: [
      { name: "Classical Variation", moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Bc5","Be3","Qf6","c3","Nge7"] },
      { name: "Scotch Gambit", moves: ["e4","e5","Nf3","Nc6","d4","exd4","Bc4","Bc5","c3","Nf6","cxd4","Bb4+"] },
      { name: "Four Knights Variation", moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nc3","Bb4","Nxc6","bxc6"] },
      { name: "Mieses Variation", moves: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nxc6","bxc6","e5","Qe7","Qe2","Nd5"] },
    ]
  },
  {
    id: "english",
    name: "English Opening",
    eco: "A10-A39",
    color: "white",
    category: "Flank Opening",
    description: "Flexible flank opening. White controls d5 and can transpose into many systems.",
    trunk: ["c4"],
    variations: [
      { name: "Symmetrical Variation", moves: ["c4","c5","Nf3","Nf6","Nc3","Nc6","g3","g6","Bg2","Bg7","O-O","O-O","d4"] },
      { name: "vs King's Indian", moves: ["c4","Nf6","Nc3","g6","g3","Bg7","Bg2","O-O","Nf3","d6","O-O","e5"] },
      { name: "Reversed Sicilian", moves: ["c4","e5","Nc3","Nf6","g3","d5","cxd5","Nxd5","Bg2","Nb6","Nf3","Nc6"] },
      { name: "Four Knights", moves: ["c4","e5","Nc3","Nf6","Nf3","Nc6","g3","d5","cxd5","Nxd5","Bg2","Nb6"] },
    ]
  },
  {
    id: "kings-indian-attack",
    name: "King's Indian Attack",
    eco: "A07-A08",
    color: "white",
    category: "Flank Opening",
    description: "System opening for White. Play Nf3, g3, Bg2, O-O regardless of Black's setup.",
    trunk: ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3", "O-O", "Nbd2"],
    variations: [
      { name: "vs French Setup", moves: ["Nf3","d5","g3","c5","Bg2","Nc6","O-O","e6","d3","Nf6","Nbd2","Be7","e4"] },
      { name: "vs Sicilian Setup", moves: ["e4","c5","Nf3","e6","d3","Nc6","g3","d5","Bg2","Nf6","O-O","Be7","Nbd2"] },
    ]
  },
];

export const CATEGORIES = [...new Set(LIBRARY_OPENINGS.map(o => o.category))];
export const COLORS = ["white", "black", "both"] as const;
