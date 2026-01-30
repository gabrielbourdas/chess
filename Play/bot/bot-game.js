import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURATION FIREBASE (Identique à puzzle-logic.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyBNBUO3JupohDCYAMs7Xf6kKgxnnFgPpVM",
  authDomain: "open-chess-2f3cf.firebaseapp.com",
  projectId: "open-chess-2f3cf",
  storageBucket: "open-chess-2f3cf.firebasestorage.app",
  messagingSenderId: "447945730536",
  appId: "1:447945730536:web:a1e3347bc13e94040bdc5d",
  measurementId: "G-71F05DTLHG",
};

// Initialisation Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- CONFIGURATION JEU & ETAT GLOBAL ---
var board = null;
var game = new Chess();
var engine = null;
var isEngineRunning = false;
var playerColor = "white";
var selectedSquare = null;

// --- PARAMÈTRES DE DIFFICULTÉ ---
const DIFFICULTY_SETTINGS = {
  0: { depth: 2, label: "800 Elo" },
  5: { depth: 5, label: "1200 Elo" },
  10: { depth: 8, label: "1600 Elo" },
  15: { depth: 12, label: "2000 Elo" },
  20: { depth: 18, label: "2500+ Elo" },
};

var currentSkillLevel = 10;
var currentDepth = 8;

// Variables pour les flèches (Clic Droit)
var rightClickStart = null;
var arrows = [];
var boardOrientation = "white";

// Promotion
var pendingMove = null;

// Sons
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

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  initEngine();

  // Initialisation du plateau (Blancs par défaut)
  initBoard("start", "white");

  // --- GESTION UTILISATEUR (FIREBASE) ---
  // Cette partie récupère les infos et met à jour l'interface
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const docRef = doc(db, "users", user.uid);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();

          // 1. Mise à jour du Nom
          const nameEl = document.getElementById("user-name");
          if (nameEl) nameEl.textContent = data.pseudo || "Joueur";

          // 2. Mise à jour de l'Avatar
          const avatarEl = document.getElementById("user-avatar");
          if (avatarEl) {
            const photoURL =
              user.photoURL ||
              `https://api.dicebear.com/9.x/adventurer/svg?seed=${data.pseudo || "User"}`;
            avatarEl.style.backgroundImage = `url('${photoURL}')`;
          }

          // 3. Mise à jour de l'Elo (On cherche 'elo' ou on met 1200)
          const userRatingEl = document.getElementById("user-rating");
          if (userRatingEl) {
            const userElo = data.elo || data.currentElo || 1200;
            userRatingEl.innerText = `ELO: ${userElo}`;
          }
        }
      } catch (e) {
        console.error("Erreur Profil:", e);
      }
    } else {
      // Mode Invité
      const nameEl = document.getElementById("user-name");
      if (nameEl) nameEl.textContent = "Invité";

      const userRatingEl = document.getElementById("user-rating");
      if (userRatingEl) userRatingEl.innerText = "ELO: 800";
    }
  });

  // --- EVENTS BOUTONS ---
  const btnNew = document.getElementById("btn-new-game");
  if (btnNew) btnNew.addEventListener("click", startNewGame);

  const btnUndo = document.getElementById("btn-undo");
  if (btnUndo) btnUndo.addEventListener("click", undoMove);

  // --- EVENTS SELECTEURS ---
  const diffSelect = document.getElementById("difficulty-select");
  if (diffSelect) {
    diffSelect.addEventListener("change", () => startNewGame());
    setDifficulty(diffSelect.value);
  }

  const colorSelect = document.getElementById("color-select");
  if (colorSelect) {
    colorSelect.addEventListener("change", () => startNewGame());
  }

  // Déblocage Audio
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

  setupBoardInteractions();
});

function setupBoardInteractions() {
  const boardEl = document.getElementById("board");
  if (!boardEl) return;

  // Clic Gauche
  boardEl.addEventListener("click", (e) => {
    clearArrows();
    if (isEngineRunning || game.game_over()) return;
    const square = getSquareFromEvent(e);
    if (square) handleSquareClick(square);
    else removeSelection();
  });

  // Clic Droit
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

// --- LOGIQUE DIFFICULTÉ ---
function setDifficulty(skillLevel) {
  currentSkillLevel = parseInt(skillLevel);
  const config = DIFFICULTY_SETTINGS[currentSkillLevel.toString()] || {
    depth: 10,
    label: "???",
  };
  currentDepth = config.depth;

  const display = document.getElementById("bot-difficulty-display");
  if (display) display.innerText = "Niveau: " + config.label;

  if (engine) {
    engine.postMessage("setoption name Skill Level value " + currentSkillLevel);
    const errProb = (20 - currentSkillLevel) * 5;
    engine.postMessage(
      "setoption name Skill Level Probability value " + Math.max(0, errProb),
    );
  }
}

// --- FONCTIONS CLICK-TO-MOVE ---
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
  const myColor = playerColor.charAt(0);

  if (turn !== myColor) return;

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

  if (selectedSquare) {
    handleUserMove(selectedSquare, square);
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
    if (move.flags.includes("c") || move.flags.includes("e")) {
      $target.addClass("capture-hint");
    } else {
      $target.addClass("move-hint");
    }
  });
}

