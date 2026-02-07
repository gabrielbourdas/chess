// --- CONFIGURATION ---
var board = null;
var game = new Chess();
var fullGame = new Chess();
var currentMoveIndex = -1;
var allMoves = [];
var engine = null;
var boardOrientation = "white";
var currentAnalysis = {
  score: 0,
  isMate: false,
  bestMove: null,
  isRevealed: false,
};
var selectedSquare = null; // Important pour le Click-to-Move

const STOCKFISH_PATH = "../js/stockfish.js";
const PIECE_PATH = "../../img/wiki/{piece}.png";

const PIECE_NAMES = {
  p: "un Pion",
  n: "un Cavalier",
  b: "un Fou",
  r: "une Tour",
  q: "la Dame",
  k: "le Roi",
};

// --- SYSTÈME AUDIO ---
const sounds = {
  move: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
  ),
  capture: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
  ),
  check: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericNotify.mp3",
  ),
  mate: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Victory.mp3",
  ),
  error: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Error.mp3",
  ),
};

function playMoveSound(move) {
  if (game.in_checkmate()) {
    sounds.mate.play().catch(() => {});
    return;
  }
  if (game.in_check()) {
    sounds.check.play().catch(() => {});
    return;
  }
  if (move.flags.includes("c") || move.flags.includes("e")) {
    sounds.capture.play().catch(() => {});
    return;
  }
  sounds.move.play().catch(() => {});
}

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  initEngine();
  initBoard("start");

  // Boutons Navigation
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

  // Clavier
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") navigate("prev");
    if (e.key === "ArrowRight") navigate("next");
  });

  // Mode Coach
  const feedbackBox = document.getElementById("feedback-box");
  feedbackBox.addEventListener("click", (e) => {
    if (e.target.id === "btn-reveal-hint") revealAnalysis();
    if (e.target.id === "btn-try-self") enableSelfMode();
  });

  // Déblocage Audio
  document.body.addEventListener(
    "click",
    () => {
      sounds.move
        .play()
        .then(() => {
          sounds.move.pause();
          sounds.move.currentTime = 0;
        })
        .catch(() => {});
    },
    { once: true },
  );
});

// --- BOARD & CLICK-TO-MOVE ---
function initBoard(fen) {
  if (board) board.destroy();

  // Configuration pour une analyse libre (pas de restriction onDragStart)
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

  // Écouteur de clic corrigé (jQuery pour compatibilité max)
  $("#board").on("click", "[data-square]", function (e) {
    // On récupère directement la case cliquée via l'attribut data-square
    const square = $(this).data("square");
    handleSquareClick(square);
  });

  initArrowsLayer();
  window.addEventListener("resize", board.resize);
  setTimeout(board.resize, 200);
}

// LOGIQUE DE SÉLECTION
function handleSquareClick(square) {
  const piece = game.get(square);
  const turn = game.turn(); // 'w' ou 'b'

  // 1. Clic sur une pièce de la couleur du trait : SÉLECTIONNER
  if (piece && piece.color === turn) {
    if (selectedSquare === square) {
      removeSelection(); // Désélectionner
    } else {
      highlightSquare(square); // Sélectionner
    }
    return;
  }

  // 2. Si une pièce est déjà sélectionnée : TENTER LE COUP
  if (selectedSquare) {
    const moveResult = makeMove(selectedSquare, square);
    if (moveResult === "snapback") {
      // Coup invalide ? On regarde si on a cliqué sur une autre pièce à nous
      if (piece && piece.color === turn) {
        highlightSquare(square);
      } else {
        removeSelection();
      }
    }
  }
}

// GESTION VISUELLE (CORRIGÉE : Utilise [data-square])
function highlightSquare(square) {
  removeSelection();
  selectedSquare = square;

  // Ajoute la classe 'selected-square' à la div de la case
  $('#board [data-square="' + square + '"]').addClass("selected-square");

  // Affiche les points sur les destinations
  const moves = game.moves({ square: square, verbose: true });
  moves.forEach((move) => {
    const $target = $('#board [data-square="' + move.to + '"]');
    if (move.flags.includes("c") || move.flags.includes("e")) {
      $target.addClass("capture-hint");
    } else {
      $target.addClass("move-hint");
    }
  });
}

function removeSelection() {
  selectedSquare = null;
  $("#board .selected-square").removeClass("selected-square");
  $("#board .move-hint").removeClass("move-hint");
  $("#board .capture-hint").removeClass("capture-hint");
}

