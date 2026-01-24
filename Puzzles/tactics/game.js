// Importation des fonctions Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  limit,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBNBUO3JupohDCYAMs7Xf6kKgxnnFgPpVM",
  authDomain: "open-chess-2f3cf.firebaseapp.com",
  projectId: "open-chess-2f3cf",
  storageBucket: "open-chess-2f3cf.firebasestorage.app",
  messagingSenderId: "447945730536",
  appId: "1:447945730536:web:a1e3347bc13e94040bdc5d",
  measurementId: "G-71F05DTLHG",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 2. CONFIGURATION STOCKFISH ---
var stockfish = null;
var isEngineReady = false;

try {
  stockfish = new Worker("stockfish.js");

  stockfish.onmessage = function (event) {
    const message = event.data ? event.data : event;
    if (message === "uciok") stockfish.postMessage("isready");
    if (message === "readyok") {
      isEngineReady = true;
      console.log("✅ Stockfish est prêt !");
    }
  };
  stockfish.onerror = function (e) {
    console.error("❌ Erreur Stockfish", e);
    isEngineReady = false;
  };
  stockfish.postMessage("uci");
} catch (e) {
  console.warn("⚠️ Impossible de charger Stockfish.", e);
}

// --- 3. DICTIONNAIRE DES THÈMES ---
const THEMES_FR = {
  mate: "Échec et Mat ! 🏁",
  mateIn1: "Mat en 1 coup ! ⚡",
  mateIn2: "Mat en 2 coups ! 🧠",
  mateIn3: "Mat en 3 coups ! 🔥",
  fork: "Belle fourchette ! 🍴",
  pin: "Joli clouage ! 📌",
  skewer: "Enfilade réussie ! 🍡",
  discoveredAttack: "Attaque à la découverte ! 👁️",
  doubleCheck: "Échec double dévastateur ! ⚔️",
  sacrifice: "Magnifique sacrifice ! 🎁",
  xRayAttack: "Attaque rayons X ! ☠️",
  promotion: "Promotion ! ♛",
  zugzwang: "Zugzwang !",
  deflection: "Déviation réussie !",
  attraction: "Sacrifice d'attraction !",
  interference: "Interférence tactique !",
  clearance: "Dégagement de case !",
  endgame: "Finale.",
};

// Variables Globales Jeu
var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var isPuzzleLocked = false;
var isWrongMoveState = false;
var currentStreak = 0;
var selectedSquare = null;
var draggedSource = null;

// --- VARIABLES POUR FLÈCHES ---
var arrowStartSquare = null;
var arrowsList = [];

var config = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
  onMouseoverSquare: onMouseoverSquare,
  onMouseoutSquare: onMouseoutSquare,
  pieceTheme: "../../img/wiki/{piece}.png",
  moveSpeed: 200,
};

document.addEventListener("DOMContentLoaded", () => {
  board = Chessboard("board", config);
  setTimeout(() => board.resize(), 200);
  window.addEventListener("resize", board.resize);

  // Initialisation du système de flèches
  initArrowSystem();

  $("#board").on("click", ".square-55d63", function () {
    var square = $(this).attr("data-square");
    handleSquareInteraction(square);
  });

  document
    .getElementById("btn-next")
    .addEventListener("click", loadRandomPuzzle);
  document.getElementById("btn-retry").addEventListener("click", retryLastMove);
  document.getElementById("btn-hint").addEventListener("click", showHint);

  loadRandomPuzzle();
});

// --- SYSTÈME DE FLÈCHES (VISUALISATION CORRIGÉE) ---

