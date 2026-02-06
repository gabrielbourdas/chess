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
  setDoc,
  increment,
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

// --- SYSTÈME AUDIO GLOBAL ROBUSTE ---
const sounds = {
  move: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
  ),
  capture: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
  ),
  // MODIFICATION ICI : On utilise un lien Lichess fiable pour éviter le blocage.
  // "GenericNotify.mp3" est le son par défaut.
  // Si vous avez le fichier "game-end.mp3" de chess.com en local, remplacez le lien ci-dessous par : "./audio/game-end.mp3"
  mate: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/GenericNotify.mp3",
  ),
  error: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Error.mp3",
  ),
};

// Variable pour suivre le son actuellement joué
let currentAudio = null;

// Réglage du volume initial
Object.values(sounds).forEach((s) => (s.volume = 0.5));

// --- GLOBALES ---
var board = null;
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var currentStreak = 0;
var isPuzzleActive = false;
var isWaitingForRetry = false;
var stockfish = null;
var selectedSquare = null;
var pendingMove = null;
var rightClickStart = null;
var arrows = [];
var boardOrientation = "white";
var resultTimeout = null;

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  initBoard("start", "white");
  initStockfish();
  initArrows();

  // Fix visuel
  setTimeout(() => {
    if (board) board.resize();
  }, 200);

  const boardEl = document.getElementById("board");
  if (boardEl) {
    // CLIC GAUCHE
    boardEl.addEventListener("click", (e) => {
      clearArrows();
      if (!isPuzzleActive || isWaitingForRetry) return;
      const square = getSquareFromEvent(e);
      if (square) {
        const piece = game.get(square);
        const isMyPiece = piece && piece.color === game.turn();
        if (!isMyPiece) handleSquareClick(square);
      } else {
        removeSelection();
      }
    });

    // CLIC DROIT
    boardEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });
    boardEl.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 2) {
          e.stopPropagation();
          const square = getSquareFromEvent(e);
          if (square) rightClickStart = square;
        }
      },
      { capture: true },
    );
    boardEl.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 2) {
          e.stopPropagation();
          if (rightClickStart) {
            const square = getSquareFromEvent(e);
            if (square) handleRightClickAction(rightClickStart, square);
          }
          rightClickStart = null;
        }
      },
      { capture: true },
    );
  }

  // Hack Audio : Débloquer les sons au premier clic utilisateur
  document.body.addEventListener("click", unlockAudio, { once: true });

  setupButton("btn-retry", retryPuzzle);
  setupButton("btn-hint", useHint);
  setupButton("btn-result-action", () => {
    const box = document.getElementById("sidebar-puzzle-result");
    if (box && box.classList.contains("success")) {
      loadRandomPuzzle();
    } else {
      retryPuzzle();
    }
  });

  setTimeout(loadRandomPuzzle, 500);
});

function unlockAudio() {
  // On joue et coupe instantanément pour réveiller le moteur audio du navigateur
  Object.values(sounds).forEach((s) => {
    const p = s.play();
    if (p !== undefined) {
      p.then(() => {
        s.pause();
        s.currentTime = 0;
      }).catch(() => {});
    }
  });
}

function setupButton(id, func) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", func);
}

// --- FONCTION SONORE CORRIGÉE ET SÉCURISÉE ---
function playSound(type, waitForCurrent = false) {
  const newSound = sounds[type];
  if (!newSound) return;

  // Si on doit attendre que le son actuel se termine
  if (waitForCurrent && currentAudio && !currentAudio.paused) {
    // On attend la fin du son actuel avant de jouer le nouveau
    const onEnded = () => {
      currentAudio.removeEventListener("ended", onEnded);
      playSound(type, false);
    };
    currentAudio.addEventListener("ended", onEnded);
    return;
  }

  // 1. Si un son joue déjà et qu'on ne doit pas attendre, on l'arrête proprement
  if (currentAudio && !waitForCurrent) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  // 2. On définit le nouveau son comme étant l'actif
  currentAudio = newSound;

  // 3. Réglage volume standard
  currentAudio.volume = 0.5;

  // 4. Lecture sécurisée (avec gestion des Promesses pour éviter le crash)
  const playPromise = currentAudio.play();

  if (playPromise !== undefined) {
    playPromise.catch((error) => {
      // Cette erreur survient si on coupe un son trop vite (interruption)
      // Ou si le fichier est introuvable (403/404)
      console.warn("Audio play interrupted or failed:", error);
    });
  }
}

