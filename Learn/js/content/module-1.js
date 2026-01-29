export const module1 = {
  id: "module-1",
  title: "Les Bases Absolues",
  description:
    "Tout ce qu'il faut savoir avant de toucher une pièce : le plateau, les règles et le but du jeu.",
  chapters: [
    // --- CHAPITRE 1 ---
    {
      title: "Le Terrain de Jeu",
      steps: [
        {
          type: "theory",
          title: "L'Échiquier",
          text: `
                        <p>L'échiquier est un plateau de 64 cases alternant le blanc (clair) et le noir (sombre).</p>
                        <p><strong>Règle importante :</strong> Placez toujours l'échiquier de façon à ce que la case en bas à droite soit une case <strong>blanche</strong> (h1).</p>
                        <p>Les colonnes sont nommées de <strong>a</strong> à <strong>h</strong> et les rangées de <strong>1</strong> à <strong>8</strong>.</p>
                    `,
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          arrows: ["a1-h1", "h1-h8", "h1-h1"],
        },
        {
          type: "theory",
          title: "Placement Initial",
          text: `
                        <p>Pour débuter une partie, on installe les pièces toujours de la même façon.</p>
                        <p><em>"La Dame sur sa couleur"</em> : La Dame blanche sur la case blanche (d1), la Dame noire sur la case noire (d8).</p>
                    `,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          arrows: ["d1-d1", "d8-d8"],
        },
      ],
    },

    // --- CHAPITRE 2 ---
    {
      title: "La Valeur des Pièces",
      steps: [
        {
          type: "theory",
          title: "Combien ça vaut ?",
          text: `
                        <p>Aux échecs, on utilise un système de points pour évaluer si un échange est favorable.</p>
                        <table style="width:100%; border-collapse: collapse; margin-top:10px;">
                            <tr style="border-bottom:1px solid #444;">
                                <th style="text-align:left;">Pièce</th>
                                <th style="text-align:right;">Valeur</th>
                            </tr>
                            <tr><td>♟️ Pion</td><td style="text-align:right;"><strong>1</strong> pt</td></tr>
                            <tr><td>♞ Cavalier</td><td style="text-align:right;"><strong>3</strong> pts</td></tr>
                            <tr><td>♝ Fou</td><td style="text-align:right;"><strong>3</strong> pts</td></tr>
                            <tr><td>♜ Tour</td><td style="text-align:right;"><strong>5</strong> pts</td></tr>
                            <tr><td>♛ Dame</td><td style="text-align:right;"><strong>9</strong> pts</td></tr>
                            <tr><td>♚ Roi</td><td style="text-align:right;"><strong>∞</strong></td></tr>
                        </table>
                    `,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        },
      ],
    },

    // --- CHAPITRE 3 ---
    {
      title: "Les Mouvements de Base",
      steps: [
        {
          type: "theory",
          title: "Le Pion ♟️",
          text: `
                        <p>Le <strong>Pion</strong> est l'âme du jeu.</p>
                        <ul>
                            <li>Il <strong>avance</strong> tout droit d'une case.</li>
                            <li>⚠️ <strong>Attention :</strong> Il capture uniquement en <strong>diagonale</strong> (1 case) !</li>
                            <li>Il ne recule jamais.</li>
                        </ul>
                    `,
          fen: "8/8/8/8/3P4/8/8/8 w - - 0 1",
          arrows: ["d4-d5"],
        },
        {
          type: "theory",
          title: "La Tour ♜",
          text: `
                        <p>La <strong>Tour</strong> est une pièce lourde.</p>
                        <p>Elle se déplace en <strong>ligne droite</strong> (horizontalement ou verticalement) d'autant de cases qu'elle le souhaite.</p>
                    `,
          fen: "8/8/8/8/3R4/8/8/8 w - - 0 1",
          arrows: ["d4-d8", "d4-d1", "d4-a4", "d4-h4"],
        },
        {
          type: "theory",
          title: "Le Fou ♝",
          text: `
                        <p>Le <strong>Fou</strong> est le maître des diagonales.</p>
                        <p>Il se déplace en <strong>diagonale</strong> d'autant de cases qu'il veut.</p>
                    `,
          fen: "8/8/8/8/3B4/8/8/8 w - - 0 1",
          arrows: ["d4-a7", "d4-h8", "d4-a1", "d4-g1"],
        },
        {
          type: "theory",
          title: "Le Cavalier ♞",
          text: `
                        <p>Le <strong>Cavalier</strong> est la pièce la plus rusée.</p>
                        <ul>
                            <li>Il se déplace en forme de <strong>"L"</strong> (2 cases dans un sens, puis 1 sur le côté).</li>
                            <li>C'est la seule pièce qui peut <strong>sauter</strong> par-dessus les autres !</li>
                        </ul>
                    `,
          fen: "8/8/8/8/4N3/8/8/8 w - - 0 1",
          arrows: [
            "e4-d6",
            "e4-f6",
            "e4-c5",
            "e4-g5",
            "e4-c3",
            "e4-g3",
            "e4-d2",
            "e4-f2",
          ],
        },
        {
          type: "theory",
          title: "La Dame ♛",
          text: `
                        <p>La <strong>Dame</strong> est la pièce la plus puissante.</p>
                        <p>Elle combine les mouvements de la Tour et du Fou : elle peut aller dans <strong>toutes les directions</strong>.</p>
                    `,
          fen: "8/8/8/8/3Q4/8/8/8 w - - 0 1",
          arrows: [
            "d4-d8",
            "d4-d1",
            "d4-a4",
            "d4-h4",
            "d4-a7",
            "d4-h8",
            "d4-a1",
            "d4-g1",
          ],
        },
        {
          type: "theory",
          title: "Le Roi ♚",
          text: `
                        <p>Le <strong>Roi</strong> est précieux mais lent.</p>
                        <p>Il se déplace d'<strong>une seule case</strong> dans toutes les directions.</p>
                    `,
          fen: "8/8/8/8/4K3/8/8/8 w - - 0 1",
          arrows: [
            "e4-e5",
            "e4-d5",
            "e4-d4",
            "e4-d3",
            "e4-e3",
            "e4-f3",
            "e4-f4",
            "e4-f5",
          ],
        },
      ],
    },

    // --- CHAPITRE 4 ---
    {
      title: "Règles Spéciales",
      steps: [
        {
          type: "practice",
          title: "Le Double Pas du Pion",
          text: `
                        <p>Pour son <strong>tout premier mouvement</strong>, un pion peut avancer de <strong>2 cases</strong> d'un coup.</p>
                        <p><strong>Action :</strong> Avancez le pion blanc de e2 à e4.</p>
                    `,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          solution: "e2e4",
          successMsg: "Parfait ! Vous contrôlez le centre.",
        },
        {
          type: "practice",
          title: "La Prise en Passant",
          text: `
                        <p>Si un pion adverse utilise son "double pas" pour passer juste à côté du vôtre, vous pouvez le manger comme s'il n'avait avancé que d'une case !</p>
                        <p><strong>Action :</strong> Le pion noir vient d'avancer de deux cases. Capturez-le en déplaçant votre pion blanc en <strong>e6</strong> (la case vide derrière lui).</p>
                    `,
          fen: "rnbqkbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3",
          arrows: ["d5-e6"],
          solution: "d5e6",
          successMsg:
            "Superbe ! Vous avez maîtrisé la règle la plus subtile du jeu.",
        },
        {
          type: "practice",
          title: "Le Roque (Petit)",
          text: `
                        <p>Le seul coup où l'on bouge <strong>deux pièces</strong> ! Le Roi fait 2 pas vers la Tour, et la Tour saute par-dessus.</p>
                        <p><strong>Action :</strong> Faites un \"Petit Roque\" en déplaçant le Roi de <strong>e1</strong> à <strong>g1</strong>.</p>
                    `,
          fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
          solution: "e1g1",
          successMsg: "Le Roi est à l'abri !",
        },
        {
          type: "practice",
          title: "Le Grand Roque",
          text: `
                        <p>Il existe aussi le "Grand Roque" de l'autre côté. Le principe est le même : le Roi fait <strong>2 pas</strong> vers la Tour éloignée (aile Dame).</p>
                        <p><strong>Action :</strong> Faites un "Grand Roque" en déplaçant le Roi de <strong>e1</strong> vers la gauche en <strong>c1</strong>.</p>
                    `,
          fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
          solution: "e1c1",
          successMsg: "Excellent ! Le Roi est sécurisé et la Tour est centrée.",
        },
        {
          type: "practice",
          title: "La Promotion",
          text: `
                        <p>Si un pion atteint le bout de l'échiquier, il se transforme ! On choisit généralement la Dame.</p>
                        <p><strong>Action :</strong> Poussez le pion en <strong>a8</strong> pour le promouvoir.</p>
                    `,
          fen: "8/P7/8/8/8/8/8/k6K w - - 0 1",
          solution: "a7a8q",
          successMsg: "Une nouvelle Reine est née !",
        },
      ],
    },

    // --- CHAPITRE 5 ---
    {
      title: "L'Objectif Final",
      steps: [
        {
          type: "theory",
          title: "Échec et Mat",
          text: `
                        <p><strong>Échec :</strong> Le Roi est menacé mais peut se sauver.</p>
                        <p><strong>Échec et Mat :</strong> Le Roi est menacé et <strong>ne peut pas</strong> se sauver. La partie est gagnée.</p>
                    `,
          fen: "R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1",
          arrows: ["a8-e8"],
        },
        {
          type: "theory",
          title: "Le Pat (Nul)",
          text: `
                        <p>Si le Roi adverse n'est <strong>pas attaqué</strong> mais ne peut plus bouger, c'est <strong>Pat</strong> (Match Nul).</p>
                    `,
          fen: "8/8/8/8/8/5k2/5p2/5K2 w - - 0 1",
        },
      ],
    },
  ],
};
