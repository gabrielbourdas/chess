// js/analysis.js
import { Chess } from "./chess.js"; // Assurez-vous que le chemin est bon

// --- CONFIGURATION ---
const EVAL_CATEGORIES = [
  { diff: 5, label: "Meilleur coup", class: "best", color: "#26c281" },
  { diff: 25, label: "Excellent", class: "excellent", color: "#96bc4b" },
  { diff: 50, label: "Bon", class: "good", color: "#baca44" },
  { diff: 100, label: "Imprécision", class: "inaccuracy", color: "#f7c045" },
  { diff: 200, label: "Erreur", class: "mistake", color: "#e69f00" },
  { diff: Infinity, label: "Gaffe", class: "blunder", color: "#ff3333" },
];

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// --- FONCTIONS EXPORTÉES ---

/**
 * 1. CLASSIFICATION
 * Compare le score du coup joué vs le meilleur score possible
 */
export function classifyMove(bestEval, playedEval) {
  // Note: Stockfish donne les scores en centipawns (100 = 1 pion)
  // On prend la valeur absolue de la différence
  const diff = Math.abs(bestEval - playedEval);

  for (const category of EVAL_CATEGORIES) {
    if (diff <= category.diff) {
      return category;
    }
  }
  return EVAL_CATEGORIES[EVAL_CATEGORIES.length - 1];
}

/**
 * 2. EXPLICATION (Le Pourquoi)
 * Compare le matériel et les échecs
 */
export function explainMove(fenStart, movePlayedSan, bestMoveSan, playerColor) {
  const game = new Chess(fenStart);

  // État A : Ce que le joueur a fait
  game.move(movePlayedSan);
  const fenPlayed = game.fen();
  const materialPlayed = getMaterialBalance(fenPlayed, playerColor);
  const isMatePlayed = game.isCheckmate();
  game.undo();

  // État B : Ce qu'il aurait dû faire
  game.move(bestMoveSan);
  const fenBest = game.fen();
  const materialBest = getMaterialBalance(fenBest, playerColor);
  const isMateBest = game.isCheckmate();
  game.undo();

  // Analyse des différences
  // Si le joueur a MOINS de matériel dans sa variante que dans la meilleure variante
  const materialLoss = materialBest - materialPlayed;

  if (materialLoss > 0) {
    return `Perte de matériel. Vous perdez l'équivalent de ${materialLoss} points (pions) par rapport au meilleur coup.`;
  }

  if (isMateBest && !isMatePlayed) {
    return "Occasion manquée. Vous aviez un échec et mat forcé !";
  }

  if (materialLoss === 0) {
    return "Erreur positionnelle. Le matériel est égal, mais vos pièces sont moins actives ou votre roi est moins en sécurité.";
  }

  return "Coup complexe.";
}

// --- FONCTION UTILITAIRE (Interne) ---

/**
 * Calcule le score matériel pour une couleur donnée
 * Blancs (w) ou Noirs (b)
 */
function getMaterialBalance(fen, playerColor) {
  let score = 0;
  const boardStr = fen.split(" ")[0]; // On garde juste la position des pièces

  for (const char of boardStr) {
    if (PIECE_VALUES[char.toLowerCase()]) {
      const value = PIECE_VALUES[char.toLowerCase()];
      // Les majuscules sont les Blancs, minuscules les Noirs
      const isWhitePiece = char === char.toUpperCase();

      if (playerColor === "w") {
        score += isWhitePiece ? value : 0; // On compte nos pièces
      } else {
        score += !isWhitePiece ? value : 0; // On compte nos pièces
      }
    }
  }
  return score;
}