// --- LOGIQUE DE MOUVEMENT (Libre) ---
function makeMove(source, target) {
  // Tentative de coup
  let move = game.move({ from: source, to: target, promotion: "q" });

  if (move === null) return "snapback";

  // Si coup valide
  board.position(game.fen());
  removeSelection();
  playMoveSound(move);

  // Mise à jour historique
  allMoves = game.history();
  currentMoveIndex = allMoves.length - 1;

  // Mise à jour UI
  updatePGN();
  startAnalysis();

  return "success";
}

// --- CALLBACKS DRAG & DROP ---
function onDragStart(source, piece) {
  if (game.game_over()) return false;

  // En mode analyse, on autorise le mouvement seulement pour la couleur du trait
  // (Sinon ça crée des bugs de logique avec chess.js)
  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
  return true;
}

function onDrop(source, target) {
  if (source === target) {
    handleSquareClick(source); // Clic via Drag
    return;
  }
  return makeMove(source, target);
}

// --- FONCTIONS EXISTANTES ---

function flipBoard() {
  boardOrientation = boardOrientation === "white" ? "black" : "white";
  board.orientation(boardOrientation);
  if (currentAnalysis.isRevealed && currentAnalysis.bestMove) {
    drawArrow(currentAnalysis.bestMove);
  }
}

function resetAnalysis() {
  game.reset();
  fullGame.reset();
  allMoves = [];
  currentMoveIndex = -1;
  board.position("start");
  updatePGN();
  clearArrows();
  removeSelection();
  resetFeedbackUI();
}

function updatePGN() {
  const pgnEl = document.getElementById("pgn-input");
  if (pgnEl) {
    pgnEl.value = game.pgn();
    pgnEl.scrollTop = pgnEl.scrollHeight;
  }
}

function loadPGN() {
  const pgn = document.getElementById("pgn-input").value;
  if (!fullGame.load_pgn(pgn)) {
    if (fullGame.load(pgn)) {
      game.load(pgn);
      allMoves = [];
      currentMoveIndex = -1;
      board.position(game.fen());
      updatePGN();
      startAnalysis();
      return;
    }
    alert("PGN Invalide");
    return;
  }
  allMoves = fullGame.history();
  game.reset();
  currentMoveIndex = -1;
  board.position("start");
  updatePGN();
  startAnalysis();
}

function navigate(direction) {
  if (allMoves.length === 0) return;

  let move = null;
  if (direction === "next") {
    if (currentMoveIndex < allMoves.length - 1) {
      currentMoveIndex++;
      move = game.move(allMoves[currentMoveIndex]);
    }
  } else if (direction === "prev") {
    if (currentMoveIndex >= 0) {
      game.undo();
      currentMoveIndex--;
    }
  } else if (direction === "start") {
    game.reset();
    currentMoveIndex = -1;
  } else if (direction === "end") {
    while (currentMoveIndex < allMoves.length - 1) {
      currentMoveIndex++;
      game.move(allMoves[currentMoveIndex]);
    }
  }

  board.position(game.fen());
  if (move && direction === "next") playMoveSound(move);

  updatePGN();
  startAnalysis();
}

function initEngine() {
  if (typeof Worker !== "undefined") {
    engine = new Worker(STOCKFISH_PATH);
    engine.postMessage("uci");
    engine.onmessage = (e) => parseEngineMessage(e.data);
  }
}

function startAnalysis() {
  if (!engine) return;
  clearArrows();
  currentAnalysis = {
    score: 0,
    isMate: false,
    bestMove: null,
    isRevealed: false,
  };

  // Détection de fin de partie
  if (game.game_over()) {
    handleGameOverAnalysis();
    return;
  }

  document.getElementById("engine-text").innerHTML = `
    <div style="text-align:center; padding: 10px; color:#aaa;">
      <span class="spinner">⏳</span> Analyse en cours...
    </div>
  `;
  document.getElementById("analysis-badge").className = "move-badge badge-info";
  document.getElementById("analysis-badge").innerText = "...";

  engine.postMessage("stop");
  engine.postMessage("position fen " + game.fen());
  engine.postMessage("go depth 18");
}

