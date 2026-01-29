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

// --- SONS ---
const sounds = {
  move: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Move.mp3",
  ),
  capture: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Capture.mp3",
  ),
  notify: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Victory.mp3",
  ),
  error: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Error.mp3",
  ),
};

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

// Variables Promotion
var pendingMove = null; // { source, target }

// Variables pour les flèches (Clic Droit)
var rightClickStart = null;
var arrows = [];
var boardOrientation = "white";

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Initialisation de base
  initBoard("start", "white");
  initStockfish();
  initArrows(); // Prépare le SVG

  const boardEl = document.getElementById("board");
  if (boardEl) {
    // --- GESTION CLICK GAUCHE (Jeu & Déplacement) ---
    boardEl.addEventListener("click", (e) => {
      // Nettoyage visuel au clic gauche
      clearArrows();

      if (!isPuzzleActive || isWaitingForRetry) return;

      const square = getSquareFromEvent(e);

      if (square) {
        const piece = game.get(square);
        const isMyPiece = piece && piece.color === game.turn();

        // Si ce n'est pas ma pièce, je traite le clic (potentiel mouvement)
        if (!isMyPiece) {
          handleSquareClick(square);
        }
      } else {
        removeSelection();
      }
    });

    // --- GESTION CLICK DROIT (Flèches) - PRIORITAIRE ---
    boardEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });

    boardEl.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 2) {
          e.stopPropagation();
          e.stopImmediatePropagation();
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

  // 3. Hack audio mobile
  document.body.addEventListener(
    "click",
    () => {
      if (sounds.move) {
        sounds.move
          .play()
          .then(() => {
            sounds.move.pause();
            sounds.move.currentTime = 0;
          })
          .catch(() => {});
      }
    },
    { once: true },
  );

  // 4. Listeners Boutons
  const btnNext = document.getElementById("btn-next");
  if (btnNext) btnNext.addEventListener("click", loadRandomPuzzle);

  const btnRetry = document.getElementById("btn-retry");
  if (btnRetry) btnRetry.addEventListener("click", retryPuzzle);

  const btnHint = document.getElementById("btn-hint");
  if (btnHint) btnHint.addEventListener("click", useHint);

  // 5. Lancer le premier puzzle
  setTimeout(loadRandomPuzzle, 500);
});

// --- FONCTION UTILITAIRE : Trouver la case cliquée ---
function getSquareFromEvent(e) {
  let target = e.target;
  if (target.tagName === "IMG" && target.parentElement) {
    target = target.parentElement;
  }
  const squareEl = target.closest('div[class*="square-"]');
  if (!squareEl) return null;
  const classes = squareEl.className;
  const match = classes.match(/square-([a-h][1-8])/);
  return match ? match[1] : null;
}

// --- GESTION DU CLIC GAUCHE (Jeu) ---
function handleSquareClick(square) {
  const piece = game.get(square);
  const turn = game.turn();

  // CAS 1 : Clic sur une de NOS pièces (Sélection)
  if (piece && piece.color === turn) {
    if (selectedSquare === square) {
      removeSelection();
    } else {
      removeSelection();
      selectedSquare = square;
      highlightSquare(square);
      showMoveHints(square);
    }
    return;
  }

  // CAS 2 : Clic sur une case destination (Mouvement)
  if (selectedSquare) {
    handleUserMove(selectedSquare, square);
    removeSelection();
  }
}

function highlightSquare(square) {
  const $board = $("#board");
  $board.find(`.square-${square}`).addClass("selected-square");
}

function showMoveHints(square) {
  const moves = game.moves({ square: square, verbose: true });
  moves.forEach((move) => {
    const $board = $("#board");
    const $targetSquare = $board.find(`.square-${move.to}`);
    if (move.flags.includes("c") || move.flags.includes("e")) {
      $targetSquare.addClass("capture-hint");
    } else {
      $targetSquare.addClass("move-hint");
    }
  });
}

function removeSelection() {
  selectedSquare = null;
  const $board = $("#board");
  $board.find(".selected-square").removeClass("selected-square");
  $board.find(".move-hint").removeClass("move-hint");
  $board.find(".capture-hint").removeClass("capture-hint");
}

