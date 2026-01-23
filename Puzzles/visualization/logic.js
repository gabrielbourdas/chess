// logic.js (VISUALISATION - VERSION FIREBASE)

// Importation Firebase
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

// --- CONFIGURATION FIREBASE ---
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

// Variables Globales
var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var currentStreak = 0;
var isPuzzleLocked = false;

// Config du plateau
var config = {
  draggable: false, // INTERDIT DE BOUGER LES PIÈCES (Visualisation)
  position: "start",
  pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
};

document.addEventListener("DOMContentLoaded", () => {
  board = Chessboard("board", config);
  window.addEventListener("resize", board.resize);

  const inputEl = document.getElementById("move-input");
  if (inputEl) {
    inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") checkUserAnswer();
    });
  }

  document
    .getElementById("btn-submit")
    .addEventListener("click", checkUserAnswer);
  document
    .getElementById("btn-next")
    .addEventListener("click", loadRandomPuzzle);
  document.getElementById("btn-hint").addEventListener("click", showHint);

  setTimeout(loadRandomPuzzle, 200);
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

// --- CHARGEMENT DU PUZZLE ---

async function loadRandomPuzzle() {
  document.getElementById("move-input").value = "";
  document.getElementById("move-input").disabled = false;
  document.getElementById("move-input").focus();
  document.getElementById("feedback-area").className = "feedback";
  document.getElementById("feedback-area").innerText = "";
  isPuzzleLocked = false;
  moveIndex = 0;

  if (board) board.resize();

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
    console.error("Erreur Firebase", error);
  }
}

function setupPuzzle(data) {
  currentPuzzle = data;

  updateSidebarUI(data.rating);

  const ratingEl = document.getElementById("puzzle-rating");
  if (ratingEl) ratingEl.innerText = (data.rating || "1200") + " Elo";

  game.load(data.fen);
  board.position(data.fen, false);

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

// --- VERIFICATION DE LA REPONSE ---

window.checkUserAnswer = function () {
  if (isPuzzleLocked) return;

  const inputEl = document.getElementById("move-input");
  let userText = inputEl.value.trim();
  if (!userText) return;

  const englishMove = translateToEnglish(userText);
  const moveObj = game.move(englishMove);

  if (moveObj === null) {
    showFeedback(false, "Coup impossible ou notation invalide.");
    return;
  }

  game.undo();

  const playedMoveUCI = moveObj.from + moveObj.to;
  const finalUCI = moveObj.promotion
    ? playedMoveUCI + moveObj.promotion
    : playedMoveUCI;
  const expectedMove = currentPuzzle.movesList[moveIndex];

  if (finalUCI === expectedMove) {
    handleSuccess(moveObj.san);
  } else {
    handleFailure();
  }
};

function handleSuccess(sanMove) {
  showFeedback(true, `Bien joué ! ${sanMove} est correct.`);

  makeMoveOnBoard(currentPuzzle.movesList[moveIndex]);
  moveIndex++;

  if (moveIndex >= currentPuzzle.movesList.length) {
    currentStreak++;
    document.getElementById("streak-display").innerText = currentStreak;
    document.getElementById("move-input").disabled = true;
    showFeedback(true, "Visualisation réussie ! 🎉");
    isPuzzleLocked = true;
  } else {
    setTimeout(() => {
      makeMoveOnBoard(currentPuzzle.movesList[moveIndex]);
      moveIndex++;
      updateStatusWithTurn();
      document.getElementById("move-input").value = "";
      showFeedback(true, "Correct ! Quel est le coup suivant ?");
    }, 500);
  }
}

function handleFailure() {
  currentStreak = 0;
  document.getElementById("streak-display").innerText = 0;
  showFeedback(false, "Ce n'est pas le bon coup. Réessaie !");
}

// --- UTILITAIRES ---

function translateToEnglish(text) {
  let s = text;
  s = s.replace(/R/g, "K"); // Roi
  s = s.replace(/D/g, "Q"); // Dame
  s = s.replace(/T/g, "R"); // Tour
  s = s.replace(/F/g, "B"); // Fou
  s = s.replace(/C/g, "N"); // Cavalier
  return s;
}

function makeMoveOnBoard(moveStr) {
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  game.move({ from: from, to: to, promotion: "q" });
  board.position(game.fen());
}

function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Aux Blancs" : "Aux Noirs";
  document.getElementById("status-text").innerText = `${turn}`;
}

function updateSidebarUI(elo) {
  document.getElementById("streak-display").innerText = currentStreak;

  const badge = document.getElementById("difficulty-badge");
  let text = "Moyen",
    cssClass = "medium";
  if (elo < 1200) {
    text = "Facile";
    cssClass = "easy";
  } else if (elo > 1400) {
    text = "Difficile";
    cssClass = "hard";
  }

  badge.innerText = text;
  badge.className = `difficulty-badge ${cssClass}`;
}

function showFeedback(isSuccess, message) {
  const el = document.getElementById("feedback-area");
  el.innerText = message;
  el.className = isSuccess
    ? "feedback success visible"
    : "feedback error visible";
}

// --- NOUVELLE FONCTION INDICE AVEC INFOBULLE ---
function showHint() {
  const expectedMove = currentPuzzle.movesList[moveIndex]; // "e2e4"
  // On trouve la pièce
  const piece = game.get(expectedMove.substring(0, 2));
  const pieceName = piece.type === "p" ? "Pion" : piece.type.toUpperCase();

  // On affiche l'infobulle
  const bubble = document.getElementById("hint-bubble");
  bubble.innerText = `💡 Indice : ${pieceName} en ${expectedMove.substring(0, 2)}...`;
  bubble.classList.add("visible");

  // On cache l'infobulle après 3 secondes
  setTimeout(() => {
    bubble.classList.remove("visible");
  }, 3000);
}

function generateRandomId() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}
