import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  updateDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { module1 } from "./content/module-1.js";

// --- CONFIG FIREBASE ---
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
  success: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Victory.mp3",
  ),
  error: new Audio(
    "https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/Error.mp3",
  ),
};

function playSound(name) {
  if (sounds[name]) {
    sounds[name].currentTime = 0;
    sounds[name]
      .play()
      .catch((err) => console.log("Erreur lecture son :", err));
  }
}

// --- GLOBALES ---
var board = null;
var game = new Chess();
var currentCourse = null;
var currentChapterIndex = 0;
var currentStepIndex = 0;
var isStepCompleted = false;

// Variables Interaction
var selectedSquare = null;
var pendingMove = null; // Pour la promotion

const COURSE_MAPPING = { "module-1": module1 };

// --- INITIALISATION ---
document.addEventListener("DOMContentLoaded", () => {
  initBoard();

  const urlParams = new URLSearchParams(window.location.search);
  const courseId = urlParams.get("id") || "module-1";
  loadCourse(courseId);

  // GESTION CLIC (Click-to-Move)
  const boardEl = document.getElementById("board");
  if (boardEl) {
    boardEl.addEventListener("click", (e) => {
      const step = getCurrentStep();
      if (!step || step.type === "theory" || isStepCompleted) return;

      const square = getSquareFromEvent(e);

      if (square) {
        handleSquareClick(square);
      } else {
        removeSelection();
      }
    });
  }

  // BOUTONS
  document.getElementById("btn-next").addEventListener("click", nextStep);
  document.getElementById("btn-prev").addEventListener("click", prevStep);
  document
    .getElementById("btn-reset-board")
    .addEventListener("click", resetCurrentStep);
  document.getElementById("btn-flip-board").addEventListener("click", () => {
    board.flip();
    setTimeout(renderStep, 250);
  });

  // Hack Audio
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

  // Force Resize
  setTimeout(() => {
    if (board) {
      board.resize();
      renderStep();
    }
  }, 500);
});

// --- LOGIQUE CŒUR (VALIDATION) ---

function validateAndPlayMove(
  source,
  target,
  isDragDrop = false,
  promotionChoice = null,
) {
  const step = getCurrentStep();
  if (!step) return false;

  const piece = game.get(source);

  // --- DÉTECTION PROMOTION ---
  const isPromotion =
    piece.type === "p" &&
    ((piece.color === "w" && target[1] === "8") ||
      (piece.color === "b" && target[1] === "1"));

  if (isPromotion && !promotionChoice) {
    pendingMove = { source, target, isDragDrop };
    showPromotionModal(piece.color);
    return "pending";
  }

  const finalPromotion = promotionChoice || "q";

  // 1. Validation légale
  const moveAttempt = game.move({
    from: source,
    to: target,
    promotion: finalPromotion,
  });

  if (moveAttempt === null) return "illegal";

  // 2. Validation Pédagogique
  let userMoveUCI = source + target;
  if (moveAttempt.promotion) userMoveUCI += moveAttempt.promotion;

  const expectedMove = step.solution;

  if (userMoveUCI === expectedMove) {
    // --- SUCCÈS ---
    isStepCompleted = true;

    if (!isDragDrop) board.move(source + "-" + target);
    board.position(game.fen());

    if (moveAttempt.flags.includes("c")) playSound("capture");
    else playSound("move");
    setTimeout(() => playSound("success"), 300);

    showFeedback("success", step.successMsg || "Excellent !");
    const btnNext = document.getElementById("btn-next");
    btnNext.innerText = "Continuer";
    btnNext.classList.remove("disabled");
    btnNext.disabled = false;

    if (step.nextMove) {
      setTimeout(() => {
        game.move(step.nextMove);
        board.position(game.fen());
        playSound("move");
      }, 600);
    }
    return "success";
  } else {
    // --- ÉCHEC ---
    game.undo();

    if (isDragDrop) return "wrong";

    if (!isDragDrop) {
      board.move(source + "-" + target);
      setTimeout(() => {
        board.position(game.fen());
      }, 500);
    }

    playSound("error");
    if (
      isPromotion &&
      promotionChoice &&
      userMoveUCI.slice(0, 4) === expectedMove.slice(0, 4)
    ) {
      showFeedback("error", "Mauvaise pièce choisie pour la promotion !");
    } else {
      showFeedback("error", "Ce n'est pas le coup attendu. Réessayez.");
    }
    return "wrong";
  }
}

// --- LOGIQUE CLICK-TO-MOVE (Importée & Stylisée) ---