function removeSelection() {
  selectedSquare = null;
  $("#board").find(".selected-square").removeClass("selected-square");
  $("#board").find(".move-hint").removeClass("move-hint");
  $("#board").find(".capture-hint").removeClass("capture-hint");
}

// --- GESTION DES FLÈCHES ---
function initArrows() {
  const boardEl = document.getElementById("board");
  if (!boardEl || document.getElementById("arrow-overlay")) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("id", "arrow-overlay");
  svg.setAttribute("class", "arrow-canvas");
  svg.setAttribute("viewBox", "0 0 100 100");
  Object.assign(svg.style, {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: 100,
  });

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
  const files = "abcdefgh",
    ranks = "12345678";
  let f = files.indexOf(square[0]),
    r = ranks.indexOf(square[1]);
  const cellSize = 12.5,
    half = 6.25;
  let x =
    boardOrientation === "white"
      ? f * cellSize + half
      : (7 - f) * cellSize + half;
  let y =
    boardOrientation === "white"
      ? 100 - (r * cellSize + half)
      : r * cellSize + half;
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
  const s = getSquareCenter(start),
    e = getSquareCenter(end);
  const angle = Math.atan2(e.y - s.y, e.x - s.x);
  const dist = Math.sqrt(Math.pow(e.x - s.x, 2) + Math.pow(e.y - s.y, 2)) - 5;
  const newX = s.x + Math.cos(angle) * dist,
    newY = s.y + Math.sin(angle) * dist;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", s.x);
  line.setAttribute("y1", s.y);
  line.setAttribute("x2", newX);
  line.setAttribute("y2", newY);
  line.setAttribute("stroke", "#ffa500");
  line.setAttribute("stroke-width", "2.2");
  line.setAttribute("opacity", "0.8");
  line.setAttribute("marker-end", "url(#arrowhead)");
  svg.appendChild(line);
}

// --- LOGIQUE PLATEAU ---
function initBoard(fen, orientation) {
  if (board) board.destroy();
  boardOrientation = orientation || "white";

  var config = {
    draggable: true,
    position: fen,
    orientation: boardOrientation,
    pieceTheme: "../../img/wiki/{piece}.png",
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    moveSpeed: 200,
    snapbackSpeed: 500,
    snapSpeed: 100,
  };

  board = Chessboard("board", config);

  const oldSvg = document.getElementById("arrow-overlay");
  if (oldSvg) oldSvg.remove();
  initArrows();

  window.removeEventListener("resize", resizeSafe);
  window.addEventListener("resize", resizeSafe);
  setTimeout(resizeSafe, 200);
}

function resizeSafe() {
  if (board) board.resize();
}

// --- MOUVEMENT & VALIDATION ---
function handleUserMove(source, target, promotionChoice = null) {
  const piece = game.get(source);
  if (!piece) return "snapback";

  const isPromotion =
    piece.type === "p" &&
    ((piece.color === "w" && target[1] === "8") ||
      (piece.color === "b" && target[1] === "1"));

  if (isPromotion && !promotionChoice) {
    pendingMove = { source, target };
    showPromotionModal(piece.color);
    return "pending";
  }

  const move = game.move({
    from: source,
    to: target,
    promotion: promotionChoice || "q",
  });

  if (move === null) return "snapback";

  board.position(game.fen());
  clearArrows();
  playSound(move.flags.includes("c") ? "capture" : "move");
  updateGameUI();
  askEngineForMove();
  return true;
}

// --- DRAG & DROP ---
function onDragStart(source, piece) {
  clearArrows();
  if (game.game_over() || isEngineRunning) return false;

  // CORRECTION : On ne peut pas bouger les pièces si ce n'est pas notre couleur
  if (piece.search(playerColor.charAt(0)) === -1) {
    return false;
  }
}

function onDrop(source, target) {
  if (source === target) {
    handleSquareClick(source);
    return;
  }
  const result = handleUserMove(source, target);
  if (result === "pending") return;
  if (result === "snapback") return "snapback";
  removeSelection();
}

function onSnapEnd() {
  board.position(game.fen());
}

// --- LOGIQUE STOCKFISH ---
function initEngine() {
  if (typeof Worker !== "undefined") {
    engine = new Worker("./stockfish.js");
    engine.postMessage("uci");
    engine.onmessage = function (event) {
      const line = event.data;
      if (line.startsWith("bestmove")) {
        const bestMove = line.split(" ")[1];
        makeEngineMove(bestMove);
      }
    };
  } else {
    alert("IA non supportée.");
  }
}

