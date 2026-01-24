// =============================================
// CONFIGURATION ET VARIABLES GLOBALES
// =============================================

var board = null;
var game = new Chess();
var stockfish = null;
var isEngineReady = false;
var gameActive = true;

// Variables Interface
var arrowsList = [];
var arrowStartSquare = null;
var selectedSquare = null;
var draggedSource = null;

// Paramètres
var playerColor = "w";
var difficulty = 5;

// =============================================
// 1. INITIALISATION DE STOCKFISH
// =============================================

function initStockfish() {
  stockfish = new Worker("stockfish.js");

  stockfish.onmessage = function (event) {
    const line = event.data;
    if (line === "uciok") {
      isEngineReady = true;
      console.log("✅ Stockfish est prêt !");
    }
    if (line.startsWith("bestmove")) {
      const moveData = line.split(" ");
      const bestMove = moveData[1];
      makeBotMove(bestMove);
    }
  };

  stockfish.postMessage("uci");
  stockfish.postMessage("isready");
}

// =============================================
// 2. LOGIQUE DU JEU (DRAG & DROP + CLIC)
// =============================================

function onDragStart(source, piece) {
  if (isGameOver() || !isPlayerTurn()) return false;
  if (
    (playerColor === "w" && piece.search(/^b/) !== -1) ||
    (playerColor === "b" && piece.search(/^w/) !== -1)
  )
    return false;

  draggedSource = source;

  // --- CORRECTION DÉSÉLECTION (TOGGLE) ---
  // Si on clique sur la pièce DÉJÀ sélectionnée, on ne fait rien ici.
  // On laisse handleSquareClick gérer la désélection (le toggle).
  if (selectedSquare !== source) {
    deselectSquare();
    highlightLegalMoves(source);
  }

  return true;
}

function onDrop(source, target) {
  draggedSource = null;

  if (source === target) {
    handleSquareClick(source);
    return "snapback";
  }

  removeAllHighlights();
  var move = attemptMove(source, target);
  if (move === null) return "snapback";
}

function handleSquareClick(square) {
  if (isGameOver() || !isPlayerTurn()) return;

  // --- CORRECTION LOGIQUE TOGGLE ---
  // 1. Si on clique sur la case déjà active -> On l'éteint.
  if (selectedSquare === square) {
    deselectSquare();
    return;
  }

  // 2. Si une autre case était sélectionnée -> On tente le mouvement
  if (selectedSquare) {
    var move = attemptMove(selectedSquare, square);

    if (move === null) {
      // Mouvement impossible
      var piece = game.get(square);
      // Si c'est une pièce à nous, on change la sélection
      if (piece && piece.color === game.turn()) {
        deselectSquare();
        selectSquare(square);
      } else {
        deselectSquare(); // Clic dans le vide ou pièce adverse
      }
    } else {
      // Mouvement valide -> attemptMove gère la suite
      deselectSquare();
    }
  } else {
    // 3. Aucune sélection -> On sélectionne
    var piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      selectSquare(square);
    }
  }
}

function attemptMove(from, to) {
  var move = game.move({ from: from, to: to, promotion: "q" });
  if (move === null) return null;

  board.position(game.fen());
  clearArrows();
  updateStatus();
  updateMoveHistory();
  highlightLastMove(from, to);

  if (!game.game_over()) {
    window.setTimeout(askBotToPlay, 250);
  }
  return move;
}

function onSnapEnd() {
  board.position(game.fen());
}

function isGameOver() {
  return game.game_over() || !gameActive;
}

function isPlayerTurn() {
  return game.turn() === playerColor;
}

// =============================================
// 3. INTELLIGENCE ARTIFICIELLE
// =============================================

function askBotToPlay() {
  if (!isEngineReady) return;
  stockfish.postMessage("position fen " + game.fen());
  stockfish.postMessage("go depth " + difficulty);
}