function handleSquareClick(square) {
  const piece = game.get(square);
  const turn = game.turn();
  const isMyPiece = piece && piece.color === turn;

  // CAS 1 : Sélectionner ma pièce
  if (isMyPiece) {
    if (selectedSquare === square) {
      removeSelection();
    } else {
      removeSelection();
      selectedSquare = square;
      highlightSquare(square); // Applique le jaune
      showMoveHints(square);
    }
    return;
  }

  // CAS 2 : Cliquer sur une destination
  if (selectedSquare) {
    validateAndPlayMove(selectedSquare, square, false);
    removeSelection();
  }
}

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

function highlightSquare(square) {
  const $square = $("#board").find(`.square-${square}`);
  $square.addClass("selected-square");

  // --- MODIFICATION : AJOUT DU CONTOUR JAUNE FORCE ---
  // On utilise box-shadow inset pour faire un cadre intérieur propre
  $square.css("box-shadow", "inset 0 0 0 4px #ffeb3b");
}

function removeSelection() {
  selectedSquare = null;
  const $board = $("#board");

  // On nettoie la classe ET le style CSS manuel
  $board
    .find(".selected-square")
    .removeClass("selected-square")
    .css("box-shadow", "");

  $board.find(".move-hint").removeClass("move-hint");
  $board.find(".capture-hint").removeClass("capture-hint");
}

function showMoveHints(square) {
  const moves = game.moves({ square: square, verbose: true });
  moves.forEach((move) => {
    const $targetSquare = $("#board").find(`.square-${move.to}`);
    if (move.flags.includes("c") || move.flags.includes("e")) {
      $targetSquare.addClass("capture-hint");
    } else {
      $targetSquare.addClass("move-hint");
    }
  });
}

// --- GESTION PROMOTION MODALE ---

function showPromotionModal(color) {
  const modal = document.getElementById("promotion-overlay");
  const container = document.getElementById("promo-pieces-container");
  if (!modal || !container) return;

  container.innerHTML = "";
  const pieces = ["q", "r", "b", "n"];

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
    const { source, target, isDragDrop } = pendingMove;
    const result = validateAndPlayMove(source, target, isDragDrop, pieceChar);

    if (result === "wrong" || result === "illegal") {
      board.position(game.fen());
    }
    pendingMove = null;
  }
}

// --- HANDLERS DRAG & DROP ---

function onDragStart(source, piece) {
  const step = getCurrentStep();
  if (!step || step.type !== "practice" || isStepCompleted) return false;

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

  const result = validateAndPlayMove(source, target, true);

  removeSelection();

  if (result === "pending") return;

  if (result === "illegal" || result === "wrong") {
    return "snapback";
  }
}

// --- VISUEL & UTILITAIRES ---

function showFeedback(type, msg) {
  const box = document.getElementById("feedback-box");
  if (!box) return;
  const msgEl = box.querySelector(".feedback-message");
  box.className = `feedback-box ${type}`;
  if (msgEl) msgEl.innerText = msg;
}

function shakeElement(el) {
  if (!el) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300 },
  );
}

// --- MOTEUR COURS ---

function getCurrentStep() {
  if (!currentCourse) return null;
  return currentCourse.chapters[currentChapterIndex].steps[currentStepIndex];
}

function loadCourse(courseId) {
  const data = COURSE_MAPPING[courseId];
  if (!data) {
    alert("Erreur cours");
    return;
  }
  currentCourse = data;
  document.getElementById("course-title").innerText = data.title;
  renderSidebar();
  loadChapter(0);
}

function renderSidebar() {
  const list = document.getElementById("chapter-list");
  if (!list) return;
  list.innerHTML = "";
  currentCourse.chapters.forEach((chap, index) => {
    const li = document.createElement("li");
    li.className = "chapter-item";
    li.innerHTML = `<span class="status">${index + 1}</span> ${chap.title}`;
    li.onclick = () => loadChapter(index);
    if (index === currentChapterIndex) li.classList.add("active");
    list.appendChild(li);
  });
}

function loadChapter(index) {
  currentChapterIndex = index;
  currentStepIndex = 0;
  document.querySelectorAll(".chapter-item").forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });
  renderStep();
}

