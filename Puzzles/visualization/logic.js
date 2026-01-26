// logic.js (VISUALISATION - STOCKFISH LOCAL CORRIGÉ & UX AMÉLIORÉE + FLÈCHES + PROGRESSION ELO)

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
  setDoc, // <--- AJOUTÉ
  increment,
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

// --- 2. CONFIGURATION SONS ---
const audioUrls = {
  move: "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
  capture:
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
  notify:
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Victory.mp3",
  error:
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Error.mp3",
};

const sounds = {
  move: new Audio(audioUrls.move),
  capture: new Audio(audioUrls.capture),
  notify: new Audio(audioUrls.notify),
  error: new Audio(audioUrls.error),
};

// --- 3. CONFIGURATION STOCKFISH (LOCAL CORRIGÉ) ---
var stockfish = null;
var isEngineReady = false;

try {
  stockfish = new Worker("../../js/stockfish.js");

  stockfish.onmessage = function (event) {
    const message = event.data ? event.data : event;

    // Stockfish répond à uci avec uciok
    if (message === "uciok") {
      stockfish.postMessage("isready");
      console.log("📡 Stockfish UCI initialisé");
    }

    // Puis répond readyok
    if (message === "readyok") {
      isEngineReady = true;
      console.log("✅ Stockfish est prêt !");
    }
  };

  stockfish.onerror = function (e) {
    console.error(
      "❌ Erreur Stockfish : Vérifiez que stockfish.js et stockfish.wasm sont dans le bon dossier",
      e,
    );
    isEngineReady = false;
  };

  // Initialisation UCI
  stockfish.postMessage("uci");
} catch (e) {
  console.warn("⚠️ Impossible de charger Stockfish. Vérifiez les fichiers.", e);
}

// Variables Globales
var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var currentStreak = 0;
var isPuzzleLocked = false;

// --- AJOUT : Variables pour les flèches ---
var arrowStartSquare = null;
var arrowsList = [];
// -----------------------------------------

var config = {
  draggable: false, // Visualisation : on ne bouge pas les pièces à la main
  position: "start",
  pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
};

