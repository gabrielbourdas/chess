// data.js
const puzzlesData = [
  // --- MATS (Category: 'mat') ---
  {
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    moves: ["Qxf7#"],
    color: "w",
    category: "mat",
  },
  {
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["Re8#"],
    color: "w",
    category: "mat",
  },
  {
    fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR b KQkq - 1 2",
    moves: ["Qh4#"],
    color: "b",
    category: "mat",
  },

  // --- MATÉRIEL (Category: 'material') ---
  {
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    moves: ["cxd4", "Nxd4"], // Capture simple
    color: "b",
    category: "material",
  },
  {
    fen: "rn1qkbnr/pbpp1ppp/1p6/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
    moves: ["Bxf7+", "Kxf7", "Nxe5+"], // Sacrifice et attaque
    color: "w",
    category: "material",
  },

  // --- DÉFENSE (Category: 'defense') ---
  {
    fen: "r1bqk2r/pppp1ppp/2n2n2/4p3/1b2P3/3P1N2/PPP1BPPP/RNBQK2R w KQkq - 1 5",
    moves: ["Bd2"], // Parer l'échec
    color: "w",
    category: "defense",
  },
  {
    fen: "r3k2r/ppp2ppp/2n2n2/3q4/3P4/2P2B2/P4PPP/R1BQK2R b KQkq - 0 10",
    moves: ["Qc4"], // Fuite active de la dame
    color: "b",
    category: "defense",
  },

  // --- POSITION (Category: 'position') ---
  {
    fen: "r2q1rk1/1pp1bppp/p1n2n2/3p4/3P2b1/P1N1PN2/1P2BPPP/R1BQ1RK1 w - - 0 10",
    moves: ["b4"], // Expansion à l'aile dame
    color: "w",
    category: "position",
  },
];