// Détermine quel son jouer immédiatement (Action physique)
function playMoveSound(move) {
  // PRIORITÉ 1 : MAT (Doit être vérifié AVANT la capture)
  // Utilise le son défini dans sounds.mate
  if (game.in_checkmate()) {
    playSound("mate");
    return;
  }

  // PRIORITÉ 2 : PRISE (Capture)
  if (move.flags.includes("c") || move.flags.includes("e")) {
    playSound("capture");
    return;
  }

  // PRIORITÉ 3 : DÉPLACEMENT STANDARD
  playSound("move");
}

// --- LOGIQUE SÉLECTION ---
function getSquareFromEvent(e) {
  let target = e.target;
  if (target.tagName === "IMG" && target.parentElement)
    target = target.parentElement;
  const squareEl = target.closest('div[class*="square-"]');
  if (!squareEl) return null;
  const match = squareEl.className.match(/square-([a-h][1-8])/);
  return match ? match[1] : null;
}

function handleSquareClick(square) {
  const piece = game.get(square);
  const turn = game.turn();

  if (piece && piece.color === turn) {
    if (selectedSquare === square) removeSelection();
    else {
      removeSelection();
      selectedSquare = square;
      highlightSquare(square);
      showMoveHints(square);
    }
    return;
  }

  if (selectedSquare) {
    handleUserMove(selectedSquare, square, null, false);
    removeSelection();
  }
}

function highlightSquare(square) {
  $("#board").find(`.square-${square}`).addClass("selected-square");
}

function showMoveHints(square) {
  const moves = game.moves({ square: square, verbose: true });
  moves.forEach((move) => {
    const $target = $("#board").find(`.square-${move.to}`);
    if (move.flags.includes("c") || move.flags.includes("e"))
      $target.addClass("capture-hint");
    else $target.addClass("move-hint");
  });
}

function removeSelection() {
  selectedSquare = null;
  const $board = $("#board");
  $board.find(".selected-square").removeClass("selected-square");
  $board.find(".move-hint").removeClass("move-hint");
  $board.find(".capture-hint").removeClass("capture-hint");
}

// --- COEUR DU JEU ---
function handleUserMove(
  source,
  target,
  promotionChoice = null,
  isDrop = false,
) {
  const piece = game.get(source);
  if (!piece) return "snapback";

  // 1. Validation
  const legalMoves = game.moves({ square: source, verbose: true });
  const isValidPromotion = legalMoves.find(
    (m) => m.to === target && m.flags.includes("p"),
  );

  if (isValidPromotion && !promotionChoice) {
    pendingMove = { source, target };
    showPromotionModal(piece.color);
    return "pending";
  }

  // 2. Moteur
  const move = game.move({
    from: source,
    to: target,
    promotion: promotionChoice || "q",
  });
  if (move === null) return "snapback";

  // 3. UI
  if (!isDrop) {
    board.move(source + "-" + target);
  }
  if (
    isValidPromotion ||
    move.flags.includes("k") ||
    move.flags.includes("e")
  ) {
    board.position(game.fen());
  }

  // 4. SON DU MOUVEMENT (Immédiat)
  playMoveSound(move);

  clearArrows();
  updateHistory();
  startEvaluation(game.fen());

  // 5. Validation Puzzle
  let attemptUCI = source + target;
  if (move.promotion) attemptUCI += move.promotion;

  if (
    !currentPuzzle ||
    !currentPuzzle.movesList ||
    moveIndex >= currentPuzzle.movesList.length
  ) {
    return true;
  }

  const expectedMove = currentPuzzle.movesList[moveIndex];

  // Nettoyer tout délai précédent
  if (resultTimeout) clearTimeout(resultTimeout);

  if (attemptUCI === expectedMove) {
    // BON COUP
    handleCorrectMove();
    return true;
  } else {
    // MAUVAIS COUP -> Séquence Erreur
    resultTimeout = setTimeout(handleFailure, 800);
    return true;
  }
}