function initArrowSystem() {
  // 1. Ajouter le SVG par-dessus le plateau
  const $board = $("#board");
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

  const boardEl = document.getElementById("board");

  // Empêcher le menu contextuel (clic droit navigateur)
  boardEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // --- CORRECTION MAJEURE ICI ---
  // On utilise { capture: true } pour intercepter l'événement AVANT chessboard.js
  boardEl.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) {
        // Clic Droit
        // STOPPER LA PROPAGATION IMMÉDIATEMENT
        // Cela empêche chessboard.js de recevoir le clic et de lancer le drag & drop de la pièce
        e.stopPropagation();
        e.stopImmediatePropagation();

        const square = getSquareFromEvent(e);
        if (square) arrowStartSquare = square;
      } else {
        // Clic Gauche : On laisse passer l'événement pour jouer, mais on efface les flèches
        clearArrows();
      }
    },
    { capture: true },
  ); // <--- C'est ce paramètre qui donne la priorité

  boardEl.addEventListener("mouseup", (e) => {
    if (e.button === 2 && arrowStartSquare) {
      // Pas besoin de stopper la propagation ici, le mal est évité au mousedown
      const arrowEndSquare = getSquareFromEvent(e);

      if (arrowEndSquare && arrowStartSquare !== arrowEndSquare) {
        toggleArrow(arrowStartSquare, arrowEndSquare);
      }
      arrowStartSquare = null;
    }
  });
}

// Récupère la case (ex: "e4") sous la souris
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

// --- FIREBASE USER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const pseudo = data.pseudo || "Joueur";
      document.getElementById("user-name").textContent = pseudo;
      document.getElementById("user-avatar").innerHTML =
        `<img src="https://api.dicebear.com/9.x/adventurer/svg?seed=${pseudo}" alt="Avatar" style="width:100%; height:100%;">`;
    }
  }
});

// --- LOGIQUE JEU ---

async function loadRandomPuzzle() {
  updateStatus("Recherche...", false);
  deselectSquare();

  $("#board .square-55d63").removeClass("last-move-highlight");
  clearArrows();

  isPuzzleLocked = false;
  isWrongMoveState = false;
  moveIndex = 0;
  toggleRetryButton(false);

  const feedbackEl = document.getElementById("feedback-area");
  feedbackEl.className = "feedback";
  feedbackEl.innerHTML = "";

  document.getElementById("move-history").innerHTML =
    '<span class="empty-history">Chargement...</span>';

  const randomId = generateRandomId();
  try {
    const puzzlesRef = collection(db, "puzzles");
    const q = query(puzzlesRef, where("__name__", ">=", randomId), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) setupPuzzle(snapshot.docs[0].data());
    else loadRandomPuzzle();
  } catch (error) {
    console.error("Erreur", error);
  }
}

function setupPuzzle(data) {
  currentPuzzle = data;
  document.getElementById("streak-display").innerText = currentStreak;
  document.getElementById("puzzle-rating").innerText = data.rating;

  const elo = data.rating;
  const badge = document.getElementById("difficulty-badge");
  let text = "Moyen",
    cssClass = "medium";
  if (elo < 700) {
    text = "Débutant";
    cssClass = "easy";
  } else if (elo < 1000) {
    text = "Facile";
    cssClass = "easy";
  } else if (elo < 1300) {
    text = "Moyen";
    cssClass = "medium";
  } else if (elo < 1500) {
    text = "Difficile";
    cssClass = "hard";
  } else {
    text = "Expert";
    cssClass = "expert";
  }
  badge.innerText = text;
  badge.className = `difficulty-badge ${cssClass}`;

  game.load(data.fen);
  board.position(data.fen, false);

  setTimeout(() => {
    renderArrows();
  }, 100);

  let movesList = Array.isArray(data.moves)
    ? data.moves
    : data.moves.split(" ");
  currentPuzzle.movesList = movesList;

  setTimeout(() => {
    makeMoveOnBoard(movesList[0]);
    moveIndex = 1;
    updateStatusWithTurn();
  }, 500);
}

function attemptMove(source, target) {
  if (isWrongMoveState) return null;

  var move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return null;

  clearArrows(); // Effacer les flèches après un coup valide

  board.position(game.fen());
  updateMoveHistory();
  highlightLastMove();
  checkPuzzleProgress(source, target, move);
  return move;
}

