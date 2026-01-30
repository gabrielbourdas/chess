// --- CONFIGURATION ---
var board = null;
var game = new Chess();
var fullGame = new Chess(); // Sert de mémoire pour toute la partie
var currentMoveIndex = -1; // -1 = début, 0 = 1er coup, etc.
var allMoves = []; // Stocke tous les coups (objets move)
var engine = null;
var boardOrientation = "white";
const STOCKFISH_PATH = "../js/stockfish.js"; // Chemin corrigé
const PIECE_PATH = "../../img/wiki/{piece}.png";

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  initEngine();
  initBoard("start");

  document.getElementById("btn-load-pgn").addEventListener("click", loadPGN);
  document
    .getElementById("btn-prev")
    .addEventListener("click", () => navigate("prev"));
  document
    .getElementById("btn-next")
    .addEventListener("click", () => navigate("next"));
  document
    .getElementById("btn-start")
    .addEventListener("click", () => navigate("start"));
  document
    .getElementById("btn-end")
    .addEventListener("click", () => navigate("end"));
  document.getElementById("btn-flip").addEventListener("click", flipBoard);
  document.getElementById("btn-reset").addEventListener("click", resetAnalysis);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") navigate("prev");
    if (e.key === "ArrowRight") navigate("next");
  });
});

// --- BOARD ---
function initBoard(fen) {
  if (board) board.destroy();

  var config = {
    position: fen,
    draggable: true,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: () => board.position(game.fen()),
    orientation: boardOrientation,
    pieceTheme: PIECE_PATH,
  };

  board = Chessboard("board", config);
  initArrowsLayer();

  window.addEventListener("resize", board.resize);
  setTimeout(board.resize, 200);
}

function onDragStart(source, piece) {
  if (game.game_over()) return false;
  return true;
}

function onDrop(source, target) {
  if (source === target) return;

  // Si on joue un coup manuellement, on "coupe" l'historique futur
  // et on ajoute ce nouveau coup
  let move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return "snapback";

  // Mise à jour de l'historique global
  allMoves = game.history();
  currentMoveIndex = allMoves.length - 1;

  startAnalysis();
  updateHistoryUI();
}

function flipBoard() {
  boardOrientation = boardOrientation === "white" ? "black" : "white";
  board.orientation(boardOrientation);
  startAnalysis();
}

function resetAnalysis() {
  game.reset();
  fullGame.reset();
  allMoves = [];
  currentMoveIndex = -1;
  board.position("start");
  updateHistoryUI();
  clearArrows();
  updateFeedbackUI(0, false, null, "Prêt à analyser.");
}

// --- LOGIQUE PGN ---
function loadPGN() {
  const pgn = document.getElementById("pgn-input").value;

  // On charge dans l'objet "mémoire"
  if (!fullGame.load_pgn(pgn)) {
    if (fullGame.load(pgn)) {
      // Support FEN
      game.load(pgn);
      allMoves = []; // FEN n'a pas d'historique
      currentMoveIndex = -1;
      board.position(game.fen());
      startAnalysis();
      return;
    }
    alert("PGN ou FEN Invalide.");
    return;
  }

  // On récupère tous les coups
  allMoves = fullGame.history();

  // On remet le jeu "actif" à zéro pour commencer l'analyse du début
  game.reset();
  currentMoveIndex = -1;

  board.position("start");
  updateHistoryUI();
  startAnalysis();
  updateFeedbackUI(0, false, null, "PGN Chargé. Utilisez les flèches.");
}

// --- NAVIGATION (SANS PERTE D'HISTORIQUE) ---
function navigate(direction) {
  if (allMoves.length === 0) return;

  if (direction === "next") {
    // Avancer : On joue le coup suivant stocké dans allMoves
    if (currentMoveIndex < allMoves.length - 1) {
      currentMoveIndex++;
      game.move(allMoves[currentMoveIndex]);
    }
  } else if (direction === "prev") {
    // Reculer : On annule le coup dans l'objet game (mais allMoves reste intact)
    if (currentMoveIndex >= 0) {
      game.undo();
      currentMoveIndex--;
    }
  } else if (direction === "start") {
    game.reset();
    currentMoveIndex = -1;
  } else if (direction === "end") {
    // Avancer jusqu'au bout
    while (currentMoveIndex < allMoves.length - 1) {
      currentMoveIndex++;
      game.move(allMoves[currentMoveIndex]);
    }
  }

  board.position(game.fen());
  highlightHistory();
  startAnalysis();
}