document.addEventListener("DOMContentLoaded", () => {
  board = Chessboard("board", config);
  window.addEventListener("resize", board.resize);

  // --- AJOUT : Initialiser le système de flèches ---
  initArrowSystem();
  // ------------------------------------------------

  // Débloquer l'audio au premier clic
  document.body.addEventListener("click", unlockAudio, { once: true });

  const inputEl = document.getElementById("move-input");
  if (inputEl) {
    inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") checkUserAnswer();
    });

    // --- AJOUT : Effacer le feedback quand l'utilisateur réagit ---
    const clearFeedback = () => {
      const feedbackEl = document.getElementById("feedback-area");
      if (feedbackEl) {
        // On retire les classes pour le rendre invisible et on vide le texte
        feedbackEl.className = "feedback";
        feedbackEl.innerHTML = "";
      }
    };

    // Déclenche le nettoyage au focus (clic dedans) ou à la saisie (input)
    inputEl.addEventListener("input", clearFeedback);
    inputEl.addEventListener("focus", clearFeedback);
    // -------------------------------------------------------------
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

function unlockAudio() {
  sounds.move
    .play()
    .then(() => {
      sounds.move.pause();
      sounds.move.currentTime = 0;
    })
    .catch(() => {});
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

// --- CHARGEMENT ---

async function loadRandomPuzzle() {
  document.getElementById("move-input").value = "";
  document.getElementById("move-input").disabled = false;
  document.getElementById("move-input").focus();
  document.getElementById("feedback-area").className = "feedback";
  document.getElementById("feedback-area").innerText = "";

  // --- AJOUT : Nettoyer les flèches au nouveau puzzle ---
  clearArrows();
  // -----------------------------------------------------

  isPuzzleLocked = false;
  moveIndex = 0;

  if (board) board.resize();

  const randomId = generateRandomId();

  try {
    const puzzlesRef = collection(db, "puzzles");
    const q = query(puzzlesRef, where("__name__", ">=", randomId), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      setupPuzzle(snapshot.docs[0].data());
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

  // Jouer le 1er coup
  setTimeout(() => {
    makeMoveOnBoard(movesList[0]);
    moveIndex = 1;
    updateStatusWithTurn();
  }, 500);
}

// --- VERIFICATION ---

window.checkUserAnswer = function () {
  if (isPuzzleLocked) return;

  const inputEl = document.getElementById("move-input");
  let userText = inputEl.value.trim();
  if (!userText) return;

  const englishMove = translateToEnglish(userText);
  const moveObj = game.move(englishMove);

  if (moveObj === null) {
    playSound("error");
    showFeedback(false, "Format invalide (ex: Cf3, e5).");
    return;
  }

  game.undo();

  const playedMoveUCI = moveObj.from + moveObj.to;
  const finalUCI = moveObj.promotion
    ? playedMoveUCI + moveObj.promotion
    : playedMoveUCI;
  const expectedMove = currentPuzzle.movesList[moveIndex];

  if (finalUCI === expectedMove) {
    handleSuccess(moveObj.san, moveObj.flags.includes("c"));
  } else {
    handleFailure(playedMoveUCI);
  }
};

function handleSuccess(sanMove, isCapture) {
  if (isCapture) playSound("capture");
  else playSound("move");

  showFeedback(true, `Bien joué ! ${sanMove} est correct.`);

  makeMoveOnBoard(currentPuzzle.movesList[moveIndex]);
  moveIndex++;

  if (moveIndex >= currentPuzzle.movesList.length) {
    playSound("notify");
    currentStreak++;
    document.getElementById("streak-display").innerText = currentStreak;
    document.getElementById("move-input").disabled = true;
    showFeedback(true, "Visualisation réussie ! 🎉");
    updateVisuStats(true); // <--- Appel de la nouvelle fonction
    isPuzzleLocked = true;
  } else {
    setTimeout(() => {
      const computerMove = currentPuzzle.movesList[moveIndex];

      const tempGame = new Chess(game.fen());
      const moveDetails = tempGame.move({
        from: computerMove.substring(0, 2),
        to: computerMove.substring(2, 4),
        promotion: "q",
      });
      if (moveDetails && moveDetails.flags.includes("c")) playSound("capture");
      else playSound("move");

      makeMoveOnBoard(computerMove);
      moveIndex++;
      updateStatusWithTurn();
      document.getElementById("move-input").value = "";
      showFeedback(true, "Correct ! Quel est le coup suivant ?");
    }, 500);
  }
}

function handleFailure(badMoveUCI) {
  playSound("error");
  currentStreak = 0;
  document.getElementById("streak-display").innerText = 0;

  showFeedback(false, "Mauvais coup.");
  updateVisuStats(false); // <--- Appel de la nouvelle fonction
  // Analyse Stockfish
  askStockfishRefutation(badMoveUCI);
}

// --- STOCKFISH ANALYSE (CORRIGÉ) ---

function askStockfishRefutation(badMoveUCI) {
  const feedbackEl = document.getElementById("feedback-area");

  if (!isEngineReady || !stockfish) {
    feedbackEl.innerHTML = `
      <span class="error-title">Mauvais coup !</span>
      <span class="analysis-text">Analyse non disponible - Vérifiez stockfish.js</span>
    `;
    return;
  }

  feedbackEl.innerHTML = `
    <span class="error-title">Mauvais coup !</span>
    <span class="analysis-text analyzing">🧠 Analyse en cours...</span>
  `;

  // 1. Simuler le mauvais coup
  const moveResult = game.move({
    from: badMoveUCI.substring(0, 2),
    to: badMoveUCI.substring(2, 4),
    promotion: badMoveUCI.length > 4 ? badMoveUCI[4] : "q",
  });

  if (!moveResult) {
    feedbackEl.innerHTML = `<span class="error-title">Mauvais coup !</span>`;
    return;
  }

  const fenAfterBadMove = game.fen();
  game.undo();

  // 2. Sauvegarder le handler original
  const originalHandler = stockfish.onmessage;

  // 3. Créer un handler temporaire pour cette analyse
  stockfish.onmessage = function (event) {
    const message = event.data ? event.data : event;

    // Afficher tous les messages pour debug
    if (typeof message === "string" && !message.startsWith("info")) {
      console.log("Stockfish:", message);
    }

    // Traiter la meilleure réponse
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
          const sanReply = moveDetails.san;
          feedbackEl.innerHTML = `
            <span class="error-title">Mauvais coup !</span>
            <div class="stockfish-response">
              <span class="stockfish-icon">🤖</span>
              <span class="analysis-text">L'adversaire répond <strong>${sanReply}</strong> et obtient un avantage décisif.</span>
            </div>
          `;
        } else {
          feedbackEl.innerHTML = `
            <span class="error-title">Ce coup est une erreur tactique.</span>
            <span class="analysis-text">Essayez un autre coup.</span>
          `;
        }
      } else {
        feedbackEl.innerHTML = `
          <span class="error-title">Mauvais coup détecté.</span>
          <span class="analysis-text">Ce coup n'est pas optimal dans cette position.</span>
        `;
      }

      // Restaurer le handler original
      stockfish.onmessage = originalHandler;
    }
  };

  // 4. Envoyer la position à analyser
  stockfish.postMessage("position fen " + fenAfterBadMove);
  stockfish.postMessage("go depth 15");
}

// --- UTILITAIRES ---

function playSound(type) {
  if (sounds[type]) {
    const soundClone = sounds[type].cloneNode();
    soundClone
      .play()
      .catch((e) => console.warn("Son bloqué par le navigateur", e));
  }
}

function translateToEnglish(text) {
  let s = text;
  s = s.replace(/R/g, "K");
  s = s.replace(/D/g, "Q");
  s = s.replace(/T/g, "R");
  s = s.replace(/F/g, "B");
  s = s.replace(/C/g, "N");
  return s;
}

function makeMoveOnBoard(moveStr) {
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  const promotion = moveStr.length > 4 ? moveStr[4] : "q";
  game.move({ from: from, to: to, promotion: promotion });
  board.position(game.fen());
  // --- AJOUT : Redessiner les flèches si l'orientation change ou autre ---
  // (Pas strictement nécessaire ici car board.position ne casse pas le SVG overlay)
}

function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Aux Blancs" : "Aux Noirs";
  document.getElementById("status-text").innerText = `${turn}`;
}

