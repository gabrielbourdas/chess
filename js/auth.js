// js/auth.js

// 1. IMPORTS (Regroupés en haut)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 2. CONFIGURATION FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBNBUO3JupohDCYAMs7Xf6kKgxnnFgPpVM",
  authDomain: "open-chess-2f3cf.firebaseapp.com",
  projectId: "open-chess-2f3cf",
  storageBucket: "open-chess-2f3cf.firebasestorage.app",
  messagingSenderId: "447945730536",
  appId: "1:447945730536:web:a1e3347bc13e94040bdc5d",
  measurementId: "G-71F05DTLHG",
};

// 3. INITIALISATION
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 4. FONCTION : SAUVEGARDER L'AVANCEMENT
window.saveProgress = async function (lessonId, stepIndex) {
  const user = auth.currentUser;
  if (user) {
    const userRef = doc(db, "users", user.uid);
    try {
      await setDoc(
        userRef,
        {
          progress: {
            [lessonId]: stepIndex,
          },
        },
        { merge: true }
      );
      console.log(`Sauvegardé : ${lessonId} à l'étape ${stepIndex}`);
    } catch (e) {
      console.error("Erreur de sauvegarde : ", e);
    }
  } else {
    console.log("Pas connecté, progression non sauvegardée.");
  }
};

// 5. FONCTION : CHARGER L'AVANCEMENT
window.loadProgress = async function (lessonId) {
  const user = auth.currentUser;
  if (user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.progress && data.progress[lessonId]) {
        return data.progress[lessonId];
      }
    }
  }
  return 0;
};

// 6. SURVEILLANCE, SÉCURITÉ ET MENU
onAuthStateChanged(auth, (user) => {
  // Récupération des deux boutons potentiels
  const btnMobile = document.getElementById("logout-btn-mobile");
  const btnDesktop = document.getElementById("logout-btn-desktop");
  // Si tu n'as pas encore mis à jour ton HTML pour avoir 2 boutons,
  // ce code fonctionnera quand même avec l'ancien ID unique :
  const btnUnique = document.getElementById("logout-btn");

  // --- A. BARRIÈRE DE SÉCURITÉ (REDIRECTION) ---
  const pageProtegee =
    // J'ai commenté ou supprimé la ligne ci-dessous pour libérer l'accès aux cours :
    // window.location.pathname.includes("/Learn/") ||
    window.location.pathname.includes("/Play/") ||
    window.location.pathname.includes("/Analyse/");

  // Si on est sur une page protégée ET pas connecté -> Dehors !
  if (pageProtegee && !user) {
    console.log("Accès interdit : Redirection...");
    window.location.href = "/login/index.html";
    return;
  }

  // --- B. GESTION DÉCONNEXION ---
  const actionDeconnexion = () => {
    signOut(auth)
      .then(() => {
        alert("À bientôt !");
        window.location.href = "/index.html"; // Retour accueil
      })
      .catch((error) => console.error(error));
  };

  if (user) {
    // SI CONNECTÉ
    console.log("Connecté : " + user.email);

    // On active les boutons s'ils existent dans la page
    if (btnMobile) {
      btnMobile.style.display = "block";
      btnMobile.addEventListener("click", actionDeconnexion);
    }
    if (btnDesktop) {
      btnDesktop.style.display = "block";
      btnDesktop.addEventListener("click", actionDeconnexion);
    }
    if (btnUnique) {
      btnUnique.style.display = "block";
      btnUnique.addEventListener("click", actionDeconnexion);
    }
  } else {
    // SI DÉCONNECTÉ
    if (btnMobile) btnMobile.style.display = "none";
    if (btnDesktop) btnDesktop.style.display = "none";
    if (btnUnique) btnUnique.style.display = "none";
  }
});

// 7. DÉCONNEXION AUTOMATIQUE (INACTIVITÉ)
let tempsInactivite;
const DELAI_EXPIRATION = 15 * 60 * 1000; // 15 minutes

function reinitialiserMinuteur() {
  if (auth.currentUser) {
    clearTimeout(tempsInactivite);
    tempsInactivite = setTimeout(() => {
      signOut(auth).then(() => {
        alert("Vous avez été déconnecté pour inactivité.");
        window.location.href = "/login/index.html";
      });
    }, DELAI_EXPIRATION);
  }
}

// Écouteurs pour l'inactivité
window.onload = reinitialiserMinuteur;
document.onmousemove = reinitialiserMinuteur;
document.onkeypress = reinitialiserMinuteur;
document.onclick = reinitialiserMinuteur;
document.onscroll = reinitialiserMinuteur;

// Export final unique
export { auth, db };
