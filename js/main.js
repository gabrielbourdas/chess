// js/main.js
import { classifyMove, explainMove } from "./analysis.js";

// Simulation : Imaginons que Stockfish a fini de calculer
// Ces valeurs viendraient de votre événement onmessage du worker Stockfish
const scoreMeilleurCoup = 150; // +1.50
const scoreCoupJoueur = 40; // +0.40 (Grosse erreur !)
const fenDepart = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const coupJoueur = "h3";
const meilleurCoup = "e4";
const couleurJoueur = "w"; // Blancs

function afficherResultat() {
  // 1. On demande l'analyse au module analysis.js
  const classification = classifyMove(scoreMeilleurCoup, scoreCoupJoueur);
  const explication = explainMove(
    fenDepart,
    coupJoueur,
    meilleurCoup,
    couleurJoueur,
  );

  // 2. On affiche dans le HTML
  const divResultat = document.getElementById("analyse-result");

  divResultat.innerHTML = `
        <h2 style="color: ${classification.color}">${classification.label}</h2>
        <p><strong>Pourquoi ?</strong> ${explication}</p>
    `;
}

// Lancer l'affichage pour tester
afficherResultat();
