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

// --- 2. DICTIONNAIRE DES THÈMES ---
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
  zugzwang: "Zugzwang ! L'adversaire est bloqué.",
  deflection: "Déviation réussie !",
  attraction: "Sacrifice d'attraction !",
  interference: "Interférence tactique !",
  clearance: "Dégagement de case !",
  endgame: "Bien joué pour cette finale.",
};

// Variables Globales
var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var isPuzzleLocked = false;
var isWrongMoveState = false;
var currentStreak = 0; // <--- NOUVELLE VARIABLE SÉRIE

// Variables UI
var selectedSquare = null;
var draggedSource = null;

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

  isPuzzleLocked = false;
  isWrongMoveState = false;
  moveIndex = 0;
  toggleRetryButton(false);
  document.getElementById("feedback-area").classList.remove("visible");

  // Reset de l'historique visuel
  document.getElementById("move-history").innerHTML =
    '<span class="empty-history">Chargement...</span>';

  const randomId = generateRandomId();
  try {
    const puzzlesRef = collection(db, "puzzles");
    const q = query(puzzlesRef, where("__name__", ">=", randomId), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      setupPuzzle(doc.data());
    } else {
      loadRandomPuzzle();
    }
  } catch (error) {
    console.error("Erreur", error);
  }
}

function setupPuzzle(data) {
  currentPuzzle = data;

  // --- MISE À JOUR SÉRIE & ELO ---
  document.getElementById("streak-display").innerText = currentStreak; // Affiche la série
  document.getElementById("puzzle-rating").innerText = data.rating;
  document.getElementById("move-history").innerHTML =
    '<span class="empty-history">À vous de jouer...</span>';
  const elo = data.rating;
  const badge = document.getElementById("difficulty-badge");
  let text = "Moyen";
  let cssClass = "medium";

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
  badge.className = `difficulty-badge ${cssClass}`; // Applique la couleur

  // 3. Remplir les autres infos
  document.getElementById("puzzle-rating").innerText = data.rating;
  document.getElementById("move-history").innerHTML =
    '<span class="empty-history">À vous de jouer...</span>';
  // ----------------------------------

  game.load(data.fen);
  board.position(data.fen, false);

  let movesList = Array.isArray(data.moves)
    ? data.moves
    : data.moves.split(" ");
  currentPuzzle.movesList = movesList;

  // Jouer le coup adverse
  setTimeout(() => {
    makeMoveOnBoard(movesList[0]);
    moveIndex = 1;
    updateStatusWithTurn();
  }, 500);
}

// --- LOGIQUE DE VALIDATION & ERREUR ---

function attemptMove(source, target) {
  if (isWrongMoveState) return null;

  var move = game.move({ from: source, to: target, promotion: "q" });
  if (move === null) return null;

  board.position(game.fen());
  updateMoveHistory();
  checkPuzzleProgress(source, target);
  return move;
}

function checkPuzzleProgress(source, target) {
  const userMoveString = source + target;
  const expectedMoveString = currentPuzzle.movesList[moveIndex];

  let isCorrect = false;
  if (expectedMoveString.length > 4) {
    isCorrect = userMoveString + "q" === expectedMoveString;
  } else {
    isCorrect = userMoveString === expectedMoveString;
  }

  if (isCorrect) {
    // --- BON COUP ---
    moveIndex++;
    if (moveIndex >= currentPuzzle.movesList.length) {
      // VICTOIRE
      currentStreak++; // On augmente la série
      document.getElementById("streak-display").innerText = currentStreak;

      let successMessage = "Puzzle Réussi ! 🎉";
      if (currentPuzzle.themes) {
        const themes = currentPuzzle.themes.split(" ");
        for (let theme of themes) {
          if (THEMES_FR[theme]) {
            successMessage = THEMES_FR[theme];
            break;
          }
        }
      }

      showFeedback(true, successMessage);
      isPuzzleLocked = true;
      toggleRetryButton(false);
    } else {
      setTimeout(playComputerReply, 500);
    }
  } else {
    // --- MAUVAIS COUP ---
    currentStreak = 0; // On remet à zéro
    document.getElementById("streak-display").innerText = currentStreak;

    showFeedback(false, "Mauvais coup !");
    isWrongMoveState = true;
    toggleRetryButton(true);
  }
}

function retryLastMove() {
  if (!isWrongMoveState) return;
  game.undo();
  board.position(game.fen());

  updateMoveHistory();

  isWrongMoveState = false;
  toggleRetryButton(false);
  document.getElementById("feedback-area").classList.remove("visible");
  updateStatusWithTurn();
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

// --- VISUEL & INTERACTION ---

function handleSquareInteraction(square) {
  if (isPuzzleLocked || game.game_over() || isWrongMoveState) return;

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
    } else {
      deselectSquare();
    }
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

// --- UTILITAIRES ---

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
    const whiteMove = history[i];
    const blackMove = history[i + 1] || "";

    html += `
          <div class="move-pair">
              <span class="move-number">${moveNumber}.</span>
              <span class="move-white">${whiteMove}</span>
              ${blackMove ? `<span class="move-black">${blackMove}</span>` : ""}
          </div>
      `;
  }

  listElement.innerHTML = html;
  listElement.scrollTop = listElement.scrollHeight;
}

function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Aux Blancs" : "Aux Noirs";
  updateStatus(`Trait ${turn} !`);
  board.orientation(game.turn() === "w" ? "white" : "black");
}
function updateStatus(text) {
  document.getElementById("status-text").innerText = text;
}

function showFeedback(success, message) {
  const el = document.getElementById("feedback-area");
  el.innerText = message;
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
    if (moves[i].flags.includes("c") || moves[i].flags.includes("e")) {
      $("#board .square-" + target).addClass("legal-capture");
    } else {
      $("#board .square-" + target).addClass("legal-move");
    }
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
