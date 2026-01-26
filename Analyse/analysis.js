// analysis.js - Version Corrigée (CDN Images + Analyse Partie Complète)

var board = null;
var game = new Chess();
var stockfish = null;
var isEngineReady = false;
var bestMoveArrow = null;

// Variables pour l'analyse de partie (Replay)
var fullGameMoves = [];
var currentMoveIndex = -1; // -1 = Position de départ

// --- 1. INITIALISATION STOCKFISH ---
try {
  stockfish = new Worker("stockfish.js");

  stockfish.onmessage = function (event) {
    const line = event.data;

    if (line === "uciok") stockfish.postMessage("isready");
    if (line === "readyok") {
      isEngineReady = true;
      $("#engine-status").text("Moteur Prêt").addClass("ready");
    }

    if (typeof line === "string") {
      // Évaluation (Score)
      if (line.includes("score cp")) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          let score = parseInt(match[1]);
          // Ajuster le score selon le trait (Stockfish donne le score pour le joueur actif)
          if (game.turn() === "b") score = -score;

          let evalText = (score / 100).toFixed(2);
          if (score > 0) evalText = "+" + evalText;
          updateEval(evalText);
        }
      } else if (line.includes("score mate")) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
          const mateIn = parseInt(match[1]);
          updateEval("#" + Math.abs(mateIn));
        }
      }

      // Meilleur coup
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const bestMoveUCI = parts[1];

        if (bestMoveUCI && bestMoveUCI !== "(none)") {
          const from = bestMoveUCI.substring(0, 2);
          const to = bestMoveUCI.substring(2, 4);

          // Conversion UCI -> SAN pour affichage
          const tempGame = new Chess(game.fen());
          const move = tempGame.move({ from: from, to: to, promotion: "q" });

          if (move) {
            $("#best-move-san").text(move.san);
            drawBestMoveArrow(from, to);
          }
        }
      }
    }
  };

  stockfish.postMessage("uci");
} catch (e) {
  console.error("Erreur Stockfish:", e);
  $("#engine-status").text("Erreur Moteur");
}

// --- 2. CONFIGURATION PLATEAU ---
var config = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
  // CORRECTION CRITIQUE : Utilisation d'un lien CDN fiable pour les images
  pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
};

$(document).ready(function () {
  board = Chessboard("board", config);
  initArrowLayer();
  $(window).resize(board.resize);

  // --- Écouteurs d'événements ---

  // Navigation Partie
  $("#btn-first").click(goToStart);
  $("#btn-prev").click(goToPrev);
  $("#btn-next").click(goToNext);
  $("#btn-last").click(goToEnd);

  // Chargement FEN / PGN
  $("#btn-load-pgn").click(loadPGN);
  $("#btn-load-fen").click(loadFEN);

  $("#btn-flip").click(() => {
    board.flip();
    drawArrowFromCache();
  });

  $("#btn-reset").click(() => {
    resetGame();
  });

  // Navigation clavier (Flèches)
  $(document).keydown(function (e) {
    if (e.keyCode === 37) goToPrev(); // Gauche
    if (e.keyCode === 39) goToNext(); // Droite
  });
});

// --- 3. LOGIQUE JEU & NAVIGATION ---

function resetGame() {
  game.reset();
  board.start();
  fullGameMoves = [];
  currentMoveIndex = -1;
  updateBoardInfo();
  startAnalysis();
}

// Charger un PGN (Partie complète)
function loadPGN() {
  const pgnText = $("#pgn-input").val();
  if (!pgnText.trim()) return;

  // 1. On charge le PGN pour valider et extraire les coups
  const tempGame = new Chess();
  if (!tempGame.load_pgn(pgnText)) {
    alert("PGN Invalide !");
    return;
  }

  // 2. On sauvegarde l'historique complet
  fullGameMoves = tempGame.history();

  // 3. On remet le jeu réel à zéro
  game.reset();
  currentMoveIndex = -1; // On commence au début

  // 4. Mise à jour visuelle
  board.position(game.fen());
  updateBoardInfo();
  startAnalysis();

  // Feedback visuel bouton
  highlightButton("#btn-load-pgn");
}

function loadFEN() {
  const fen = $("#fen-input").val();
  if (game.load(fen)) {
    fullGameMoves = []; // FEN écrase l'historique PGN
    currentMoveIndex = -1;
    board.position(fen);
    updateBoardInfo();
    startAnalysis();
    highlightButton("#btn-load-fen");
  } else {
    alert("FEN invalide !");
  }
}

// --- FONCTIONS DE NAVIGATION ---

function goToStart() {
  if (currentMoveIndex === -1) return;
  game.reset();
  currentMoveIndex = -1;
  updateGameState();
}

function goToPrev() {
  if (currentMoveIndex < 0) return;
  game.undo();
  currentMoveIndex--;
  updateGameState();
}

function goToNext() {
  if (currentMoveIndex >= fullGameMoves.length - 1) return;

  currentMoveIndex++;
  const moveSAN = fullGameMoves[currentMoveIndex];
  game.move(moveSAN);
  updateGameState();
}