function makeBotMove(bestMoveUCI) {
  const from = bestMoveUCI.substring(0, 2);
  const to = bestMoveUCI.substring(2, 4);
  const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] : "q";

  game.move({ from: from, to: to, promotion: promotion });
  board.position(game.fen());
  updateStatus();
  updateMoveHistory();
  highlightLastMove(from, to);
}

// =============================================
// 4. GESTION VISUELLE (SURBRILLANCE)
// =============================================

function selectSquare(square) {
  selectedSquare = square;
  $("#board .square-" + square).addClass("highlight-selected");
  highlightLegalMoves(square);
}

function deselectSquare() {
  selectedSquare = null;
  $("#board .square-55d63").removeClass("highlight-selected");
  removeAllHighlights();
}

function highlightLegalMoves(square) {
  var moves = game.moves({ square: square, verbose: true });
  if (moves.length === 0) return;

  for (var i = 0; i < moves.length; i++) {
    var target = moves[i].to;
    if (moves[i].flags.includes("c") || moves[i].flags.includes("e")) {
      $("#board .square-" + target).addClass("legal-capture");
    } else {
      $("#board .square-" + target).addClass("legal-move");
    }
  }
}

function removeAllHighlights() {
  $("#board .square-55d63").removeClass("legal-move legal-capture legal-hover");
}

function highlightLastMove(from, to) {
  $("#board .square-55d63").removeClass("last-move-highlight");
  $("#board .square-" + from).addClass("last-move-highlight");
  $("#board .square-" + to).addClass("last-move-highlight");
}

function onMouseoverSquare(square) {
  if (!draggedSource && !selectedSquare) return;

  var source = draggedSource || selectedSquare;
  var moves = game.moves({ square: source, verbose: true });
  if (moves.find((m) => m.to === square)) {
    $("#board .square-" + square).addClass("legal-hover");
  }
}

function onMouseoutSquare(square) {
  $("#board .square-" + square).removeClass("legal-hover");
}

// =============================================
// 5. SYSTÈME DE FLÈCHES (ROBUSTE)
// =============================================

function initArrowSystem() {
  const $board = $("#board");

  // 1. On injecte le SVG une seule fois
  if ($("#arrow-overlay").length === 0) {
    const svgOverlay = `
      <svg id="arrow-overlay" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
            <polygon points="0 0, 4 2, 0 4" class="arrow-head" />
          </marker>
        </defs>
        <g id="arrows-layer"></g>
      </svg>
    `;
    $board.append(svgOverlay);
  }

  const boardEl = document.getElementById("board");

  // Empêche le menu contextuel natif
  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // --- CAPTURE DU CLIC DROIT AVANT CHESSBOARD.JS ---
  boardEl.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) {
        // Clic Droit : On dessine, on bloque chessboard.js
        e.stopPropagation();
        e.stopImmediatePropagation();

        const square = getSquareFromEvent(e);
        if (square) arrowStartSquare = square;
      } else {
        // Clic Gauche : On efface les flèches, on laisse jouer
        clearArrows();
      }
    },
    { capture: true },
  );

  boardEl.addEventListener("mouseup", (e) => {
    if (e.button === 2 && arrowStartSquare) {
      const arrowEndSquare = getSquareFromEvent(e);
      if (arrowEndSquare && arrowStartSquare !== arrowEndSquare) {
        toggleArrow(arrowStartSquare, arrowEndSquare);
      }
      arrowStartSquare = null;
    }
  });
}

function getSquareFromEvent(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const squareEl = $(el).closest(".square-55d63");
  return squareEl.length ? squareEl.attr("data-square") : null;
}

function toggleArrow(from, to) {
  const index = arrowsList.findIndex((a) => a.from === from && a.to === to);
  if (index !== -1) arrowsList.splice(index, 1);
  else arrowsList.push({ from, to });
  renderArrows();
}

function clearArrows() {
  arrowsList = [];
  renderArrows();
}

