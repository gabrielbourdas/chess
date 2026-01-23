// game.js

var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var currentCategory = "all";
var isPuzzleLocked = false;
var selectedSquare = null;
var draggedSource = null; // NOUVEAU : Pour se souvenir quelle pièce on tient

var config = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,

  // NOUVEAU : On gère le survol nous-mêmes
  onMouseoverSquare: onMouseoverSquare,
  onMouseoutSquare: onMouseoutSquare,

  moveSpeed: 200,
  snapbackSpeed: 20,
  snapSpeed: 100,
  pieceTheme: "../../img/wiki/{piece}.png",
};

document.addEventListener("DOMContentLoaded", () => {
  // --- GESTION DE L'INDICE (Tooltip) ---
  const btnHint = document.getElementById("btn-hint");
  const hintBubble = document.getElementById("hint-bubble");

  if (btnHint && hintBubble) {
    btnHint.addEventListener("click", () => {
      // 1. On change le texte selon le puzzle (Optionnel, ici un texte générique)
      // Tu pourrais mettre : hintBubble.textContent = "Coup clé : " + currentPuzzle.moves[0];

      // 2. On affiche la bulle
      hintBubble.classList.add("visible");

      // 3. On la cache automatiquement après 3 secondes
      setTimeout(() => {
        hintBubble.classList.remove("visible");
      }, 3000);
    });
  }
  setTimeout(() => {
    board = Chessboard("board", config);
    loadRandomPuzzle();
    window.addEventListener("resize", board.resize);

    $("#board").on("click", ".square-55d63", function () {
      var square = $(this).attr("data-square");
      handleSquareInteraction(square);
    });
  }, 100);

  document
    .getElementById("btn-next")
    .addEventListener("click", loadRandomPuzzle);
});

// --- GESTION INTELLIGENTE DU SURVOL (HIGHLIGHT) ---

function onMouseoverSquare(square, piece) {
  // Si on ne traîne aucune pièce, on ne fait rien
  if (!draggedSource) return;

  // 1. On récupère tous les coups possibles depuis la case de départ
  var moves = game.moves({
    square: draggedSource,
    verbose: true,
  });

  // 2. On vérifie si la case survolée (square) est une destination valide
  // On cherche dans la liste 'moves' si un coup va vers 'square'
  var isLegal = moves.find(function (move) {
    return move.to === square;
  });

  // 3. Si c'est légal, on allume la case !
  if (isLegal) {
    $("#board .square-" + square).addClass("legal-hover");
  }
}

function onMouseoutSquare(square, piece) {
  // Quand on quitte la case, on éteint la lumière
  $("#board .square-" + square).removeClass("legal-hover");
}

// --- INTERACTION ---

function handleSquareInteraction(square) {
  if (isPuzzleLocked || game.game_over()) return;

  if (selectedSquare !== null) {
    if (square === selectedSquare) {
      deselectSquare();
      return;
    }

    var move = game.move({
      from: selectedSquare,
      to: square,
      promotion: "q",
    });

    if (move !== null) {
      board.position(game.fen());
      checkPuzzleMove(move);
      deselectSquare();
    } else {
      var piece = game.get(square);
      if (piece && piece.color === currentPuzzle.color) {
        selectSquare(square);
      } else {
        deselectSquare();
      }
    }
  } else {
    var piece = game.get(square);
    if (piece && piece.color === currentPuzzle.color) {
      selectSquare(square);
    }
  }
}

// --- VISUEL ---

function selectSquare(square) {
  deselectSquare();
  selectedSquare = square;
  $("#board .square-" + square).addClass("selected-square");
  highlightLegalMoves(square);
}

function deselectSquare() {
  selectedSquare = null;
  $("#board .square-55d63").removeClass("selected-square");
  removeHighlights();
}

function highlightLegalMoves(square) {
  var moves = game.moves({
    square: square,
    verbose: true,
  });

  if (moves.length === 0) return;

  for (var i = 0; i < moves.length; i++) {
    var targetSquare = moves[i].to;
    if (moves[i].flags.includes("c") || moves[i].flags.includes("e")) {
      $("#board .square-" + targetSquare).addClass("legal-capture");
    } else {
      $("#board .square-" + targetSquare).addClass("legal-move");
    }
  }
}

function removeHighlights() {
  $("#board .square-55d63").removeClass("legal-move legal-capture");
}

// --- DRAG & DROP ---

function onDragStart(source, piece) {
  if (game.game_over() || isPuzzleLocked) return false;
  if (currentPuzzle.color === "w" && piece.search(/^b/) !== -1) return false;
  if (currentPuzzle.color === "b" && piece.search(/^w/) !== -1) return false;

  // MEMOIRE : On retient d'où on part pour le survol intelligent
  draggedSource = source;

  if (selectedSquare && selectedSquare !== source) {
    deselectSquare();
  }
  highlightLegalMoves(source); // Affiche aussi les points pendant le drag
}