function checkPuzzleProgress(source, target, moveObj) {
  const playedMoveUCI =
    moveObj.from + moveObj.to + (moveObj.promotion ? moveObj.promotion : "");
  const expectedMoveString = currentPuzzle.movesList[moveIndex];

  if (playedMoveUCI === expectedMoveString) {
    moveIndex++;
    if (moveIndex >= currentPuzzle.movesList.length) {
      currentStreak++;
      document.getElementById("streak-display").innerText = currentStreak;

      let successMessage = "Puzzle Réussi ! 🎉";
      if (currentPuzzle.themes) {
        const themes = currentPuzzle.themes.split(" ");
        for (let theme of themes)
          if (THEMES_FR[theme]) {
            successMessage = THEMES_FR[theme];
            break;
          }
      }
      showFeedback(true, successMessage);
      isPuzzleLocked = true;
      toggleRetryButton(false);
    } else {
      setTimeout(playComputerReply, 500);
    }
  } else {
    currentStreak = 0;
    document.getElementById("streak-display").innerText = currentStreak;
    askStockfishRefutation();
    isWrongMoveState = true;
    toggleRetryButton(true);
  }
}

function askStockfishRefutation() {
  const feedbackEl = document.getElementById("feedback-area");
  if (!isEngineReady || !stockfish) {
    showFeedback(false, "Mauvais coup.");
    return;
  }

  feedbackEl.innerHTML = `<span class="error-title">Mauvais coup !</span><span class="analysis-text analyzing">🧠 Analyse en cours...</span>`;
  feedbackEl.className = "feedback error visible";

  const fenAfterBadMove = game.fen();
  const originalHandler = stockfish.onmessage;

  stockfish.onmessage = function (event) {
    const message = event.data ? event.data : event;
    if (typeof message === "string" && message.startsWith("bestmove")) {
      const parts = message.split(" ");
      const bestReply = parts[1];
      if (bestReply && bestReply !== "(none)" && bestReply.length >= 4) {
        const tempGame = new Chess(fenAfterBadMove);
        const moveDetails = tempGame.move({
          from: bestReply.substring(0, 2),
          to: bestReply.substring(2, 4),
          promotion: bestReply.length > 4 ? bestReply[4] : undefined,
        });
        if (moveDetails) {
          feedbackEl.innerHTML = `<span class="error-title">Mauvais coup !</span><div class="stockfish-response"><span class="stockfish-icon">🤖</span><span class="analysis-text">L'adversaire répond <strong>${moveDetails.san}</strong> et gagne.</span></div>`;
        } else
          feedbackEl.innerHTML = `<span class="error-title">Mauvais coup !</span>`;
      } else
        feedbackEl.innerHTML = `<span class="error-title">Mauvais coup (Mat ou Pat).</span>`;
      stockfish.onmessage = originalHandler;
    }
  };
  stockfish.postMessage("position fen " + fenAfterBadMove);
  stockfish.postMessage("go depth 15");
}

function retryLastMove() {
  if (!isWrongMoveState) return;
  game.undo();
  board.position(game.fen());
  updateMoveHistory();
  highlightLastMove();
  clearArrows();

  isWrongMoveState = false;
  toggleRetryButton(false);
  const feedbackEl = document.getElementById("feedback-area");
  feedbackEl.className = "feedback";
  feedbackEl.innerHTML = "";
  updateStatusWithTurn();
}

// --- FONCTIONS VISUELLES ---

function highlightLastMove() {
  $("#board .square-55d63").removeClass("last-move-highlight");
  const history = game.history({ verbose: true });
  if (history.length > 0) {
    const lastMove = history[history.length - 1];
    $("#board .square-" + lastMove.from).addClass("last-move-highlight");
    $("#board .square-" + lastMove.to).addClass("last-move-highlight");
  }
}

function showHint() {
  if (isPuzzleLocked || isWrongMoveState) return;
  const nextMove = currentPuzzle.movesList[moveIndex];
  const fromSquare = nextMove.substring(0, 2);
  const bubble = document.getElementById("hint-bubble");
  bubble.innerText = `💡 Indice : Regarde la pièce en ${fromSquare} !`;
  bubble.classList.add("visible");
  $("#board .square-" + fromSquare).addClass("highlight1-32417");
  setTimeout(() => {
    bubble.classList.remove("visible");
    $("#board .square-" + fromSquare).removeClass("highlight1-32417");
  }, 3000);
}