function updateSidebarUI(elo) {
  document.getElementById("streak-display").innerText = currentStreak;
  const badge = document.getElementById("difficulty-badge");
  if (badge) {
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
}

function showFeedback(isSuccess, message) {
  const el = document.getElementById("feedback-area");
  el.innerHTML = message;
  el.className = isSuccess
    ? "feedback success visible"
    : "feedback error visible";
}

function showHint() {
  const expectedMove = currentPuzzle.movesList[moveIndex];
  const piece = game.get(expectedMove.substring(0, 2));
  const pieceName = piece.type === "p" ? "Pion" : piece.type.toUpperCase();

  const bubble = document.getElementById("hint-bubble");
  if (bubble) {
    bubble.innerText = `💡 Indice : ${pieceName} en ${expectedMove.substring(0, 2)}...`;
    bubble.classList.add("visible");
    setTimeout(() => {
      bubble.classList.remove("visible");
    }, 3000);
  }
}

function generateRandomId() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// =======================================================
// SYSTEME DE FLÈCHES ET CERCLES (VISUALISATION / LOGIC.JS)
// =======================================================

function initArrowSystem() {
  const $board = $("#board");

  // 1. Création du SVG Overlay
  const svgOverlay = `
    <svg id="arrow-overlay" viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowhead" markerWidth="3" markerHeight="3" refX="2" refY="1.5" orient="auto">
          <polygon points="0 0, 3 1.5, 0 3" class="arrow-head" />
        </marker>
      </defs>
      <g id="arrows-layer"></g>
    </svg>
  `;
  $board.append(svgOverlay);

  const boardEl = document.getElementById("board");

  // 2. Bloquer le menu contextuel par défaut
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // 3. Mouse Down (Début du tracé - Clic Droit uniquement)
  boardEl.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 2) {
        e.stopPropagation(); // On empêche la propagation

        const square = getSquareFromEvent(e);
        if (square) arrowStartSquare = square;
      } else {
        // Clic Gauche : On efface tout
        clearArrows();
      }
    },
    { capture: true }, // Capture obligatoire pour prendre le dessus
  );

  // 4. Mouse Up (Fin du tracé)
  boardEl.addEventListener("mouseup", (e) => {
    if (e.button === 2 && arrowStartSquare) {
      const arrowEndSquare = getSquareFromEvent(e);

      // Si on relâche sur une case valide (même si c'est la même)
      if (arrowEndSquare) {
        toggleArrow(arrowStartSquare, arrowEndSquare);
      }
      arrowStartSquare = null;
    }
  });
}

