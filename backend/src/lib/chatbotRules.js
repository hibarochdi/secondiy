/**
 * Moteur de réponses "gratuit" pour SeconBot.
 *
 * Objectif : répondre instantanément, sans appeler l'API Anthropic (donc sans coût),
 * à toutes les questions importantes et récurrentes des utilisateurs : navigation dans
 * l'app, aide à la vente, livraison, compte, sécurité/arnaques, conseils mode/prix.
 *
 * Seule la recherche produit "intelligente" (comprendre une phrase libre et la traduire
 * en filtres) utilise l'IA payante, et seulement si ANTHROPIC_API_KEY est configuré —
 * avec un repli gratuit par mots-clés simples sinon (voir routes/ai.js).
 *
 * Chaque règle a une liste de mots-clés/expressions à détecter (en minuscule, sans accents
 * pour simplifier) et une réponse. La première règle qui matche gagne.
 */

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // enlève les accents
}

const RULES = [
  // 1) Navigation — comment vendre
  {
    keywords: ["comment vendre", "comment publier", "publier une annonce", "creer une annonce", "poster une annonce"],
    reply:
      "Pour vendre sur SeconDIY, c'est simple :\n" +
      "1️⃣ Appuie sur le bouton « + » (créer une annonce)\n" +
      "2️⃣ Ajoute des photos claires de ton article\n" +
      "3️⃣ Décris-le (état, taille, marque) — je peux même te générer une description et un prix si tu me donnes quelques détails\n" +
      "4️⃣ Choisis ta ville, publie ✅\n\n" +
      "Tu veux que je t'aide à rédiger l'annonce maintenant ? Dis-moi juste ce que tu vends.",
    action: "sell_guide",
  },
  {
    keywords: ["je veux vendre", "vendre un", "vendre ma", "vendre mon"],
    reply:
      "Super, je vais t'aider à vendre 🛒 Décris-moi l'article (type, marque, état, taille si applicable) " +
      "et je te propose un titre, une description et un prix suggéré.",
    action: "sell_guide",
  },
  {
    keywords: ["quel prix", "combien vendre", "prix normal pour", "combien ca vaut", "estimer le prix"],
    reply:
      "Pour estimer un bon prix de seconde main, regarde 3 choses : l'état général, la marque, et les prix similaires déjà publiés sur SeconDIY. " +
      "Donne-moi l'objet (marque, état) et je te propose une fourchette de prix réaliste.",
    action: "price_help",
  },

  // 2) Navigation générale
  {
    keywords: ["comment contacter", "contacter le vendeur", "contacter un vendeur", "envoyer un message"],
    reply:
      "Pour contacter un·e vendeur·se : ouvre l'annonce qui t'intéresse puis appuie sur « Contacter » ou l'icône 💬. " +
      "Ça ouvre une conversation privée directement avec la personne.",
  },
  {
    keywords: ["supprimer une annonce", "supprimer mon annonce", "retirer une annonce"],
    reply:
      "Va dans ton profil → « Mes annonces » → ouvre l'annonce concernée → « Supprimer ». " +
      "C'est définitif, donc si tu veux juste la mettre en pause, marque-la plutôt « Réservée ».",
  },
  {
    keywords: ["modifier profil", "modifier mon profil", "changer ma photo", "changer ma bio"],
    reply:
      "Tu peux modifier ton profil depuis l'icône ⚙️ Paramètres en haut de ta page profil : photo, bio, ville, taille, styles préférés, tout est modifiable.",
  },
  {
    keywords: ["supprimer mon compte", "supprimer compte", "fermer mon compte"],
    reply:
      "Tu peux supprimer ton compte depuis Paramètres → « Supprimer mon compte », tout en bas. " +
      "⚠️ C'est définitif : tes annonces, messages et avis seront supprimés. Tu es sûr·e de vouloir continuer ?",
  },

  // 3) Livraison
  {
    keywords: ["envoyer un colis", "comment envoyer", "livraison", "expedier"],
    reply:
      "Deux options sur SeconDIY :\n" +
      "📦 Envoi par colis : mets-toi d'accord avec l'acheteur·se sur le transporteur, et garde toujours une preuve d'envoi.\n" +
      "🤝 Remise en main propre : idéal pour les mêmes villes — donnez-vous rendez-vous dans un lieu public.",
  },
  {
    keywords: ["remise en main propre", "rendez-vous", "recuperer en personne"],
    reply:
      "Pour une remise en main propre, on te conseille toujours de choisir un lieu public et fréquenté, en journée, et d'inspecter l'article avant de payer.",
  },

  // 4) Sécurité / arnaques
  {
    keywords: ["signaler un vendeur", "signaler une annonce", "comment signaler"],
    reply:
      "Sur le profil du vendeur ou sur l'annonce, appuie sur les « ⋯ » puis « Signaler ». Notre équipe examine chaque signalement rapidement.",
  },
  {
    keywords: ["arnaque", "arnaquer", "c'est une arnaque", "suspect", "fraude"],
    reply:
      "⚠️ Prudence ! Quelques signaux d'arnaque : paiement demandé hors de l'app, prix trop bas pour être vrai, vendeur qui refuse d'envoyer plus de photos ou pousse à payer très vite.\n" +
      "Ne paie jamais en dehors des moyens sécurisés, et signale tout comportement suspect avec le bouton « Signaler ».",
  },
  {
    keywords: ["j'ai un probleme", "j'ai un souci", "ca marche pas", "bug"],
    reply:
      "Désolé pour la gêne 🙏 Dis-m'en un peu plus sur le problème (annonce, paiement, message…) et je t'oriente, ou contacte le support depuis Paramètres → « Aide & support » si besoin d'une prise en charge humaine.",
  },
  {
    keywords: ["on m'a pas repondu", "pas de reponse", "vendeur ne repond pas"],
    reply:
      "Ça arrive — laisse un peu de temps (24-48h), et si toujours rien, tu peux signaler la conversation ou chercher un article similaire chez un autre vendeur.",
  },

  // 5) Conseils mode
  {
    keywords: ["avec quoi porter", "comment porter", "associer avec"],
    reply:
      "Ça dépend du style que tu veux ! Dis-moi la pièce (ex: veste en jean) et le style recherché (casual, chic, streetwear…), je te propose des idées de tenue.",
  },
  {
    keywords: ["look ete", "tenue ete", "look d'ete"],
    reply:
      "Pour un look d'été simple et frais : pièces légères en coton/lin, couleurs claires, et une pièce forte (sac, chaussures colorées) pour twister la tenue. Tu cherches plutôt homme, femme, ou unisexe ?",
  },
  {
    keywords: ["tenue mariage", "tenue pour mariage", "tenue de soiree"],
    reply:
      "Pour un mariage, mise sur une pièce élégante — robe longue, costume ou tenue traditionnelle selon le style de l'évènement. Donne-moi ton budget et ta taille, je cherche ce qu'il y a de dispo en ce moment.",
  },

  // 6) Salutations / small talk
  {
    keywords: ["bonjour", "salut", "salam", "hello", "coucou"],
    reply: "Salut 👋 Je suis SeconBot. Je peux t'aider à trouver un article, vendre le tien, ou naviguer dans l'app. Qu'est-ce que je peux faire pour toi ?",
  },
  {
    keywords: ["merci"],
    reply: "Avec plaisir 🙌 Autre chose ?",
  },
];

/**
 * Cherche une règle qui matche le message. Retourne { reply, action } ou null si rien ne matche.
 */
function matchRule(message) {
  const text = normalize(message);
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(normalize(kw)))) {
      return { reply: rule.reply, action: rule.action || null };
    }
  }
  return null;
}

/**
 * Détecte si un message ressemble à une recherche de produit plutôt qu'une question
 * de navigation/support (utilisé pour décider s'il faut chercher dans les annonces).
 */
function looksLikeProductSearch(message) {
  const text = normalize(message);
  const searchHints = [
    "cherche", "je veux acheter", "taille", "pas cher", "robe", "veste", "jean", "chaussure",
    "sac", "pantalon", "pull", "manteau", "nike", "zara", "adidas", "iphone", "telephone",
    "meuble", "canape", "vintage", "streetwear", "homme", "femme",
  ];
  return searchHints.some((h) => text.includes(h));
}

module.exports = { matchRule, looksLikeProductSearch, normalize };