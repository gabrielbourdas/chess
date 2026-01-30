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

console.log("--- 1. Scripts chargés, début initialisation ---");

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
if (typeof Chess === "undefined") {
  console.error("ERREUR CRITIQUE : chess.js n'est pas chargé !");
}
var game = new Chess();
var currentPuzzle = null;
var moveIndex = 0;
var currentStreak = 0;
var isPuzzleActive = false;
var isWaitingForRetry = false;
var stockfish = null;
var selectedSquare = null;

// Variables Promotion
var pendingMove = null;

// Variables Clic Droit
var rightClickStart = null;
var arrows = [];
var boardOrientation = "white";

// Variables Batch (Mode Planification)
var planningMoves = [];
var initialFen = "";

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("--- 2. DOM Ready ---");
  initBoard("start", "white");
  initStockfish();
  initArrows();

  const boardEl = document.getElementById("board");
  if (!boardEl) {
    console.error("ERREUR : Élément #board introuvable dans le HTML");
  } else {
    // --- GESTION CLICK GAUCHE (Alignée sur puzzle-logic.js) ---
    boardEl.addEventListener("click", (e) => {
      // 1. Nettoyage visuel immédiat
      clearArrows();

      if (!isPuzzleActive || isWaitingForRetry) return;

      const square = getSquareFromEvent(e);

      if (square) {
        const piece = game.get(square);
        // Important : Si c'est MA pièce, on laisse faire le onDrop (click = drop sur place)
        // Sinon (case vide ou ennemie), on traite le clic pour un mouvement potentiel
        const isMyPiece = piece && piece.color === game.turn();

        if (!isMyPiece) {
          handleSquareClick(square);
        }
      } else {
        removeSelection();
      }
    });

    // --- GESTION CLICK DROIT ---
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

  // Listeners Boutons
  setupButton("btn-next", loadRandomPuzzle);
  setupButton("btn-retry", retryPuzzle);
  setupButton("btn-hint", useHint);
  setupButton("btn-validate-plan", validatePlanning);
  setupButton("btn-undo-plan", undoLastPlan);

  // Hack Audio Mobile
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

  console.log("--- 3. Lancement du premier puzzle ---");
  setTimeout(loadRandomPuzzle, 500);
});

function setupButton(id, func) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", func);
}

// --- LOGIQUE SELECTION (Tirée de puzzle-logic.js) ---
function handleSquareClick(square) {
  const piece = game.get(square);
  const turn = game.turn();

  // CAS 1 : Clic sur une de NOS pièces -> Sélection
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

  // CAS 2 : Clic sur une case destination -> Mouvement
  if (selectedSquare) {
    handleUserMove(selectedSquare, square);
    removeSelection();
  }
}

function selectSquare(square) {
  // Alias pour garder la compatibilité interne si besoin
  handleSquareClick(square);
}

// --- UTILITAIRES DOM (Copie exacte de puzzle-logic.js) ---
function getSquareFromEvent(e) {
  let target = e.target;
  // Gestion du cas où on clique sur l'image
  if (target.tagName === "IMG" && target.parentElement) {
    target = target.parentElement;
  }
  const squareEl = target.closest('div[class*="square-"]');
  if (!squareEl) return null;
  const classes = squareEl.className;
  const match = classes.match(/square-([a-h][1-8])/);
  return match ? match[1] : null;
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

// --- GESTION PROMOTION ---
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

    if (result === "snapback") {
      board.position(game.fen());
    }
    pendingMove = null;
  }
}

// --- LOGIQUE BATCH / PLANIFICATION ---
function updatePlanningUI() {
  const listEl = document.getElementById("planning-list");
  if (!listEl) return;

  if (planningMoves.length === 0) {
    listEl.innerHTML =
      '<span class="empty-plan">Jouez les coups des deux camps...</span>';
    updateStatusWithTurn();
    return;
  }

  let html = "";
  planningMoves.forEach((pm, index) => {
    const isMyMove = index % 2 === 0;
    const style = isMyMove
      ? "border-color: #ffd700;"
      : "border-color: #666; color: #aaa;";
    html += `<span class="planned-move-item" style="${style}">${pm.san}</span>`;
  });
  listEl.innerHTML = html;

  const statusText = document.getElementById("status-text");
  if (statusText) {
    if (game.turn() === boardOrientation.charAt(0)) {
      statusText.innerText = "Planifiez VOTRE coup";
      statusText.style.color = "#ffd700";
    } else {
      statusText.innerText = "Planifiez la RÉPONSE adverse";
      statusText.style.color = "#aaa";
    }
  }
}

function undoLastPlan() {
  if (planningMoves.length === 0) return;
  game.undo();
  planningMoves.pop();
  board.position(game.fen());
  updatePlanningUI();
  playSound("move");
}