function handleCorrectMove() {
  moveIndex++;

  // FIN DU PUZZLE ?
  if (moveIndex >= currentPuzzle.movesList.length) {
    // OUI : Séquence Victoire
    if (resultTimeout) clearTimeout(resultTimeout);
    handleVictory();
  } else {
    // NON : Ordi joue
    isPuzzleActive = false;
    setTimeout(() => {
      const computerMoveStr = currentPuzzle.movesList[moveIndex];
      makeComputerMove(computerMoveStr);
      moveIndex++;

      // Check Fin après coup ordi
      if (moveIndex >= currentPuzzle.movesList.length) {
        if (resultTimeout) clearTimeout(resultTimeout);
        handleVictory();
      } else {
        isPuzzleActive = true;
        updateStatusWithTurn();
      }
    }, 600);
  }
}

// --- GESTIONNAIRES FINAUX ---

function handleVictory() {
  // Pas de son "success" ici, seulement l'affichage visuel
  currentStreak++;
  const streakEl = document.getElementById("streak-display");
  if (streakEl) streakEl.innerText = currentStreak;

  updateStats(true);
  isPuzzleActive = false;
  updateEngineText("");
  showSidebarResult("success");
}

function handleFailure() {
  // On joue le son d'erreur
  playSound("error");

  // Puis on affiche l'interface
  currentStreak = 0;
  const streakEl = document.getElementById("streak-display");
  if (streakEl) streakEl.innerText = 0;

  updateStats(false);
  showSidebarResult("failure");

  isWaitingForRetry = true;
  const btnRetry = document.getElementById("btn-retry");
  if (btnRetry) btnRetry.style.display = "none";
  const btnHint = document.getElementById("btn-hint");
  if (btnHint) btnHint.style.display = "none";

  updateEngineText("Analyse de l'erreur...");
}

// --- UI SIDEBAR ---
function showSidebarResult(status) {
  const box = document.getElementById("sidebar-puzzle-result");
  if (!box) return;

  const icon = box.querySelector(".result-icon");
  const title = box.querySelector(".result-title");
  const btn = document.getElementById("btn-result-action");

  box.classList.remove("success", "failure");

  if (status === "success") {
    box.classList.add("success");
    if (icon) icon.innerText = "✅";
    if (title) title.innerText = "Puzzle Réussi !";
    if (btn) {
      btn.innerText = "Puzzle Suivant ➡";
      btn.className = "btn-game small primary";
    }
  } else {
    box.classList.add("failure");
    if (icon) icon.innerText = "❌";
    if (title) title.innerText = "Mauvais Coup";
    if (btn) {
      btn.innerText = "Réessayer ↺";
      btn.className = "btn-game small danger";
    }
  }
  box.style.display = "flex";
}

// --- DRAG & DROP ---
function onDragStart(source, piece) {
  clearArrows();
  if (!isPuzzleActive || isWaitingForRetry || game.game_over()) return false;
  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  )
    return false;
}

function onDrop(source, target) {
  if (source === target) {
    handleSquareClick(source);
    return;
  }
  const result = handleUserMove(source, target, null, true);
  if (result === "pending") return;
  if (result === "snapback") {
    removeSelection();
    return "snapback";
  }
  removeSelection();
}

// --- COUP ORDI ---
function makeComputerMove(moveStr) {
  if (!moveStr) return;
  const move = game.move({
    from: moveStr.substring(0, 2),
    to: moveStr.substring(2, 4),
    promotion: moveStr.length > 4 ? moveStr[4] : "q",
  });
  if (move) {
    board.move(move.from + "-" + move.to);
    if (move.promotion) board.position(game.fen());
    updateHistory();

    // Son Ordi
    playMoveSound(move);
  }
}

// --- RESTART ---
function retryPuzzle() {
  if (resultTimeout) clearTimeout(resultTimeout);

  game.undo();
  board.position(game.fen());
  updateHistory();
  removeSelection();
  clearArrows();
  pendingMove = null;

  const box = document.getElementById("sidebar-puzzle-result");
  if (box) box.style.display = "none";
  const btnHint = document.getElementById("btn-hint");
  if (btnHint) btnHint.style.display = "block";

  isWaitingForRetry = false;
  updateEngineText("");
}