function updateHistoryUI() {
  const container = document.getElementById("move-history");
  let html = "";

  // On affiche toujours l'historique complet (allMoves) s'il existe, sinon celui du jeu
  let displayMoves = allMoves.length > 0 ? allMoves : game.history();

  for (let i = 0; i < displayMoves.length; i += 2) {
    const num = i / 2 + 1;
    html += `<div class="history-row">
                    <span class="move-num">${num}.</span>
                    <span class="move-val" id="move-${i}">${displayMoves[i]}</span>
                    <span class="move-val" id="move-${i + 1}">${displayMoves[i + 1] || ""}</span>
                 </div>`;
  }
  container.innerHTML = html;

  // Scroll auto vers le bas si on ajoute
  highlightHistory();
}

function highlightHistory() {
  // Reset styles
  document.querySelectorAll(".move-val").forEach((el) => {
    el.style.fontWeight = "normal";
    el.style.color = "#ccc";
    el.style.background = "transparent";
  });

  // Highlight current
  if (currentMoveIndex >= 0) {
    const el = document.getElementById(`move-${currentMoveIndex}`);
    if (el) {
      el.style.fontWeight = "bold";
      el.style.color = "#fff";
      el.style.background = "rgba(212, 175, 55, 0.4)"; // Gold transparent
      el.style.borderRadius = "3px";
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

// --- MOTEUR STOCKFISH & ANALYSE ---
function initEngine() {
  if (typeof Worker !== "undefined") {
    engine = new Worker(STOCKFISH_PATH);
    engine.postMessage("uci");
    engine.onmessage = function (event) {
      parseEngineMessage(event.data);
    };
  }
}

function startAnalysis() {
  if (!engine) return;
  clearArrows();
  document.getElementById("engine-text").innerText = "Analyse en cours...";
  document.getElementById("analysis-badge").className = "move-badge badge-info";
  document.getElementById("analysis-badge").innerText = "...";

  engine.postMessage("stop");
  engine.postMessage("position fen " + game.fen());
  engine.postMessage("go depth 18");
}

function parseEngineMessage(line) {
  if (
    line.startsWith("info") &&
    line.includes("score") &&
    line.includes("pv")
  ) {
    let score = 0;
    let isMate = false;

    if (line.includes("mate")) {
      isMate = true;
      const match = line.match(/score mate ([\-\d]+)/);
      score = match ? parseInt(match[1]) : 0;
    } else {
      const match = line.match(/score cp ([\-\d]+)/);
      score = match ? parseInt(match[1]) : 0;
    }

    let bestMoveUCI = "";
    const pvIndex = line.indexOf(" pv ");
    if (pvIndex !== -1) {
      const parts = line.substring(pvIndex + 4).split(" ");
      bestMoveUCI = parts[0];
    }

    updateFeedbackUI(score, isMate, bestMoveUCI);
  }
}

function uciToSan(uciMove) {
  if (!uciMove) return "";
  const tempGame = new Chess(game.fen());
  const move = tempGame.move({
    from: uciMove.substring(0, 2),
    to: uciMove.substring(2, 4),
    promotion: "q",
  });
  return move ? move.san : uciMove;
}

function updateFeedbackUI(score, isMate, bestMoveUCI, customText = null) {
  let percent = 50;

  if (isMate) {
    percent = score > 0 ? 100 : 0;
  } else {
    let visualScore = Math.max(-500, Math.min(500, score));
    percent = 50 + visualScore / 10;
  }

  document.getElementById("eval-fill").style.height = `${percent}%`;
  let rawScore = isMate ? "M" + Math.abs(score) : (score / 100).toFixed(2);
  if (!isMate && score > 0) rawScore = "+" + rawScore;

  if (percent >= 50) {
    document.getElementById("eval-score").innerText = "";
    document.querySelector(".eval-text.bottom").innerText = rawScore;
  } else {
    document.getElementById("eval-score").innerText = rawScore;
    document.querySelector(".eval-text.bottom").innerText = "";
  }

  if (customText) {
    document.getElementById("engine-text").innerText = customText;
    return;
  }

  const bestMoveSAN = uciToSan(bestMoveUCI);
  drawArrow(bestMoveUCI);

  let title = "";
  let description = "";
  let badgeClass = "badge-info";
  let badgeLabel = "Info";

  let absScore = game.turn() === "w" ? score : -score;
  if (isMate)
    absScore =
      game.turn() === "w"
        ? score > 0
          ? 9999
          : -9999
        : score > 0
          ? -9999
          : 9999;

  if (isMate) {
    if (absScore > 0) {
      title = "Victoire Blanche Imminente";
      description = `Les Blancs ont un mat en ${Math.abs(score)} coups.`;
      badgeClass = "badge-best";
      badgeLabel = "Mat";
    } else {
      title = "Victoire Noire Imminente";
      description = `Les Noirs ont un mat en ${Math.abs(score)} coups.`;
      badgeClass = "badge-blunder";
      badgeLabel = "Danger";
    }
  } else {
    const val = Math.abs(absScore);
    if (val < 50) {
      title = "Égalité parfaite";
      description = "La position est équilibrée.";
      badgeClass = "badge-info";
      badgeLabel = "Nulle";
    } else if (val < 120) {
      title = "Léger avantage";
      description =
        absScore > 0 ? "Les Blancs sont mieux." : "Les Noirs sont mieux.";
      badgeClass = "badge-good";
      badgeLabel = "+ / =";
    } else if (val < 300) {
      title = "Avantage net";
      description =
        absScore > 0 ? "Les Blancs dominent." : "Les Noirs dominent.";
      badgeClass = "badge-good";
      badgeLabel = "+ / -";
    } else {
      title = "Avantage Décisif";
      description =
        absScore > 0 ? "Les Blancs sont gagnants." : "Les Noirs sont gagnants.";
      badgeClass = "badge-best";
      badgeLabel = "+ -";
    }
  }

  document.getElementById("analysis-badge").className =
    `move-badge ${badgeClass}`;
  document.getElementById("analysis-badge").innerText = badgeLabel;

  document.getElementById("engine-text").innerHTML = `
        <div style="font-weight:bold; font-size:1rem; margin-bottom:4px;">${title}</div>
        <div style="font-size:0.9rem; color:#bbb; margin-bottom:8px;">${description}</div>
        <div class="best-move-line">
            Suggestion : <span class="best-move-highlight">${bestMoveSAN}</span>
        </div>
    `;
}

// --- FLÈCHES (SVG) ---
function initArrowsLayer() {
  let svg = document.getElementById("arrow-overlay");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker",
  );
  marker.setAttribute("id", "arrowhead-blue");
  marker.setAttribute("markerWidth", "4");
  marker.setAttribute("markerHeight", "4");
  marker.setAttribute("refX", "2");
  marker.setAttribute("refY", "2");
  marker.setAttribute("orient", "auto");
  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  polygon.setAttribute("points", "0 0, 4 2, 0 4");
  polygon.setAttribute("fill", "#3498db");
  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);
}

function drawArrow(uciMove) {
  clearArrows();
  if (!uciMove) return;
  const from = uciMove.substring(0, 2);
  const to = uciMove.substring(2, 4);
  const s = getSquareCenter(from);
  const e = getSquareCenter(to);

  const svg = document.getElementById("arrow-overlay");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", s.x + "%");
  line.setAttribute("y1", s.y + "%");
  line.setAttribute("x2", e.x + "%");
  line.setAttribute("y2", e.y + "%");
  line.setAttribute("stroke", "#3498db");
  line.setAttribute("stroke-width", "3.5");
  line.setAttribute("opacity", "0.8");
  line.setAttribute("marker-end", "url(#arrowhead-blue)");
  svg.appendChild(line);
}

function clearArrows() {
  const svg = document.getElementById("arrow-overlay");
  while (svg.lastChild && svg.lastChild.tagName !== "defs") {
    svg.removeChild(svg.lastChild);
  }
}

function getSquareCenter(square) {
  const files = "abcdefgh";
  const ranks = "12345678";
  let f = files.indexOf(square[0]);
  let r = ranks.indexOf(square[1]);
  const half = 6.25;
  let x, y;
  if (boardOrientation === "white") {
    x = f * 12.5 + half;
    y = 100 - (r * 12.5 + half);
  } else {
    x = 100 - (f * 12.5 + half);
    y = r * 12.5 + half;
  }
  return { x, y };
}