// Récupère la case sous la souris (ex: "e4")
function getSquareFromEvent(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const squareEl = $(el).closest(".square-55d63");
  return squareEl.length ? squareEl.attr("data-square") : null;
}

// Ajoute ou enlève une flèche/cercle de la liste
function toggleArrow(from, to) {
  const index = arrowsList.findIndex((a) => a.from === from && a.to === to);

  if (index !== -1) {
    // Si elle existe, on l'enlève
    arrowsList.splice(index, 1);
  } else {
    // Sinon on l'ajoute
    arrowsList.push({ from, to });
  }
  renderArrows();
}

function clearArrows() {
  arrowsList = [];
  renderArrows();
}

// Dessine les formes SVG
function renderArrows() {
  const layer = document.getElementById("arrows-layer");
  if (!layer) return;
  layer.innerHTML = ""; // Reset du calque

  arrowsList.forEach((arrow) => {
    const coords = getArrowCoordinates(arrow.from, arrow.to);

    // CAS 1 : CERCLE (Départ == Arrivée)
    if (arrow.from === arrow.to) {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", coords.x1);
      circle.setAttribute("cy", coords.y1);
      circle.setAttribute("r", "0.42");
      circle.setAttribute("class", "arrow-circle");
      layer.appendChild(circle);
    }
    // CAS 2 : FLÈCHE (Départ != Arrivée)
    else {
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", coords.x1);
      line.setAttribute("y1", coords.y1);
      line.setAttribute("x2", coords.x2);
      line.setAttribute("y2", coords.y2);
      line.setAttribute("class", "arrow-line");
      line.setAttribute("marker-end", "url(#arrowhead)");
      layer.appendChild(line);
    }
  });
}

// Calcule les coordonnées SVG (0 à 8) en fonction de l'orientation du plateau
function getArrowCoordinates(from, to) {
  const files = "abcdefgh";
  const ranks = "12345678";

  let x1, y1, x2, y2;

  // On vérifie l'orientation actuelle du plateau
  const orientation = board.orientation(); // 'white' ou 'black'

  if (orientation === "white") {
    y1 = 7 - ranks.indexOf(from[1]);
    y2 = 7 - ranks.indexOf(to[1]);
    x1 = files.indexOf(from[0]);
    x2 = files.indexOf(to[0]);
  } else {
    // Si on est Noir, le plateau est tourné : h8 est en bas à gauche (0,7 en SVG)
    y1 = ranks.indexOf(from[1]);
    y2 = ranks.indexOf(to[1]);
    x1 = 7 - files.indexOf(from[0]);
    x2 = 7 - files.indexOf(to[0]);
  }

  return {
    x1: x1 + 0.5, // +0.5 pour centrer dans la case
    y1: y1 + 0.5,
    x2: x2 + 0.5,
    y2: y2 + 0.5,
  };
}

// --- SAUVEGARDE STATS (MODE VISUALISATION - CORRIGÉ ELO + MERGE) ---
async function updateVisuStats(isWin) {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "users", user.uid);

  try {
    // 1. On récupère les stats actuelles
    const docSnap = await getDoc(userRef);
    const userData = docSnap.exists() ? docSnap.data() : {};

    // 2. On récupère l'Elo actuel (ou 1000 par défaut si nouveau)
    let currentElo = userData.currentVisuElo || 1000;
    const bestElo = userData.bestVisuElo || 1000;

    // 3. Calcul du nouveau score (+10 ou -10)
    if (isWin) {
      currentElo += 10;
    } else {
      currentElo = Math.max(100, currentElo - 10); // On ne descend pas sous 100
    }

    // 4. Préparation de la mise à jour
    const updates = {
      currentVisuElo: currentElo, // Ton niveau actuel
    };

    if (isWin) {
      updates.visuSolved = increment(1);
      updates.visuStreak = increment(1);

      // Si ton nouveau niveau bat ton record, on met à jour le record
      if (currentElo > bestElo) {
        updates.bestVisuElo = currentElo;
      }
    } else {
      updates.visuStreak = 0;
    }

    // 5. SAUVEGARDE SÉCURISÉE (setDoc + merge)
    // C'est ce qui répare le bug de ton ami : si le doc n'existe pas, il le crée
    await setDoc(userRef, updates, { merge: true });

    console.log(`Niveau Visualisation mis à jour : ${currentElo}`);
  } catch (error) {
    console.error("Erreur sauvegarde stats visu:", error);
  }
}