// --- LOAD PUZZLE ---
async function loadRandomPuzzle() {
  if (resultTimeout) clearTimeout(resultTimeout);

  const box = document.getElementById("sidebar-puzzle-result");
  if (box) box.style.display = "none";
  const btnRetry = document.getElementById("btn-retry");
  if (btnRetry) btnRetry.style.display = "none";
  const btnHint = document.getElementById("btn-hint");
  if (btnHint) btnHint.style.display = "block";
  const promo = document.getElementById("promotion-overlay");
  if (promo) promo.style.display = "none";

  updateEngineText("");
  isPuzzleActive = false;
  isWaitingForRetry = false;
  moveIndex = 0;
  selectedSquare = null;
  pendingMove = null;
  clearArrows();
  game.clear();
  updateHistory();

  const randomId = generateRandomId();
  try {
    const puzzlesRef = collection(db, "puzzles");
    const q = query(puzzlesRef, where("__name__", ">=", randomId), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) setupPuzzle(snapshot.docs[0].data());
    else loadRandomPuzzle();
  } catch (error) {
    console.error("Erreur:", error);
  }
}

function setupPuzzle(data) {
  currentPuzzle = data;
  const streakEl = document.getElementById("streak-display");
  if (streakEl) streakEl.innerText = currentStreak;
  removeSelection();
  clearArrows();

  const themeEl = document.getElementById("theme-display");
  if (themeEl && data.themes) {
    themeEl.innerText = data.themes
      .split(" ")
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(", ");
  }

  const ratingEl = document.getElementById("puzzle-rating");
  if (ratingEl) ratingEl.innerText = `Puzzle: ${data.rating || 1200}`;

  const badgeEl = document.getElementById("difficulty-badge");
  if (badgeEl) {
    const elo = data.rating || 1200;
    let label = "Moyen",
      cssClass = "medium";
    if (elo < 1000) {
      label = "Débutant";
      cssClass = "easy";
    } else if (elo < 1200) {
      label = "Facile";
      cssClass = "easy";
    } else if (elo < 1600) {
      label = "Moyen";
      cssClass = "medium";
    } else {
      label = "Difficile";
      cssClass = "hard";
    }
    badgeEl.innerText = label;
    badgeEl.className = `difficulty-badge ${cssClass}`;
  }

  game.load(data.fen);
  const playerColor = game.turn() === "w" ? "black" : "white";
  initBoard(data.fen, playerColor);
  updateStatusWithTurn();
  updateEngineText("");
  updateHistory();

  if (Array.isArray(data.moves)) {
    currentPuzzle.movesList = data.moves;
  } else {
    currentPuzzle.movesList = data.moves.trim().split(/\s+/);
  }

  setTimeout(() => {
    makeComputerMove(currentPuzzle.movesList[0]);
    moveIndex = 1;
    updateStatusWithTurn();
    isPuzzleActive = true;
  }, 500);
}