function handleSquareInteraction(square) {
  if (isPuzzleLocked || game.game_over() || isWrongMoveState) return;
  clearArrows();

  if (selectedSquare !== null) {
    if (square === selectedSquare) {
      deselectSquare();
      return;
    }
    var move = attemptMove(selectedSquare, square);
    if (move === null) {
      var piece = game.get(square);
      if (piece && piece.color === game.turn()) selectSquare(square);
      else deselectSquare();
    } else deselectSquare();
  } else {
    var piece = game.get(square);
    if (piece && piece.color === game.turn()) selectSquare(square);
  }
}

function onDragStart(source, piece) {
  if (isPuzzleLocked || game.game_over() || isWrongMoveState) return false;
  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  )
    return false;

  draggedSource = source;
  clearArrows();
  if (selectedSquare && selectedSquare !== source) deselectSquare();
  highlightLegalMoves(source);
}

function onDrop(source, target) {
  draggedSource = null;
  removeHighlights();
  if (source === target) {
    handleSquareInteraction(source);
    return "snapback";
  }
  var move = attemptMove(source, target);
  if (move === null) return "snapback";
}

function onSnapEnd() {
  board.position(game.fen());
}
function toggleRetryButton(show) {
  const btn = document.getElementById("btn-retry");
  btn.style.display = show ? "block" : "none";
  document.getElementById("btn-hint").style.display = show ? "none" : "block";
}
function playComputerReply() {
  const nextMoveStr = currentPuzzle.movesList[moveIndex];
  makeMoveOnBoard(nextMoveStr);
  moveIndex++;
  updateStatusWithTurn();
}
function makeMoveOnBoard(moveStr) {
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  game.move({ from: from, to: to, promotion: "q" });
  board.position(game.fen());
  updateMoveHistory();
  highlightLastMove();
}
function updateMoveHistory() {
  const history = game.history();
  const listElement = document.getElementById("move-history");
  if (history.length === 0) {
    listElement.innerHTML =
      '<span class="empty-history">Début de la partie</span>';
    return;
  }
  let html = "";
  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = i / 2 + 1;
    html += `<div class="move-pair"><span class="move-number">${moveNumber}.</span><span class="move-white">${history[i]}</span>${history[i + 1] ? `<span class="move-black">${history[i + 1]}</span>` : ""}</div>`;
  }
  listElement.innerHTML = html;
  listElement.scrollTop = listElement.scrollHeight;
}
function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Aux Blancs" : "Aux Noirs";
  updateStatus(`Trait ${turn} !`);
  board.orientation(game.turn() === "w" ? "white" : "black");
  renderArrows();
}
function updateStatus(text) {
  document.getElementById("status-text").innerText = text;
}
function showFeedback(success, message) {
  const el = document.getElementById("feedback-area");
  el.innerHTML = message;
  el.className = success
    ? "feedback success visible"
    : "feedback error visible";
}
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
  var moves = game.moves({ square: square, verbose: true });
  for (var i = 0; i < moves.length; i++) {
    var target = moves[i].to;
    if (moves[i].flags.includes("c") || moves[i].flags.includes("e"))
      $("#board .square-" + target).addClass("legal-capture");
    else $("#board .square-" + target).addClass("legal-move");
  }
}
function onMouseoverSquare(square) {
  if (!draggedSource) return;
  var moves = game.moves({ square: draggedSource, verbose: true });
  if (moves.find((m) => m.to === square))
    $("#board .square-" + square).addClass("legal-hover");
}
function onMouseoutSquare(square) {
  $("#board .square-" + square).removeClass("legal-hover");
}
function removeHighlights() {
  $("#board .square-55d63").removeClass("legal-move legal-capture legal-hover");
}
function generateRandomId() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}