function validatePlanning() {
  console.log("Validation de la séquence...");
  if (planningMoves.length === 0) return;

  game.load(initialFen);
  board.position(initialFen);
  isPuzzleActive = false;

  let step = 0;

  function playNextStep() {
    if (step >= planningMoves.length) {
      if (step + 1 >= currentPuzzle.movesList.length) {
        // Puzzle fini
      } else {
        updateEngineText("Séquence correcte mais incomplète.");
        isPuzzleActive = true;
      }
      return;
    }

    const plannedMove = planningMoves[step];
    const puzzleIndexToCheck = step + 1;
    const expectedMoveUCI = currentPuzzle.movesList[puzzleIndexToCheck];

    if (!expectedMoveUCI) {
      handleFailureBatch(step);
      return;
    }

    let moveAttemptUCI = plannedMove.from + plannedMove.to;
    if (plannedMove.promotion) {
      moveAttemptUCI += plannedMove.promotion;
    }

    if (moveAttemptUCI === expectedMoveUCI) {
      game.move(plannedMove);
      board.position(game.fen());

      if (plannedMove.flags.includes("c")) playSound("capture");
      else playSound("move");

      moveIndex = puzzleIndexToCheck + 1;
      step++;

      if (moveIndex >= currentPuzzle.movesList.length) {
        currentStreak++;
        const streakEl = document.getElementById("streak-display");
        if (streakEl) streakEl.innerText = currentStreak;

        updateStats(true);
        updateEngineText("");
        const fb = document.getElementById("feedback-area");
        if (fb) {
          fb.innerHTML = "Calcul correct ! 🎉";
          fb.className = "feedback success visible";
        }
        playSound("notify");

        planningMoves = [];
        updatePlanningUI();
      } else {
        setTimeout(playNextStep, 600);
      }
    } else {
      handleFailureBatch(step);
    }
  }
  playNextStep();
}

function handleFailureBatch(stepIndex) {
  playSound("error");
  currentStreak = 0;
  const streakEl = document.getElementById("streak-display");
  if (streakEl) streakEl.innerText = 0;
  updateStats(false);

  const fb = document.getElementById("feedback-area");
  if (fb) {
    if (stepIndex % 2 === 0) {
      fb.innerHTML = "Erreur de calcul sur VOTRE coup 🚫";
    } else {
      fb.innerHTML = "Mauvaise anticipation de la défense 🚫";
    }
    fb.className = "feedback error visible";
  }

  isWaitingForRetry = true;
  document.getElementById("btn-retry").style.display = "block";
  document.getElementById("btn-hint").style.display = "none";
  updateEngineText("Analysez la séquence...");
}

// --- LOGIQUE UNIFIÉE (MOVE & BATCH) ---
function handleUserMove(source, target, promotionChoice = null) {
  // 1. Détection de la Promotion
  const piece = game.get(source);
  const isPromotion =
    piece &&
    piece.type === "p" &&
    ((piece.color === "w" && target[1] === "8") ||
      (piece.color === "b" && target[1] === "1"));

  if (isPromotion && !promotionChoice) {
    pendingMove = { source, target };
    showPromotionModal(piece.color);
    return "pending";
  }

  const finalPromotion = promotionChoice || "q";

  // 2. Mode Batch : On joue le coup "virtuellement"
  const move = game.move({
    from: source,
    to: target,
    promotion: finalPromotion,
  });

  if (move === null) return "snapback"; // Retourne snapback comme dans puzzle-logic

  board.move(source + "-" + target);
  if (isPromotion) board.position(game.fen());

  // Spécifique à ce fichier : Ajout à la liste de planification
  planningMoves.push(move);
  updatePlanningUI();

  if (move.flags.includes("c")) playSound("capture");
  else playSound("move");

  return true;
}

// --- DRAG & DROP HANDLERS ---
function onDragStart(source, piece, position, orientation) {
  clearArrows();
  if (!isPuzzleActive) return false;
  if (isWaitingForRetry) return false;
  if (game.game_over()) return false;

  // En mode planning, on peut jouer les deux couleurs à condition que ce soit leur tour
  if (game.turn() === "w" && piece.search(/^b/) !== -1) return false;
  if (game.turn() === "b" && piece.search(/^w/) !== -1) return false;
}

function onDrop(source, target) {
  // CORRECTION MAJEURE : Si on lâche sur la même case, c'est un CLIC de sélection
  if (source === target) {
    handleSquareClick(source);
    return;
  }

  const result = handleUserMove(source, target);

  if (result === "pending") return;
  if (result === "snapback") return "snapback";

  removeSelection();
}

