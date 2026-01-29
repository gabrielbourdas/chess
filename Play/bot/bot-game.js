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
var pendingMove = null; // Variable pour la promotion

// Paramètres par défaut
var playerColor = "w";
var difficulty = 5;

// =============================================
// GESTION DES SONS (MOUVEMENT & CAPTURE)
// =============================================

const audioMove = new Audio(
  "https://images.chesscomfiles.com/chess-themes/sounds/_Common/standard/move.mp3",
);
const audioCapture = new Audio(
  "https://images.chesscomfiles.com/chess-themes/sounds/_Common/standard/capture.mp3",
);

function playMoveSound(move) {
  const isCapture = move.flags.includes("c") || move.flags.includes("e");
  const soundToPlay = isCapture ? audioCapture : audioMove;
  soundToPlay.currentTime = 0;
  var playPromise = soundToPlay.play();

  if (playPromise !== undefined) {
    playPromise.catch((error) => {
      // Ignorer les erreurs d'autoplay
    });
  }
}

// --- CONFIGURATION PRÉCISE DES NIVEAUX ---
const LEVEL_CONFIG = {
  1: { uciElo: 600, skill: 0, depth: 1, moveTime: 400 },
  3: { uciElo: 1000, skill: 3, depth: 2, moveTime: 600 },
  5: { uciElo: 1400, skill: 6, depth: 5, moveTime: 1000 },
  10: { uciElo: 1800, skill: 10, depth: 8, moveTime: 1200 },
  15: { uciElo: null, skill: 15, depth: 12, moveTime: 1500 },
  20: { uciElo: null, skill: 20, depth: 18, moveTime: 2000 },
};

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

  // Si attemptMove retourne null (mouvement illégal OU promotion en attente)
  if (move === null) return "snapback";
}

function handleSquareClick(square) {
  if (isGameOver() || !isPlayerTurn()) return;

  if (selectedSquare === square) {
    deselectSquare();
    return;
  }

  if (selectedSquare) {
    var move = attemptMove(selectedSquare, square);
    if (move === null) {
      // Si le mouvement a échoué, on regarde si on a cliqué sur une autre pièce à nous
      var piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        deselectSquare();
        selectSquare(square);
      } else {
        // Sinon on désélectionne (sauf si c'est une promotion en cours)
        if (!pendingMove) deselectSquare();
      }
    } else {
      deselectSquare();
    }
  } else {
    var piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      selectSquare(square);
    }
  }
}

function attemptMove(from, to, promotionChoice = null) {
  // 1. DÉTECTION PROMOTION
  const piece = game.get(from);
  const isPawn = piece && piece.type === "p";
  // Vérifie si le pion atteint la dernière rangée (8 pour Blancs, 1 pour Noirs)
  const isPromotionRank =
    (piece.color === "w" && to[1] === "8") ||
    (piece.color === "b" && to[1] === "1");

  // Si c'est une promotion et qu'on n'a pas encore choisi la pièce
  if (isPawn && isPromotionRank && !promotionChoice) {
    pendingMove = { from, to };
    showPromotionModal(piece.color);
    return null; // On annule le mouvement pour l'instant (snapback visuel)
  }

  // Si choix fait ou pas de promotion, on définit la pièce (Dame par défaut pour le bot ou logique interne)
  const finalPromotion = promotionChoice || "q";

  // 2. TENTATIVE DE MOUVEMENT
  var move = game.move({ from: from, to: to, promotion: finalPromotion });

  // Si le mouvement est invalide
  if (move === null) return null;

  // --- SON : On joue le son ici pour le joueur ---
  playMoveSound(move);

  // Mise à jour visuelle forcée (crucial pour afficher la pièce promue)
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
  // Cette fonction gère la mise à jour visuelle après un drag & drop standard
  // Si une promotion vient d'avoir lieu, board.position a déjà été appelé dans attemptMove
  board.position(game.fen());
}

function isGameOver() {
  return game.game_over() || !gameActive;
}

function isPlayerTurn() {
  return game.turn() === playerColor;
}

// =============================================
// 3. GESTION DE LA PROMOTION (INTERFACE)
// =============================================

// Exposition globale pour les onclick générés dans le HTML
window.confirmPromotion = confirmPromotion;