function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Trait aux Blancs" : "Trait aux Noirs";
  const statusText = document.getElementById("status-text");
  if (statusText) statusText.innerText = turn;
  const indicator = document.querySelector(".turn-indicator");
  if (indicator) {
    if (game.turn() === "w") {
      indicator.classList.remove("black-turn");
      indicator.classList.add("white-turn");
    } else {
      indicator.classList.remove("white-turn");
      indicator.classList.add("black-turn");
    }
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

function updateHistory() {
  const historyEl = document.getElementById("move-history");
  if (!historyEl) return;
  const history = game.history();
  if (history.length === 0) {
    historyEl.innerHTML =
      '<span style="color:#666; font-style:italic;">Début de partie</span>';
    return;
  }
  let html = "";
  for (let i = 0; i < history.length; i += 2) {
    html += `<span>${i / 2 + 1}. ${history[i]} ${history[i + 1] || ""}</span> `;
  }
  historyEl.innerHTML = html;
  historyEl.scrollTop = historyEl.scrollHeight;
}

function updateEngineText(msg) {
  const el = document.getElementById("engine-text");
  if (el) el.innerHTML = msg;
}

// --- PROMOTION ---
window.confirmPromotion = confirmPromotion;
function showPromotionModal(color) {
  const modal = document.getElementById("promotion-overlay");
  const container = document.getElementById("promo-pieces-container");
  if (!modal || !container) return;
  container.innerHTML = "";
  ["q", "r", "b", "n"].forEach((p) => {
    const img = document.createElement("img");
    img.src = `https://chessboardjs.com/img/chesspieces/wikipedia/${color}${p.toUpperCase()}.png`;
    img.className = "promo-piece";
    img.onclick = () => confirmPromotion(p);
    container.appendChild(img);
  });
  modal.style.display = "flex";
}
function confirmPromotion(pieceChar) {
  const modal = document.getElementById("promotion-overlay");
  if (modal) modal.style.display = "none";
  if (pendingMove) {
    handleUserMove(pendingMove.source, pendingMove.target, pieceChar, false);
    pendingMove = null;
  }
}

// --- INIT BOARD ---
function initBoard(fen, orientation) {
  if (board) board.destroy();
  boardOrientation = orientation;
  board = Chessboard("board", {
    draggable: true,
    position: fen,
    orientation: orientation,
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    moveSpeed: 250,
    snapbackSpeed: 500,
    snapSpeed: 100,
  });
  const oldSvg = document.getElementById("arrow-overlay");
  if (oldSvg) oldSvg.remove();
  initArrows();
  window.addEventListener("resize", () => {
    if (board) board.resize();
  });
}

// --- FLÈCHES ---
function initArrows() {
  const boardEl = document.getElementById("board");
  if (!boardEl || document.getElementById("arrow-overlay")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("id", "arrow-overlay");
  svg.setAttribute("class", "arrow-canvas");
  svg.setAttribute("viewBox", "0 0 100 100");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "marker",
  );
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("markerWidth", "4");
  marker.setAttribute("markerHeight", "4");
  marker.setAttribute("refX", "2");
  marker.setAttribute("refY", "2");
  marker.setAttribute("orient", "auto");
  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  polygon.setAttribute("points", "0 0, 4 2, 0 4");
  polygon.setAttribute("fill", "#ffa500");
  marker.appendChild(polygon);
  defs.appendChild(marker);
  svg.appendChild(defs);
  boardEl.appendChild(svg);
}
function handleRightClickAction(start, end) {
  const existingIndex = arrows.findIndex(
    (a) => a.start === start && a.end === end,
  );
  if (existingIndex !== -1) arrows.splice(existingIndex, 1);
  else arrows.push({ start, end });
  renderArrows();
}
function clearArrows() {
  arrows = [];
  renderArrows();
}
function renderArrows() {
  const svg = document.getElementById("arrow-overlay");
  if (!svg) return;
  while (svg.lastChild && svg.lastChild.tagName !== "defs")
    svg.removeChild(svg.lastChild);
  arrows.forEach((arrow) => {
    if (arrow.start === arrow.end) drawCircle(svg, arrow.start);
    else drawArrow(svg, arrow.start, arrow.end);
  });
}
function getSquareCenter(square) {
  const files = "abcdefgh";
  const ranks = "12345678";
  let f = files.indexOf(square[0]);
  let r = ranks.indexOf(square[1]);
  const cellSize = 12.5;
  const half = 6.25;
  let x, y;
  if (boardOrientation === "white") {
    x = f * cellSize + half;
    y = 100 - (r * cellSize + half);
  } else {
    x = (7 - f) * cellSize + half;
    y = r * cellSize + half;
  }
  return { x, y };
}
function drawCircle(svg, square) {
  const { x, y } = getSquareCenter(square);
  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  circle.setAttribute("cx", x);
  circle.setAttribute("cy", y);
  circle.setAttribute("r", "6");
  circle.setAttribute("fill", "#ffa500");
  circle.setAttribute("opacity", "0.5");
  svg.appendChild(circle);
}
function drawArrow(svg, start, end) {
  const s = getSquareCenter(start);
  const e = getSquareCenter(end);
  const angle = Math.atan2(e.y - s.y, e.x - s.x);
  const dist = Math.sqrt(Math.pow(e.x - s.x, 2) + Math.pow(e.y - s.y, 2));
  const offset = 4.5;
  const newEndX = s.x + Math.cos(angle) * (dist - offset);
  const newEndY = s.y + Math.sin(angle) * (dist - offset);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", s.x);
  line.setAttribute("y1", s.y);
  line.setAttribute("x2", newEndX);
  line.setAttribute("y2", newEndY);
  line.setAttribute("stroke", "#ffa500");
  line.setAttribute("stroke-width", "2.2");
  line.setAttribute("opacity", "0.8");
  line.setAttribute("marker-end", "url(#arrowhead)");
  svg.appendChild(line);
}

function useHint() {
  if (!isPuzzleActive || isWaitingForRetry) return;
  const correctMove = currentPuzzle.movesList[moveIndex];
  if (!correctMove) return;
  const source = correctMove.substring(0, 2);
  const target = correctMove.substring(2, 4);
  const $board = $("#board");
  $board.find(".square-" + source).addClass("hint-square");
  $board.find(".square-" + target).addClass("hint-square");
  setTimeout(() => {
    $board.find(".square-" + source).removeClass("hint-square");
    $board.find(".square-" + target).removeClass("hint-square");
  }, 1500);
}

// AUTH & STATS
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const docRef = doc(db, "users", user.uid);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const nameEl = document.getElementById("user-name");
        if (nameEl) nameEl.textContent = data.pseudo || "Joueur";
        const avatarEl = document.getElementById("user-avatar");
        if (avatarEl && user.photoURL)
          avatarEl.style.backgroundImage = `url('${user.photoURL}')`;
        const ratingEl = document.getElementById("user-rating");
        if (ratingEl)
          ratingEl.innerText = `Joueur: ${data.currentPuzzleElo || 1200}`;
      }
    } catch (e) {}
  }
});

