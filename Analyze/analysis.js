// analysis.js - Version Complète Stockfish Local

var board = null;
var game = new Chess();
var stockfish = null;
var isEngineReady = false;
var bestMoveArrow = null; // Stocke la flèche à dessiner

// --- 1. INITIALISATION STOCKFISH ---
try {
  // Charge le worker depuis le même dossier
  stockfish = new Worker("../js/stockfish.js");

  stockfish.onmessage = function (event) {
    const line = event.data;

    // Initialisation
    if (line === "uciok") {
      stockfish.postMessage("isready");
    }
    if (line === "readyok") {
      isEngineReady = true;
      $("#engine-status").text("Moteur Prêt").addClass("ready");
      startAnalysis(); // Analyser la position de départ
    }

    // Réception des données d'analyse
    if (typeof line === "string") {
      // 1. Détection du score (Evaluation)
      // Format typique: info depth 10 ... score cp 50 ...
      if (line.includes("score cp")) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          let score = parseInt(match[1]);
          // Stockfish donne le score du point de vue de celui qui joue
          // On le normalise pour l'affichage (+ = Blancs)
          if (game.turn() === "b") score = -score;

          let evalText = (score / 100).toFixed(2);
          if (score > 0) evalText = "+" + evalText;
          updateEval(evalText);
        }
      } else if (line.includes("score mate")) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
          const mateIn = parseInt(match[1]);
          updateEval("M" + Math.abs(mateIn));
        }
      }

      // 2. Détection du meilleur coup (Best Move)
      // Format final: bestmove e2e4 ponder ...
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const bestMoveUCI = parts[1]; // ex: "e2e4"

        if (bestMoveUCI && bestMoveUCI !== "(none)") {
          // Convertir en SAN pour l'affichage (ex: Cf3)
          const from = bestMoveUCI.substring(0, 2);
          const to = bestMoveUCI.substring(2, 4);

          // Créer un jeu temporaire pour obtenir la notation SAN
          const tempGame = new Chess(game.fen());
          const move = tempGame.move({ from: from, to: to, promotion: "q" });

          if (move) {
            $("#best-move-san").text(move.san + " (" + bestMoveUCI + ")");
            // DESSINER LA FLÈCHE
            drawBestMoveArrow(from, to);
          }
        }
      }
    }
  };

  // Démarrage UCI
  stockfish.postMessage("uci");
} catch (e) {
  console.error("Erreur chargement Stockfish:", e);
  $("#engine-status").text("Erreur Moteur");
}

// --- 2. CONFIGURATION PLATEAU ---
var config = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
  pieceTheme: "../../img/wiki/{piece}.png", // Adapte ce chemin si besoin
};

$(document).ready(function () {
  board = Chessboard("board", config);
  initArrowLayer(); // Prépare le SVG pour les flèches
  $(window).resize(board.resize);

  // Boutons
  $("#btn-flip").on("click", function () {
    board.flip();
    drawArrowFromCache(); // Redessine la flèche après rotation
  });

  $("#btn-reset").on("click", function () {
    game.reset();
    board.start();
    updateBoardInfo();
    startAnalysis();
  });

  // Gestion FEN
  $("#btn-load-fen").on("click", function () {
    const fen = $("#fen-input").val();
    if (game.load(fen)) {
      board.position(fen);
      updateBoardInfo();
      startAnalysis();
    } else {
      alert("FEN invalide !");
    }
  });

  $("#btn-copy-fen").on("click", function () {
    navigator.clipboard.writeText(game.fen());
    const btn = $(this);
    const originalHtml = btn.html();
    btn.html('<i class="fas fa-check"></i>');
    setTimeout(() => btn.html(originalHtml), 1000);
  });
});

// --- 3. LOGIQUE JEU ---

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
  var move = game.move({
    from: source,
    to: target,
    promotion: "q",
  });

  if (move === null) return "snapback";

  updateBoardInfo();
  startAnalysis(); // Lancer l'analyse après le coup
}

function onSnapEnd() {
  board.position(game.fen());
}

function updateBoardInfo() {
  $("#fen-input").val(game.fen());
  const pgn = game.pgn();
  $("#pgn-display").text(pgn ? pgn : "Début de partie.");
}

function updateEval(text) {
  const el = $("#eval-score");
  el.text(text);
  // Couleur verte pour avantage positif, rouge pour négatif
  if (text.startsWith("+") || text.startsWith("M")) el.css("color", "#58cc02");
  else if (text.startsWith("-")) el.css("color", "#ff4646");
  else el.css("color", "#d4af37");
}

// --- 4. FONCTION D'ANALYSE ---

function startAnalysis() {
  if (!isEngineReady || !stockfish) return;

  // Effacer l'ancienne flèche
  clearArrow();
  $("#best-move-san").text("Calcul...");
  $("#eval-score").css("color", "#aaa");

  // Arrêter le calcul précédent
  stockfish.postMessage("stop");

  // Envoyer la nouvelle position
  stockfish.postMessage("position fen " + game.fen());

  // Lancer l'analyse (profondeur 20 pour être réactif)
  stockfish.postMessage("go depth 20");
}

// --- 5. SYSTÈME DE FLÈCHES (SVG) ---

function initArrowLayer() {
  const $board = $("#board");
  // Création du calque SVG par dessus le plateau
  const svgOverlay = `
    <svg id="arrow-overlay" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" style="pointer-events: none;">
      <defs>
        <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <polygon points="0 0, 4 2, 0 4" class="arrow-head" />
        </marker>
      </defs>
      <g id="arrow-group"></g>
    </svg>
  `;
  $board.append(svgOverlay);
}

function drawBestMoveArrow(from, to) {
  bestMoveArrow = { from, to }; // Sauvegarde pour redessiner si resize/flip
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
  group.innerHTML = ""; // Clear

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

  // Ajustement selon l'orientation
  if (board.orientation() === "white") {
    y1 = 7 - y1;
    y2 = 7 - y2;
  } else {
    x1 = 7 - x1;
    x2 = 7 - x2;
  }

  return { x1: x1 + 0.5, y1: y1 + 0.5, x2: x2 + 0.5, y2: y2 + 0.5 };
}