// --- JEU & SETUP ---
function retryPuzzle() {
  pendingMove = null;
  const modal = document.getElementById("promotion-overlay");
  if (modal) modal.style.display = "none";

  game.load(initialFen);
  board.position(initialFen);
  planningMoves = [];
  updatePlanningUI();

  moveIndex = 1;

  removeSelection();
  clearArrows();

  isWaitingForRetry = false;
  isPuzzleActive = true;
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
  console.log("Chargement d'un nouveau puzzle...");

  pendingMove = null;
  const modal = document.getElementById("promotion-overlay");
  if (modal) modal.style.display = "none";

  const fb = document.getElementById("feedback-area");
  if (fb) {
    fb.className = "feedback";
    fb.innerHTML = "";
  }

  document.getElementById("btn-retry").style.display = "none";
  document.getElementById("btn-hint").style.display = "block";
  updateEngineText("");

  isPuzzleActive = false;
  isWaitingForRetry = false;
  moveIndex = 0;
  selectedSquare = null;
  clearArrows();
  game.clear();
  planningMoves = [];
  updatePlanningUI();

  const historyEl = document.getElementById("move-history");
  if (historyEl)
    historyEl.innerHTML =
      '<span style="color:#666; font-style:italic;">Début de partie</span>';

  const randomId = generateRandomId();
  try {
    const puzzlesRef = collection(db, "puzzles");
    const q = query(puzzlesRef, where("__name__", ">=", randomId), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      console.log("Puzzle trouvé ! ID:", snapshot.docs[0].id);
      setupPuzzle(snapshot.docs[0].data());
    } else {
      loadRandomPuzzle();
    }
  } catch (error) {
    console.error("Erreur chargement puzzle:", error);
    updateEngineText("Erreur connexion puzzle.");
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

  const loadResult = game.load(data.fen);
  if (!loadResult) return;

  const initialTurn = game.turn();
  const playerColor = initialTurn === "w" ? "black" : "white";
  boardOrientation = playerColor;
  initBoard(data.fen, playerColor);

  updateStatusWithTurn();

  let movesList = Array.isArray(data.moves)
    ? data.moves
    : data.moves.split(" ");
  currentPuzzle.movesList = movesList;

  console.log("Puzzle prêt. Coups à trouver :", movesList);

  setTimeout(() => {
    const computerMoveStr = movesList[0];
    makeComputerMove(computerMoveStr);
    initialFen = game.fen();
    moveIndex = 1;

    updateStatusWithTurn();
    isPuzzleActive = true;
    console.log("Puzzle actif. À vous de jouer.");
  }, 500);
}

function makeComputerMove(moveStr) {
  if (!moveStr) return;
  const from = moveStr.substring(0, 2);
  const to = moveStr.substring(2, 4);
  const promotion = moveStr.length > 4 ? moveStr[4] : "q";

  const move = game.move({ from: from, to: to, promotion: promotion });

  if (move) {
    board.move(from + "-" + to);
    if (move.promotion) board.position(game.fen());

    const historyEl = document.getElementById("move-history");
    if (historyEl)
      historyEl.innerHTML = `<span style="color:#eee;">Dernier coup : ${move.san}</span>`;
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
  const hintIndex = moveIndex + planningMoves.length;

  if (hintIndex >= currentPuzzle.movesList.length) return;

  const correctMoveStr = currentPuzzle.movesList[hintIndex];
  const source = correctMoveStr.substring(0, 2);
  const target = correctMoveStr.substring(2, 4);

  const $board = $("#board");
  $board.find(".square-" + source).addClass("hint-square");
  $board.find(".square-" + target).addClass("hint-square");
  setTimeout(() => {
    $board.find(".square-" + source).removeClass("hint-square");
    $board.find(".square-" + target).removeClass("hint-square");
  }, 1500);
}

// --- FLÈCHES & SVG ---
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

// --- STATS & USER ---
console.log("--- 4. Attente authentification ---");
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
        const ratingEl = document.getElementById("user-rating");
        if (ratingEl)
          ratingEl.innerText = `Joueur: ${data.currentPuzzleElo || 1200}`;
      }
    } catch (e) {
      console.error("Erreur Profil:", e);
    }
  } else {
    const nameEl = document.getElementById("user-name");
    if (nameEl) nameEl.textContent = "Invité";
    const ratingEl = document.getElementById("user-rating");
    if (ratingEl) ratingEl.innerText = "Joueur: 800";
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
  const stockfishUrl =
    "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js";
  fetch(stockfishUrl)
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
  // Vide intentionnellement (mode planning), à compléter si besoin
}
function updateEngineText(msg) {
  const el = document.getElementById("engine-text");
  if (el) el.innerHTML = msg;
}