function goToEnd() {
  if (currentMoveIndex >= fullGameMoves.length - 1) return;

  // On rejoue tout jusqu'à la fin
  while (currentMoveIndex < fullGameMoves.length - 1) {
    currentMoveIndex++;
    game.move(fullGameMoves[currentMoveIndex]);
  }
  updateGameState();
}

function updateGameState() {
  board.position(game.fen());
  updateBoardInfo();
  startAnalysis(); // Lancer l'analyse sur la NOUVELLE position
}

// --- INTERACTION ---

function onDragStart(source, piece) {
  if (game.game_over()) return false;
  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
}

function onDrop(source, target) {
  var move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return "snapback";

  // Si on joue un coup manuellement, on "casse" l'historique futur du PGN
  if (currentMoveIndex < fullGameMoves.length - 1) {
    fullGameMoves = game.history(); // On garde le nouvel historique
    currentMoveIndex = fullGameMoves.length - 1;
  } else {
    fullGameMoves.push(move.san);
    currentMoveIndex++;
  }

  updateBoardInfo();
  startAnalysis();
}

function onSnapEnd() {
  board.position(game.fen());
}

// --- MISE A JOUR UI ---

function updateBoardInfo() {
  $("#fen-input").val(game.fen());

  // Affichage PGN propre avec surbrillance
  const history = game.history();
  let html = "";

  for (let i = 0; i < history.length; i += 2) {
    const num = i / 2 + 1;
    const wMove = history[i];
    const bMove = history[i + 1] ? history[i + 1] : "";

    // Vérifier si c'est le coup actuel
    const wClass = i === currentMoveIndex ? "current-move" : "";
    const bClass = i + 1 === currentMoveIndex ? "current-move" : "";

    html += `<div class="pgn-row">
               <span class="pgn-num">${num}.</span>
               <span class="pgn-ply ${wClass}">${wMove}</span>
               <span class="pgn-ply ${bClass}">${bMove}</span>
             </div>`;
  }

  if (html === "")
    html = "<div style='color:#666; padding:10px;'>Début de partie.</div>";
  $("#pgn-display").html(html);

  // Scroll vers le bas si nécessaire
  const display = document.getElementById("pgn-display");
  display.scrollTop = display.scrollHeight;
}

function updateEval(text) {
  const el = $("#eval-score");
  el.text(text);
  if (text.startsWith("+") || text.startsWith("#")) el.css("color", "#58cc02");
  else if (text.startsWith("-")) el.css("color", "#ff4646");
  else el.css("color", "#d4af37");
}

function highlightButton(id) {
  const btn = $(id);
  const originalHtml = btn.html();
  btn.html('<i class="fas fa-check"></i>');
  setTimeout(() => btn.html(originalHtml), 1000);
}

// --- ANALYSE MOTEUR ---

function startAnalysis() {
  if (!isEngineReady || !stockfish) return;

  clearArrow();
  $("#best-move-san").text("...");
  $("#eval-score").css("color", "#aaa");

  stockfish.postMessage("stop");
  stockfish.postMessage("position fen " + game.fen());
  stockfish.postMessage("go depth 20");
}

// --- FLÈCHES SVG ---

function initArrowLayer() {
  const $board = $("#board");
  const svgOverlay = `
    <svg id="arrow-overlay" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" style="pointer-events: none;">
      <defs>
        <marker id="arrowhead" markerWidth="3" markerHeight="3" refX="2" refY="1.5" orient="auto">
          <polygon points="0 0, 3 1.5, 0 3" class="arrow-head" />
        </marker>
      </defs>
      <g id="arrow-group"></g>
    </svg>
  `;
  $board.append(svgOverlay);
}

function drawBestMoveArrow(from, to) {
  bestMoveArrow = { from, to };
  drawArrowFromCache();
}

function clearArrow() {
  bestMoveArrow = null;
  const group = document.getElementById("arrow-group");
  if (group) group.innerHTML = "";
}

function drawArrowFromCache() {
  if (!bestMoveArrow) return;
  const group = document.getElementById("arrow-group");
  if (!group) return;
  group.innerHTML = "";

  const coords = getCoords(bestMoveArrow.from, bestMoveArrow.to);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", coords.x1);
  line.setAttribute("y1", coords.y1);
  line.setAttribute("x2", coords.x2);
  line.setAttribute("y2", coords.y2);
  line.setAttribute("class", "arrow-line");
  line.setAttribute("marker-end", "url(#arrowhead)");
  group.appendChild(line);
}

function getCoords(from, to) {
  const files = "abcdefgh";
  const ranks = "12345678";
  let x1 = files.indexOf(from[0]);
  let y1 = ranks.indexOf(from[1]);
  let x2 = files.indexOf(to[0]);
  let y2 = ranks.indexOf(to[1]);

  if (board.orientation() === "white") {
    y1 = 7 - y1;
    y2 = 7 - y2;
  } else {
    x1 = 7 - x1;
    x2 = 7 - x2;
  }
  return { x1: x1 + 0.5, y1: y1 + 0.5, x2: x2 + 0.5, y2: y2 + 0.5 };
}