function showPromotionModal(color) {
  const modal = document.getElementById("promotion-overlay");
  const container = document.getElementById("promo-pieces-container");
  if (!modal || !container) return;

  container.innerHTML = "";
  // Ordre des pièces
  const pieces = ["q", "r", "n", "b"];

  pieces.forEach((p) => {
    const img = document.createElement("img");
    img.src = `https://chessboardjs.com/img/chesspieces/wikipedia/${color}${p.toUpperCase()}.png`;
    img.className = "promo-piece";
    img.onclick = () => confirmPromotion(p);
    container.appendChild(img);
  });

  modal.style.display = "flex";
}

function confirmPromotion(pieceChar) {
  document.getElementById("promotion-overlay").style.display = "none";

  if (pendingMove) {
    const { from, to } = pendingMove;
    // On relance le mouvement avec le choix de la pièce
    attemptMove(from, to, pieceChar);
    pendingMove = null;
  }
}

// =============================================
// 4. INTELLIGENCE ARTIFICIELLE
// =============================================

function askBotToPlay() {
  if (!isEngineReady) return;

  const config = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[5];

  if (config.uciElo) {
    stockfish.postMessage("setoption name UCI_LimitStrength value true");
    stockfish.postMessage("setoption name UCI_Elo value " + config.uciElo);
  } else {
    stockfish.postMessage("setoption name UCI_LimitStrength value false");
  }

  stockfish.postMessage("setoption name Skill Level value " + config.skill);
  stockfish.postMessage("position fen " + game.fen());
  stockfish.postMessage(
    "go depth " + config.depth + " movetime " + config.moveTime,
  );
}

function makeBotMove(bestMoveUCI) {
  if (game.turn() === playerColor) return;

  const from = bestMoveUCI.substring(0, 2);
  const to = bestMoveUCI.substring(2, 4);
  const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] : "q";

  var move = game.move({ from: from, to: to, promotion: promotion });

  if (move === null) return;

  playMoveSound(move);

  board.position(game.fen());
  updateStatus();
  updateMoveHistory();
  highlightLastMove(from, to);
}

// =============================================
// 5. GESTION VISUELLE
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
// 6. SYSTÈME DE FLÈCHES
// =============================================

function initArrowSystem() {
  const $board = $("#board");
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
  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  boardEl.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const square = getSquareFromEvent(e);
        if (square) arrowStartSquare = square;
      } else {
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
  return { x1: x1 + 0.5, y1: y1 + 0.5, x2: x2 + 0.5, y2: y2 + 0.5 };
}

// =============================================
// 7. INITIALISATION ET ÉVÉNEMENTS
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

  // Boutons
  $("#btn-new-game").on("click", function () {
    startNewGame();
  });

  $("#btn-undo").on("click", function () {
    if (game.history().length < 1) return;
    if (playerColor === "w" && game.history().length < 2) {
      game.undo();
    } else if (game.turn() !== playerColor) {
      game.undo();
    } else {
      game.undo();
      game.undo();
    }
    board.position(game.fen());
    updateStatus();
    updateMoveHistory();
    clearArrows();
    deselectSquare();
    removeAllHighlights();
    gameActive = true;

    // Au cas où une promotion était en attente
    pendingMove = null;
    document.getElementById("promotion-overlay").style.display = "none";
  });

  $("#btn-play-white").on("click", function () {
    if ($(this).hasClass("active")) return;
    $(".color-choice button").removeClass("active");
    $(this).addClass("active");
    playerColor = "w";
    startNewGame();
  });

  $("#btn-play-black").on("click", function () {
    if ($(this).hasClass("active")) return;
    $(".color-choice button").removeClass("active");
    $(this).addClass("active");
    playerColor = "b";
    startNewGame();
  });

  // --- SÉLECTEUR DE DIFFICULTÉ & MISE À JOUR TITRE ---
  function updateBotTitle() {
    var selectedText = $("#difficulty-select option:selected").text();
    $("#bot-name").text("Stockfish - " + selectedText);
  }

  $("#difficulty-select").on("change", function () {
    difficulty = parseInt($(this).val());
    updateBotTitle();
    console.log("Niveau choisi:", difficulty, LEVEL_CONFIG[difficulty]);
    // Relance la partie automatiquement lors du changement de niveau
    startNewGame();
  });

  updateBotTitle();

  $(window).resize(function () {
    board.resize();
    renderArrows();
  });
  setTimeout(function () {
    board.resize();
    renderArrows();
  }, 50);
  setTimeout(function () {
    board.resize();
    renderArrows();
  }, 200);
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
  removeAllHighlights();

  // Reset de la promotion
  pendingMove = null;
  document.getElementById("promotion-overlay").style.display = "none";

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
  var historyContainer = document.getElementById("move-history");
  if (historyContainer)
    historyContainer.scrollTop = historyContainer.scrollHeight;
}