function renderArrows() {
  const layer = document.getElementById("arrows-layer");
  if (!layer) return;

  layer.innerHTML = "";

  arrowsList.forEach((arrow) => {
    const coords = getArrowCoordinates(arrow.from, arrow.to);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", coords.x1);
    line.setAttribute("y1", coords.y1);
    line.setAttribute("x2", coords.x2);
    line.setAttribute("y2", coords.y2);
    line.setAttribute("class", "arrow-line");
    line.setAttribute("marker-end", "url(#arrowhead)");

    layer.appendChild(line);
  });
}

function getArrowCoordinates(from, to) {
  const files = "abcdefgh";
  const ranks = "12345678";

  let x1 = files.indexOf(from[0]);
  let y1 = ranks.indexOf(from[1]);
  let x2 = files.indexOf(to[0]);
  let y2 = ranks.indexOf(to[1]);

  const orientation = board.orientation();

  if (orientation === "white") {
    y1 = 7 - y1;
    y2 = 7 - y2;
  } else {
    x1 = 7 - x1;
    x2 = 7 - x2;
  }

  return {
    x1: x1 + 0.5,
    y1: y1 + 0.5,
    x2: x2 + 0.5,
    y2: y2 + 0.5,
  };
}

// =============================================
// 7. INITIALISATION
// =============================================

$(document).ready(function () {
  board = Chessboard("board", {
    draggable: true,
    position: "start",
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    onMouseoverSquare: onMouseoverSquare,
    onMouseoutSquare: onMouseoutSquare,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
  });

  initStockfish();
  initArrowSystem();

  $("#board").on("click", ".square-55d63", function () {
    var square = $(this).attr("data-square");
    handleSquareClick(square);
  });

  $("#btn-new-game").on("click", startNewGame);

  $("#btn-undo").on("click", function () {
    if (!gameActive) return;
    game.undo();
    game.undo();
    board.position(game.fen());
    updateStatus();
    updateMoveHistory();
    clearArrows();
    deselectSquare();
  });

  $("#btn-play-white").on("click", function () {
    $(".color-choice button").removeClass("active");
    $(this).addClass("active");
    playerColor = "w";
  });

  $("#btn-play-black").on("click", function () {
    $(".color-choice button").removeClass("active");
    $(this).addClass("active");
    playerColor = "b";
  });

  $("#difficulty-select").on("change", function () {
    difficulty = parseInt($(this).val());
  });

  $(window).resize(function () {
    board.resize();
    renderArrows();
  });

  setTimeout(function () {
    board.resize();
    renderArrows();
  }, 500);
});

function startNewGame() {
  game.reset();
  gameActive = true;
  board.position("start");
  board.orientation(playerColor === "w" ? "white" : "black");
  updateStatus();
  updateMoveHistory();
  clearArrows();
  deselectSquare();

  if (playerColor === "b") {
    window.setTimeout(askBotToPlay, 500);
  }
}

function updateStatus() {
  var status = "";
  var moveColor = game.turn() === "b" ? "Noirs" : "Blancs";

  if (game.in_checkmate()) {
    status = "Partie terminée, " + moveColor + " sont en échec et mat.";
    gameActive = false;
  } else if (game.in_draw()) {
    status = "Partie terminée, match nul.";
    gameActive = false;
  } else {
    status = "Au tour des " + moveColor;
    if (game.in_check()) {
      status += ", " + moveColor + " sont en échec";
    }
  }
  $("#status").text(status);
}

function updateMoveHistory() {
  var history = game.history();
  var listHtml = "";
  for (var i = 0; i < history.length; i += 2) {
    var moveNum = i / 2 + 1;
    var whiteMove = history[i];
    var blackMove = history[i + 1] ? history[i + 1] : "";

    listHtml += '<div class="move-pair">';
    listHtml += '<span class="move-number">' + moveNum + ".</span>";
    listHtml += '<span class="move-white">' + whiteMove + "</span>";
    if (blackMove) {
      listHtml += '<span class="move-black">' + blackMove + "</span>";
    }
    listHtml += "</div>";
  }
  $("#move-history").html(listHtml);

  // Auto-scroll vers le bas
  var historyContainer = document.getElementById("move-history");
  if (historyContainer)
    historyContainer.scrollTop = historyContainer.scrollHeight;
}