function askEngineForMove() {
  if (game.game_over()) return;

  isEngineRunning = true;
  updateStatus("L'IA réfléchit...");

  const delay = Math.max(500, Math.random() * 1000);

  setTimeout(() => {
    engine.postMessage("position fen " + game.fen());
    engine.postMessage("go depth " + currentDepth);
  }, delay);
}

function makeEngineMove(moveSan) {
  if (!moveSan) return;
  const from = moveSan.substring(0, 2);
  const to = moveSan.substring(2, 4);
  const promotion = moveSan.length > 4 ? moveSan.substring(4, 5) : "q";

  const move = game.move({ from, to, promotion });

  if (move) {
    board.position(game.fen());
    playSound(move.flags.includes("c") ? "capture" : "move");
    clearArrows();
    updateGameUI();
    isEngineRunning = false;
  }
}

// --- UI ---
function updateGameUI() {
  updateStatus();
  updateHistory();
  updateTurnIndicator();
}

function updateStatus(customMsg) {
  const statusEl = document.getElementById("status-text");
  if (!statusEl) return;
  if (customMsg) {
    statusEl.innerText = customMsg;
    return;
  }

  let status = "";
  const moveColor = game.turn() === "b" ? "Noirs" : "Blancs";
  if (game.in_checkmate()) {
    status =
      "Mat ! Les " + (moveColor === "Noirs" ? "Blancs" : "Noirs") + " gagnent.";
    playSound("notify");
  } else if (game.in_draw()) status = "Match nul.";
  else {
    status = game.turn() === "w" ? "Trait aux Blancs" : "Trait aux Noirs";
    if (game.in_check()) status += " (Échec)";
  }
  statusEl.innerText = status;
}

function updateTurnIndicator() {
  const indicator = document.querySelector(".turn-indicator");
  if (indicator) {
    indicator.classList.remove("white-turn", "black-turn");
    indicator.classList.add(game.turn() === "w" ? "white-turn" : "black-turn");
  }
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
    html += `<span>${i / 2 + 1}. ${history[i]} ${history[i + 1] || ""}</span> `;
  }
  historyEl.innerHTML = html;
  historyEl.scrollTop = historyEl.scrollHeight;
}

function playSound(type) {
  if (sounds[type]) {
    const s = sounds[type].cloneNode();
    s.volume = 0.5;
    s.play().catch(() => {});
  }
}

// --- MODALE PROMOTION ---
window.confirmPromotion = confirmPromotion;

function showPromotionModal(color) {
  const modal = document.getElementById("promotion-overlay");
  const container = document.getElementById("promo-pieces-container");
  if (!modal || !container) {
    if (pendingMove) confirmPromotion("q");
    return;
  }

  container.innerHTML = "";
  ["q", "r", "b", "n"].forEach((p) => {
    const img = document.createElement("img");
    img.src = `../../img/wiki/${color}${p.toUpperCase()}.png`;
    img.className = "promo-piece";
    img.onclick = () => confirmPromotion(p);
    container.appendChild(img);
  });
  modal.style.display = "flex";
}

function confirmPromotion(pieceChar) {
  document.getElementById("promotion-overlay").style.display = "none";
  if (pendingMove) {
    handleUserMove(pendingMove.source, pendingMove.target, pieceChar);
    pendingMove = null;
  }
}

// --- CONTROLES DE JEU ---
function startNewGame() {
  const colorSelectEl = document.getElementById("color-select");
  let chosenColorValue = colorSelectEl ? colorSelectEl.value : "white";
  const diffSelect = document.getElementById("difficulty-select");

  // 1. Choix couleur (avec mise à jour UI pour Random)
  if (chosenColorValue === "random") {
    const isWhite = Math.random() < 0.5;
    playerColor = isWhite ? "white" : "black";
    if (colorSelectEl) colorSelectEl.value = playerColor;
  } else {
    playerColor = chosenColorValue;
  }

  // 2. Reset classique
  game.reset();
  selectedSquare = null;
  removeSelection();
  clearArrows();
  isEngineRunning = false;

  // 3. Init Plateau
  initBoard("start", playerColor);

  // 4. Init Moteur
  engine.postMessage("ucinewgame");
  if (diffSelect) setDifficulty(diffSelect.value);

  updateGameUI();

  // 5. Si joueur est noir, l'IA (blanc) joue
  if (playerColor === "black") {
    askEngineForMove();
  }
}

function undoMove() {
  if (isEngineRunning || game.history().length === 0) return;
  game.undo();
  game.undo();
  board.position(game.fen());
  removeSelection();
  clearArrows();
  updateGameUI();
}