function handleGameOverAnalysis() {
  let title = "Partie Terminée";
  let desc = "";
  let badgeClass = "badge-info";
  let badgeLabel = "Fin";

  if (game.in_checkmate()) {
    const winner = game.turn() === "w" ? "Les Noirs" : "Les Blancs";
    title = `Échec et Mat !`;
    desc = `${winner} remportent la victoire.`;
    badgeClass = "badge-best";
    badgeLabel = "Mat";
    currentAnalysis.score = game.turn() === "w" ? -9999 : 9999;
    currentAnalysis.isMate = true;
  } else if (game.in_draw()) {
    title = "Match Nul";
    desc = "Pat, répétition ou matériel insuffisant.";
    currentAnalysis.score = 0;
  }

  updateEvalBar(currentAnalysis.score, currentAnalysis.isMate);

  const badge = document.getElementById("analysis-badge");
  badge.className = `move-badge ${badgeClass}`;
  badge.innerText = badgeLabel;

  document.getElementById("engine-text").innerHTML = `
    <div style="font-weight:bold; font-size:1rem; margin-bottom:2px; color:#ffd700;">${title}</div>
    <div style="font-size:0.85rem; color:#ccc; margin-bottom:12px;">${desc}</div>
  `;
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

    if (game.turn() === "b") {
      score = -score;
    }

    const pvIndex = line.indexOf(" pv ");
    if (pvIndex === -1) return;
    const bestMoveUCI = line.substring(pvIndex + 4).split(" ")[0];

    currentAnalysis.score = score;
    currentAnalysis.isMate = isMate;
    currentAnalysis.bestMove = bestMoveUCI;

    updateFeedbackUI();
  }
}

function updateFeedbackUI() {
  const { score, isMate, bestMove, isRevealed } = currentAnalysis;
  updateEvalBar(score, isMate);
  const positionEval = generatePositionEval(score, isMate);

  const badge = document.getElementById("analysis-badge");
  badge.className = `move-badge ${positionEval.badgeClass}`;
  badge.innerText = positionEval.badgeLabel;

  let contentHTML = `
    <div style="font-weight:bold; font-size:1rem; margin-bottom:2px; color:#ffd700;">${positionEval.title}</div>
    <div style="font-size:0.85rem; color:#ccc; margin-bottom:12px;">${positionEval.desc}</div>
  `;

  if (isRevealed) {
    const bestMoveSAN = uciToSan(bestMove);
    const explanation = generateMoveExplanation(bestMove);
    contentHTML += `
      <div class="best-move-line" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:10px; animation:fadeIn 0.3s;">
        <span style="color:#aaa; font-size:0.8rem;">CONSEIL DU ROBOT :</span><br>
        <span class="best-move-highlight" style="font-size:1.2rem; color:#fff;">${bestMoveSAN}</span>
        <div style="color:#2ecc71; font-size:0.95rem; margin-top:4px; line-height:1.4;">
          👉 ${explanation}
        </div>
      </div>
    `;
    drawArrow(bestMove);
  } else {
    contentHTML += `
      <div style="margin-top:5px;">
        <button id="btn-reveal-hint" class="btn-game primary small" style="width:100%; padding:10px;">
          💡 Voir le meilleur coup
        </button>
      </div>
    `;
    clearArrows();
  }
  const container = document.getElementById("engine-text");
  container.innerHTML = contentHTML;
}

function revealAnalysis() {
  if (!currentAnalysis || !currentAnalysis.bestMove) return;
  currentAnalysis.isRevealed = true;
  updateFeedbackUI();
}

function enableSelfMode() {
  document.getElementById("engine-text").innerHTML = `
    <div style="text-align:center; padding:15px; color:#96c93d; font-style:italic;">
      À vous de jouer ! Faites un coup sur le plateau.
    </div>
  `;
}

function generateMoveExplanation(uciMove) {
  const tempGame = new Chess(game.fen());
  const move = tempGame.move({
    from: uciMove.substring(0, 2),
    to: uciMove.substring(2, 4),
    promotion: "q",
  });
  if (!move) return "Améliore la position.";
  let actions = [];
  if (move.flags.includes("c") || move.flags.includes("e")) {
    const pieceName = PIECE_NAMES[move.captured] || "une pièce";
    actions.push(`Capture <b>${pieceName}</b>`);
  }
  if (move.flags.includes("p")) actions.push("Promeut en Dame");
  if (tempGame.in_checkmate()) actions.push("Mène au <b>Mat</b> (Victoire)");
  else if (tempGame.in_check()) actions.push("Met le Roi en <b>Échec</b>");
  if (move.flags.includes("k") || move.flags.includes("q"))
    actions.push("Met le Roi en sécurité (Roque)");
  if (actions.length === 0) return "Coup positionnel ou de développement.";
  return actions.join(" et ");
}