async function updateStats(isWin) {
  const user = auth.currentUser;
  if (!user) return;
  const userRef = doc(db, "users", user.uid);
  try {
    const updates = isWin
      ? { puzzlesSolved: increment(1), puzzleStreak: increment(1) }
      : { puzzleStreak: 0 };
    await setDoc(userRef, updates, { merge: true });
  } catch (error) {}
}

function initStockfish() {
  fetch(
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js",
  )
    .then((r) => r.text())
    .then((c) => {
      const b = new Blob([c], { type: "application/javascript" });
      stockfish = new Worker(URL.createObjectURL(b));
      stockfish.postMessage("uci");
      stockfish.onmessage = (e) => {
        if (
          e.data.startsWith("info") &&
          e.data.includes("score") &&
          e.data.includes("pv")
        )
          parseAnalysis(e.data);
      };
    })
    .catch(console.error);
}

function parseAnalysis(line) {
  if (!isWaitingForRetry) return;
  const parts = line.split(" ");
  let scoreIndex = parts.indexOf("score");
  if (scoreIndex === -1) return;
  let type = parts[scoreIndex + 1];
  let value = parseInt(parts[scoreIndex + 2]);
  let pvIndex = parts.indexOf("pv");
  let bestMoveUCI = pvIndex !== -1 ? parts[pvIndex + 1] : null;

  let bestMoveSAN = bestMoveUCI;
  if (bestMoveUCI) {
    const t = new Chess(game.fen());
    const m = t.move({
      from: bestMoveUCI.substring(0, 2),
      to: bestMoveUCI.substring(2, 4),
      promotion: "q",
    });
    if (m) bestMoveSAN = m.san;
  }

  const textEl = document.getElementById("engine-text");
  if (!textEl) return;

  if (type === "mate") {
    textEl.innerHTML = `<span class="analysis-blunder">Attention !</span> Mat en ${Math.abs(value)}.`;
  } else if (value > 200) {
    textEl.innerHTML = `Gaffe. <span class="refutation-move">${bestMoveSAN}</span> gagne.`;
  } else {
    textEl.innerHTML = `Imprécis. Meilleur coup : <span class="refutation-move">${bestMoveSAN}</span>`;
  }
}

function startEvaluation(fen) {
  if (!stockfish) return;
  stockfish.postMessage(`position fen ${fen}`);
  stockfish.postMessage("go depth 15");
}