// --- GESTION DES FLÈCHES (CLIC DROIT) ---
function initArrows() {
  const boardEl = document.getElementById("board");
  if (!boardEl) return;

  if (!document.getElementById("arrow-overlay")) {
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
}

function handleRightClickAction(start, end) {
  const existingIndex = arrows.findIndex(
    (a) => a.start === start && a.end === end,
  );

  if (existingIndex !== -1) {
    arrows.splice(existingIndex, 1);
  } else {
    arrows.push({ start, end });
  }
  renderArrows();
}

function clearArrows() {
  arrows = [];
  renderArrows();
}

function renderArrows() {
  const svg = document.getElementById("arrow-overlay");
  if (!svg) return;
  while (svg.lastChild && svg.lastChild.tagName !== "defs") {
    svg.removeChild(svg.lastChild);
  }
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

// --- LOGIQUE PLATEAU ---
function initBoard(fen, orientation) {
  if (board) board.destroy();
  boardOrientation = orientation;

  var config = {
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
    trashSpeed: 100,
  };
  board = Chessboard("board", config);

  const oldSvg = document.getElementById("arrow-overlay");
  if (oldSvg) oldSvg.remove();
  initArrows();

  window.removeEventListener("resize", resizeSafe);
  window.addEventListener("resize", resizeSafe);
  setTimeout(resizeSafe, 100);
}

function resizeSafe() {
  if (board) board.resize();
}

function updateHistory() {
  const historyEl = document.getElementById("move-history");
  const history = game.history();

  if (history.length === 0) {
    historyEl.innerHTML =
      '<span style="color:#666; font-style:italic;">Début de partie</span>';
    return;
  }

  let html = "";
  for (let i = 0; i < history.length; i += 2) {
    const moveNumber = i / 2 + 1;
    const whiteMove = history[i];
    const blackMove = history[i + 1] ? history[i + 1] : "";
    html += `<span>${moveNumber}. ${whiteMove} ${blackMove}</span> `;
  }
  historyEl.innerHTML = html;
  historyEl.scrollTop = historyEl.scrollHeight;
}

// --- LOGIQUE UNIFIÉE & PROMOTION ---

function handleUserMove(source, target, promotionChoice = null) {
  // 1. Détection Promotion
  const piece = game.get(source);
  const isPromotion =
    piece.type === "p" &&
    ((piece.color === "w" && target[1] === "8") ||
      (piece.color === "b" && target[1] === "1"));

  // Si c'est une promotion et qu'on n'a pas encore choisi
  if (isPromotion && !promotionChoice) {
    pendingMove = { source, target };
    showPromotionModal(piece.color);
    return "pending"; // On indique qu'on attend
  }

  const finalPromotion = promotionChoice || "q";

  // 2. Tentative de mouvement
  const move = game.move({
    from: source,
    to: target,
    promotion: finalPromotion,
  });

  if (move === null) return "snapback";

  // Mouvement valide sur le plateau
  board.move(source + "-" + target);

  // Important : on force la mise à jour pour afficher la pièce promue (Dame/Tour...)
  if (isPromotion) board.position(game.fen());

  clearArrows();
  updateHistory();
  startEvaluation(game.fen());

  // 3. Validation de la solution du Puzzle
  let attemptUCI = source + target;
  if (move.promotion) attemptUCI += move.promotion; // ex: a7a8q

  const expectedMove = currentPuzzle.movesList[moveIndex];

  if (!expectedMove) return "snapback";

  // On compare l'UCI complet (incluant la promotion si nécessaire)
  // expectedMove est une string "e2e4" ou "a7a8q"
  // Si le puzzle attend "a7a8q" et que l'utilisateur a fait "a7a8r", ce sera faux.
  if (attemptUCI === expectedMove) {
    handleSuccess(move);
    return true;
  } else {
    setTimeout(() => {
      handleFailure();
    }, 300);
    return true;
  }
}

// --- GESTION MODALE PROMOTION ---
// Ces fonctions doivent être accessibles globalement (si attachées via onclick dans le HTML généré)
window.confirmPromotion = confirmPromotion;

function showPromotionModal(color) {
  const modal = document.getElementById("promotion-overlay");
  const container = document.getElementById("promo-pieces-container");
  if (!modal || !container) return;

  container.innerHTML = "";
  const pieces = ["q", "r", "b", "n"]; // Dame, Tour, Fou, Cavalier

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
    const { source, target } = pendingMove;
    const result = handleUserMove(source, target, pieceChar);

    // Si le mouvement échoue (mauvaise solution de puzzle), handleFailure gérera l'UI
    // Si c'était illégal (snapback), on remet la pièce
    if (result === "snapback") {
      board.position(game.fen());
    }
    pendingMove = null;
  }
}

// --- DRAG & DROP HANDLERS ---
function onDragStart(source, piece, position, orientation) {
  clearArrows();

  if (!isPuzzleActive) return false;
  if (isWaitingForRetry) return false;
  if (game.game_over()) return false;

  if (
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
}

function onDrop(source, target) {
  if (source === target) {
    handleSquareClick(source);
    return;
  }
  const result = handleUserMove(source, target);

  // Si on attend la promotion ("pending"), on ne fait rien (la pièce reste visuellement là où on l'a lâchée)
  if (result === "pending") return;

  if (result === "snapback") return "snapback";
  removeSelection();
}

// --- JEU ---
function retryPuzzle() {
  game.undo();
  board.position(game.fen());
  updateHistory();
  removeSelection();
  clearArrows();
  pendingMove = null; // Reset au cas où
  document.getElementById("promotion-overlay").style.display = "none";

  isWaitingForRetry = false;
  document.getElementById("btn-retry").style.display = "none";
  document.getElementById("btn-hint").style.display = "block";
  updateEngineText("");

  const fb = document.getElementById("feedback-area");
  if (fb) {
    fb.className = "feedback";
    fb.innerHTML = "";
  }
}

async function loadRandomPuzzle() {
  const fb = document.getElementById("feedback-area");
  if (fb) {
    fb.className = "feedback";
    fb.innerHTML = "";
  }

  document.getElementById("btn-retry").style.display = "none";
  document.getElementById("btn-hint").style.display = "block";
  document.getElementById("promotion-overlay").style.display = "none";
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

    if (!snapshot.empty) {
      setupPuzzle(snapshot.docs[0].data());
    } else {
      loadRandomPuzzle();
    }
  } catch (error) {
    console.error("Erreur:", error);
  }
}

function setupPuzzle(data) {
  currentPuzzle = data;
  document.getElementById("streak-display").innerText = currentStreak;
  removeSelection();
  clearArrows();

  const themeEl = document.getElementById("theme-display");
  if (themeEl && data.themes) {
    themeEl.innerText = data.themes
      .split(" ")
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(", ");
  }

  const elo = data.rating ? data.rating : 1200;
  const ratingEl = document.getElementById("puzzle-rating");
  if (ratingEl) ratingEl.innerText = `Puzzle: ${elo}`;

  const badgeEl = document.getElementById("difficulty-badge");
  if (badgeEl) {
    let label = "Moyen",
      cssClass = "medium";
    if (elo < 1000) {
      label = "Débutant";
      cssClass = "easy";
    } else if (elo < 1200) {
      label = "Facile";
      cssClass = "easy";
    } else if (elo < 1450) {
      label = "Moyen";
      cssClass = "medium";
    } else if (elo < 1600) {
      label = "Difficile";
      cssClass = "hard";
    } else {
      label = "Expert";
      cssClass = "expert";
    }
    badgeEl.innerText = label;
    badgeEl.className = `difficulty-badge ${cssClass}`;
  }

  game.load(data.fen);

  const initialTurn = game.turn();
  const playerColor = initialTurn === "w" ? "black" : "white";
  initBoard(data.fen, playerColor);

  updateStatusWithTurn();
  updateEngineText("");
  updateHistory();

  let movesList = Array.isArray(data.moves)
    ? data.moves
    : data.moves.split(" ");
  currentPuzzle.movesList = movesList;

  setTimeout(() => {
    const computerMoveStr = movesList[0];
    makeComputerMove(computerMoveStr);
    moveIndex = 1;
    updateStatusWithTurn();
    isPuzzleActive = true;
  }, 500);
}

function handleSuccess(move) {
  if (move.flags.includes("c")) playSound("capture");
  else playSound("move");

  moveIndex++;

  if (moveIndex >= currentPuzzle.movesList.length) {
    currentStreak++;
    document.getElementById("streak-display").innerText = currentStreak;
    updateStats(true);
    isPuzzleActive = false;
    updateEngineText("");

    const fb = document.getElementById("feedback-area");
    if (fb) {
      fb.innerHTML = "Puzzle réussi ! 🎉";
      fb.className = "feedback success visible";
    }
    playSound("notify");
  } else {
    isPuzzleActive = false;
    setTimeout(() => {
      const computerMoveStr = currentPuzzle.movesList[moveIndex];
      makeComputerMove(computerMoveStr);
      moveIndex++;
      isPuzzleActive = true;
      updateStatusWithTurn();
    }, 600);
  }
}

function handleFailure() {
  playSound("error");
  currentStreak = 0;
  document.getElementById("streak-display").innerText = 0;
  updateStats(false);

  const fb = document.getElementById("feedback-area");
  if (fb) {
    fb.innerHTML = "Mauvais coup 🚫";
    fb.className = "feedback error visible";
  }

  isWaitingForRetry = true;
  document.getElementById("btn-retry").style.display = "block";
  document.getElementById("btn-hint").style.display = "none";
  updateEngineText("Analyse de l'erreur...");
}

function makeComputerMove(moveStr) {
  if (!moveStr) return;
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  const promotion = moveStr.length > 4 ? moveStr[4] : "q";

  const move = game.move({ from: from, to: to, promotion: promotion });

  if (move) {
    board.move(from + "-" + to);
    // Si l'ordi fait une promotion, on update la position
    if (move.promotion) board.position(game.fen());
    updateHistory();
    if (move.flags.includes("c")) playSound("capture");
    else playSound("move");
  }
}

function updateStatusWithTurn() {
  const turn = game.turn() === "w" ? "Trait aux Blancs" : "Trait aux Noirs";
  const statusText = document.getElementById("status-text");
  const indicator = document.querySelector(".turn-indicator");

  if (statusText) statusText.innerText = turn;

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

function playSound(type) {
  if (sounds[type]) {
    const s = sounds[type].cloneNode();
    s.volume = 0.5;
    s.play().catch(() => {});
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

// --- STATS & USER ---
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
        if (avatarEl) {
          const photoURL =
            user.photoURL ||
            `https://api.dicebear.com/9.x/adventurer/svg?seed=${data.pseudo || "User"}`;
          avatarEl.style.backgroundImage = `url('${photoURL}')`;
        }
        const userRatingEl = document.getElementById("user-rating");
        if (userRatingEl) {
          const userElo = data.currentPuzzleElo || 1200;
          userRatingEl.innerText = `Joueur: ${userElo}`;
        }
      }
    } catch (e) {
      console.error("Erreur Profil:", e);
    }
  } else {
    document.getElementById("user-name").textContent = "Invité";
    const userRatingEl = document.getElementById("user-rating");
    if (userRatingEl) userRatingEl.innerText = "Joueur: 800";
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

// --- STOCKFISH SETUP ---
function initStockfish() {
  const stockfishUrl =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js";
  fetch(stockfishUrl)
    .then((response) => response.text())
    .then((scriptContent) => {
      const blob = new Blob([scriptContent], {
        type: "application/javascript",
      });
      const workerUrl = URL.createObjectURL(blob);
      stockfish = new Worker(workerUrl);
      stockfish.postMessage("uci");
      stockfish.onmessage = (event) => {
        const line = event.data;
        if (
          line.startsWith("info") &&
          line.includes("score") &&
          line.includes("pv")
        ) {
          parseAnalysis(line);
        }
      };
    })
    .catch((err) => console.error("Erreur SF:", err));
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
    const tempGame = new Chess(game.fen());
    const move = tempGame.move({
      from: bestMoveUCI.substring(0, 2),
      to: bestMoveUCI.substring(2, 4),
      promotion: "q",
    });
    if (move) bestMoveSAN = move.san;
  }

  const textEl = document.getElementById("engine-text");

  if (type === "mate") {
    textEl.innerHTML = `<span class="analysis-blunder">Attention !</span> Mat en ${Math.abs(value)}. <br>L'adversaire va jouer <span class="refutation-move">${bestMoveSAN}</span>.`;
    return;
  }

  if (value > 400) {
    textEl.innerHTML = `<span class="analysis-blunder">Gaffe décisive.</span><br>Vous êtes perdant. Réponse : <span class="refutation-move">${bestMoveSAN}</span>.`;
  } else if (value > 150) {
    textEl.innerHTML = `<span class="analysis-blunder">Erreur.</span><br>Avantage perdu. Réponse : <span class="refutation-move">${bestMoveSAN}</span>.`;
  } else if (value > 0) {
    textEl.innerHTML = `Imprécis.<br>L'adversaire égalise avec <span class="refutation-move">${bestMoveSAN}</span>.`;
  } else {
    textEl.innerHTML = `Ce n'est pas le meilleur coup tactique.`;
  }
}

function updateEngineText(msg) {
  const el = document.getElementById("engine-text");
  if (el) el.innerHTML = msg;
}

function startEvaluation(fen) {
  if (!stockfish) return;
  stockfish.postMessage(`position fen ${fen}`);
  stockfish.postMessage("go depth 15");
}
