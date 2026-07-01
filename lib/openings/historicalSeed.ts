export interface SeedGame {
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  eco: string;
  openingName: string;
  pgn: string;
}

export const HISTORICAL_SEED_GAMES: SeedGame[] = [
  {
    white: "Kasparov, Garry",
    black: "Topalov, Veselin",
    event: "Hoogovens",
    date: "1999",
    result: "1-0",
    eco: "B06",
    openingName: "Pirc Defense",
    pgn: `1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`,
  },
  {
    white: "Fischer, Robert James",
    black: "Byrne, Donald",
    event: "Rosenwald Memorial",
    date: "1956",
    result: "1-0",
    eco: "D92",
    openingName: "Grünfeld Defense",
    pgn: `1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`,
  },
  {
    white: "Tal, Mikhail",
    black: "Smyslov, Vasily",
    event: "Candidates Tournament",
    date: "1959",
    result: "1-0",
    eco: "B10",
    openingName: "Caro-Kann Defense",
    pgn: `1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nf6 5. Nxf6+ exf6 6. Nf3 Bd6 7. Bd3 O-O 8. O-O Re8 9. Nh4 Bg4 10. Qd2 Bxh4 11. Qxh4 ... 1-0`,
  },
  {
    white: "Carlsen, Magnus",
    black: "Caruana, Fabiano",
    event: "World Championship",
    date: "2018",
    result: "1/2-1/2",
    eco: "C84",
    openingName: "Ruy Lopez, Closed",
    pgn: `1. c4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. Ndb5 Bxc3+ 7. Nxc3 O-O 8. Bg5 d5 9. e3 Bf5 10. Be2 h6 11. Bxf6 Qxf6 12. cxd5 Rad8 13. Qa4 Rxd5 14. Nxd5 Qe5 15. Bf3 Qxd5 16. Qb3 Qd6 17. O-O Rd8 18. Rfd1 Qf6 19. Rab1 Rxd1+ 20. Rxd1 Na5 21. Qb4 c6 22. Qxa5 Bxb1 23. Qxa7 Bf5 24. Qb6 Bd3 1/2-1/2`,
  },
  {
    white: "Capablanca, Jose Raul",
    black: "Marshall, Frank",
    event: "New York",
    date: "1909",
    result: "1-0",
    eco: "C49",
    openingName: "Four Knights Game",
    pgn: `1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bb5 Bb4 5. O-O O-O 6. d3 d6 7. Bg5 Bxc3 8. bxc3 Qe7 9. Re1 Nd8 10. d4 Bg4 11. Be2 Bxf3 12. Bxf3 Ne6 13. Be3 c6 14. Qd3 Rd8 15. Rad1 d5 16. exd5 cxd5 17. c4 dxc4 18. Bxc4 Nxd4 19. Bxd4 exd4 20. Rxd4 Rxd4 21. Qxd4 Nd7 22. Bxa7 b6 23. Be3 Rc8 24. Qd2 Nc5 25. Qxd... 1-0`,
  },
];