function onDrop(source, target) {
  draggedSource = null; // On lâche la pièce
  removeHighlights();

  if (source === target) {
    handleSquareInteraction(source);
    return "snapback";
  }

  var move = game.move({
    from: source,
    to: target,
    promotion: "q",
  });

  if (move === null) return "snapback";

  checkPuzzleMove(move);
  deselectSquare();
}

// --- LOGIQUE JEU ---

function checkPuzzleMove(move) {
  const expectedMove = currentPuzzle.moves[moveIndex];

  if (move.san === expectedMove) {
    moveIndex++;
    if (moveIndex >= currentPuzzle.moves.length) {
      showFeedback(true, "Puzzle Réussi ! 🎉");
    } else {
      window.setTimeout(playComputerMove, 500);
    }
  } else {
    showFeedback(false, "Mauvais coup ! Clique sur Réessayer.");
    isPuzzleLocked = true;
  }
}

function loadRandomPuzzle() {
  const boardEl = document.getElementById("board");
  boardEl.classList.remove("replay-anim");
  void boardEl.offsetWidth;
  boardEl.classList.add("replay-anim");

  let filteredPuzzles = puzzlesData;
  if (currentCategory !== "all") {
    filteredPuzzles = puzzlesData.filter((p) => p.category === currentCategory);
  }
  if (filteredPuzzles.length === 0) filteredPuzzles = puzzlesData;

  const randomIndex = Math.floor(Math.random() * filteredPuzzles.length);
  currentPuzzle = filteredPuzzles[randomIndex];

  game.load(currentPuzzle.fen);
  board.position(currentPuzzle.fen, false);

  moveIndex = 0;
  isPuzzleLocked = false;
  selectedSquare = null;
  draggedSource = null;
  deselectSquare();

  updateUI();
}

function updateUI() {
  const statusText = document.getElementById("status-text");
  const turnIndicator = document.querySelector(".turn-indicator");
  const feedback = document.getElementById("feedback-area");

  feedback.classList.remove("visible");

  if (currentPuzzle.color === "w") {
    statusText.textContent = "Trait aux Blancs";
    if (turnIndicator) turnIndicator.className = "turn-indicator white-turn";
    board.orientation("white");
  } else {
    statusText.textContent = "Trait aux Noirs";
    if (turnIndicator) turnIndicator.className = "turn-indicator black-turn";
    board.orientation("black");
  }
}

function onSnapEnd() {
  board.position(game.fen());
}

function playComputerMove() {
  const nextMove = currentPuzzle.moves[moveIndex];
  if (nextMove) {
    game.move(nextMove);
    board.position(game.fen());
    moveIndex++;

    if (moveIndex >= currentPuzzle.moves.length) {
      showFeedback(true, "Puzzle Réussi ! 🎉");
    }
  }
}

window.retryLastMove = function () {
  if (!isPuzzleLocked && moveIndex === 0) {
    loadRandomPuzzle();
    return;
  }
  if (isPuzzleLocked) {
    game.undo();
    board.position(game.fen());
    isPuzzleLocked = false;
    deselectSquare();

    // On cache le message en enlevant la classe visible
    document.getElementById("feedback-area").classList.remove("visible"); // <--- MODIFIE ICI
  }
};

function showFeedback(isSuccess, message) {
  const feedback = document.getElementById("feedback-area");
  if (!feedback) return;

  feedback.textContent = message;

  // Au lieu d'enlever 'hidden', on ajoute 'visible' pour l'opacité
  feedback.classList.add("visible"); // <--- MODIFIE ICI

  if (isSuccess) {
    feedback.style.background = "rgba(88, 204, 2, 0.2)";
    feedback.style.color = "#58cc02";
  } else {
    feedback.style.background = "rgba(220, 38, 38, 0.2)";
    feedback.style.color = "#ef4444";
  }
}

// ... tout le code du jeu au dessus ...

window.setCategory = function (cat) {
  // 1. Visuel : On change le bouton actif
  document
    .querySelectorAll(".filter-btn")
    .forEach((btn) => btn.classList.remove("active"));

  // Petite sécurité : on vérifie que le clic existe bien
  if (event && event.target) {
    event.target.classList.add("active");
  }

  // 2. Logique : On met à jour la catégorie
  currentCategory = cat;

  // --- C'EST ICI QU'ON A FAIT LE MÉNAGE ---
  // On a supprimé les lignes :
  // const names = { ... }
  // const titleEl = document.getElementById('category-title');
  // ... car le titre n'existe plus dans le HTML !

  // 3. On charge le nouveau puzzle
  loadRandomPuzzle();
};