function renderStep() {
  const step = getCurrentStep();
  if (!step) return;

  isStepCompleted = false;
  pendingMove = null;
  const overlay = document.getElementById("promotion-overlay");
  if (overlay) overlay.style.display = "none";

  removeSelection();

  const feedbackBox = document.getElementById("feedback-box");
  if (feedbackBox) feedbackBox.className = "feedback-box hidden";

  const chapter = currentCourse.chapters[currentChapterIndex];
  document.getElementById("step-counter").innerText =
    `Chapitre ${currentChapterIndex + 1} • Étape ${currentStepIndex + 1}/${chapter.steps.length}`;
  document.getElementById("step-title").innerText = step.title || chapter.title;
  document.getElementById("step-instruction").innerHTML = step.text;

  try {
    game.load(step.fen);
    board.position(step.fen, false);
  } catch (e) {
    console.error(e);
  }

  board.orientation(step.orientation || "white");

  setTimeout(() => {
    clearArrows();
    if (step.arrows) step.arrows.forEach(drawArrowStr);
  }, 50);

  const btnNext = document.getElementById("btn-next");
  const btnPrev = document.getElementById("btn-prev");
  btnPrev.disabled = currentStepIndex === 0 && currentChapterIndex === 0;

  if (step.type === "theory") {
    isStepCompleted = true;
    btnNext.classList.remove("disabled");
    btnNext.disabled = false;
    btnNext.innerText = "Suivant";
  } else {
    isStepCompleted = false;
    btnNext.classList.add("disabled");
    btnNext.disabled = true;
    btnNext.innerText = "À vous de jouer";
  }
}

function nextStep() {
  if (!isStepCompleted) {
    shakeElement(document.getElementById("btn-next"));
    return;
  }
  const chapter = currentCourse.chapters[currentChapterIndex];
  if (currentStepIndex < chapter.steps.length - 1) {
    currentStepIndex++;
    renderStep();
  } else {
    if (currentChapterIndex < currentCourse.chapters.length - 1) {
      markChapterComplete(currentCourse.id, currentChapterIndex);
      currentChapterIndex++;
      currentStepIndex = 0;
      renderSidebar();
      renderStep();
    } else {
      markChapterComplete(currentCourse.id, currentChapterIndex);
      showCompletionModal();
    }
  }
}

function prevStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderStep();
  } else if (currentChapterIndex > 0) {
    currentChapterIndex--;
    currentStepIndex =
      currentCourse.chapters[currentChapterIndex].steps.length - 1;
    renderSidebar();
    renderStep();
  }
}

function resetCurrentStep() {
  renderStep();
}

function initBoard() {
  var config = {
    draggable: true,
    position: "start",
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    moveSpeed: 200,
  };
  board = Chessboard("board", config);
  window.addEventListener("resize", () => {
    board.resize();
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
      const step = getCurrentStep();
      if (step && step.arrows) {
        clearArrows();
        step.arrows.forEach(drawArrowStr);
      }
    }, 100);
  });
}

// --- FLÈCHES & SVG ---
function drawArrowStr(arrowStr) {
  const parts = arrowStr.split("-");
  if (parts.length !== 2) return;
  drawArrow(parts[0], parts[1]);
}

function drawArrow(source, target) {
  const svg = document.getElementById("arrow-overlay");
  if (!svg) return;
  const s = getSquareCenter(source);
  const e = getSquareCenter(target);

  if (!document.getElementById("arrowhead")) {
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
  }
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", s.x);
  line.setAttribute("y1", s.y);
  line.setAttribute("x2", e.x);
  line.setAttribute("y2", e.y);
  line.setAttribute("stroke", "#ffa500");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("opacity", "0.6");
  line.setAttribute("marker-end", "url(#arrowhead)");
  svg.appendChild(line);
}

function getSquareCenter(square) {
  const files = "abcdefgh";
  const ranks = "12345678";
  let f = files.indexOf(square[0]);
  let r = ranks.indexOf(square[1]);
  const orientation = board.orientation();
  if (orientation === "black") {
    f = 7 - f;
    r = 7 - r;
  }
  const cellSize = 12.5;
  const half = 6.25;
  let x = f * cellSize + half;
  let y = 100 - (r * cellSize + half);
  return { x, y };
}

function clearArrows() {
  const svg = document.getElementById("arrow-overlay");
  if (!svg) return;
  while (svg.lastChild && svg.lastChild.tagName !== "defs")
    svg.removeChild(svg.lastChild);
}

async function markChapterComplete(moduleId, chapterIndex) {
  const user = auth.currentUser;
  if (!user) return;
  const progressRef = doc(db, "users", user.uid, "progress", moduleId);
  try {
    await updateDoc(progressRef, {
      completedChapters: arrayUnion(chapterIndex),
      lastUpdated: new Date(),
    }).catch(async () => {
      const { setDoc } =
        await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
      await setDoc(
        progressRef,
        { completedChapters: [chapterIndex], startedAt: new Date() },
        { merge: true },
      );
    });
  } catch (e) {
    console.error("Erreur sauvegarde :", e);
  }
}

function showCompletionModal() {
  if (
    confirm(
      "Félicitations ! Vous avez terminé ce module. Retourner à l'académie ?",
    )
  ) {
    window.location.href = "index.html";
  }
}