function generatePositionEval(score, isMate) {
  const engineEval = score / 100;
  const absScore = Math.abs(engineEval);
  const isWhiteAdvantage = score > 0;
  const leader = isWhiteAdvantage ? "Les Blancs" : "Les Noirs";

  if (isMate) {
    return {
      title: `Mat en ${Math.abs(score)}`,
      desc: `${leader} ont une victoire forcée.`,
      badgeClass: isWhiteAdvantage ? "badge-best" : "badge-blunder",
      badgeLabel: "Mat",
    };
  }
  if (absScore < 0.8) {
    return {
      title: "Égalité",
      desc: "Position équilibrée.",
      badgeClass: "badge-info",
      badgeLabel: "=",
    };
  }
  let type =
    absScore < 1.5
      ? "Léger avantage"
      : absScore < 4
        ? "Net avantage"
        : "Avantage gagnant";
  const matScore = getMaterialBalance(game.fen());
  const diff = Math.abs(engineEval - matScore);
  let reason = "positionnel (meilleure activité).";
  if (diff < 1.0 && Math.abs(matScore) >= 1)
    reason = "matériel (pièces en plus).";
  else if (diff > 2.0) reason = "décisif (attaque gagnante).";

  return {
    title: `${type} ${isWhiteAdvantage ? "Blanc" : "Noir"}`,
    desc: `${leader} mènent grâce à un avantage ${reason}`,
    badgeClass: "badge-good",
    badgeLabel: score > 0 ? "+ / -" : "- / +",
  };
}

function getMaterialBalance(fen) {
  const p = { p: 1, n: 3, b: 3, r: 5, q: 9, P: 1, N: 3, B: 3, R: 5, Q: 9 };
  let score = 0;
  const str = fen.split(" ")[0];
  for (let c of str) {
    if (p[c]) {
      if (c === c.toUpperCase()) score += p[c];
      else score -= p[c];
    }
  }
  return score;
}

function updateEvalBar(score, isMate) {
  let percent = 50;
  if (isMate) percent = score > 0 ? 100 : 0;
  else {
    let visual = Math.max(-500, Math.min(500, score));
    percent = 50 + visual / 10;
  }
  document.getElementById("eval-fill").style.height = `${percent}%`;
  let txt = isMate ? "M" + Math.abs(score) : (score / 100).toFixed(1);
  if (!isMate && score > 0) txt = "+" + txt;
  if (percent >= 50) {
    document.getElementById("eval-score").innerText = "";
    document.querySelector(".eval-text.bottom").innerText = txt;
  } else {
    document.getElementById("eval-score").innerText = txt;
    document.querySelector(".eval-text.bottom").innerText = "";
  }
}

function resetFeedbackUI() {
  document.getElementById("engine-text").innerText =
    "En attente d'une position...";
  document.getElementById("analysis-badge").className = "move-badge badge-info";
  document.getElementById("analysis-badge").innerText = "Info";
  document.getElementById("eval-fill").style.height = "50%";
  document.getElementById("eval-score").innerText = "0.0";
}

function uciToSan(uci) {
  if (!uci) return "";
  const t = new Chess(game.fen());
  const m = t.move({
    from: uci.substring(0, 2),
    to: uci.substring(2, 4),
    promotion: "q",
  });
  return m ? m.san : uci;
}

function initArrowsLayer() {
  const boardEl = document.getElementById("board");
  if (!boardEl || document.getElementById("arrow-overlay")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("id", "arrow-overlay");
  svg.setAttribute("class", "arrow-overlay");
  svg.setAttribute("viewBox", "0 0 100 100");
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
  const poly = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  poly.setAttribute("points", "0 0, 4 2, 0 4");
  poly.setAttribute("fill", "#3498db");
  marker.appendChild(poly);
  defs.appendChild(marker);
  svg.appendChild(defs);
  boardEl.appendChild(svg);
}

function drawArrow(uci) {
  clearArrows();
  if (!uci) return;
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
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
  if (svg) {
    while (svg.lastChild && svg.lastChild.tagName !== "defs") {
      svg.removeChild(svg.lastChild);
    }
  }
}

function getSquareCenter(square) {
  const files = "abcdefgh";
  const ranks = "12345678";
  let f = files.indexOf(square[0]);
  let r = ranks.indexOf(square[1]);
  let x, y;
  if (boardOrientation === "white") {
    x = f * 12.5 + 6.25;
    y = 100 - (r * 12.5 + 6.25);
  } else {
    x = 100 - (f * 12.5 + 6.25);
    y = r * 12.5 + 6.25;
  }
  return { x, y };
}
