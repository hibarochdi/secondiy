const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { matchRule, looksLikeProductSearch } = require("../lib/chatbotRules");

const router = express.Router();

/**
 * Ces deux routes appellent l'API Anthropic (Claude) pour :
 *  1. /interpret-search : transformer une phrase libre en filtres structurés
 *  2. /generate-listing : générer titre / description / catégorie / prix à partir
 *     d'une description brute (et, dans une vraie version, d'une photo envoyée en base64)
 *
 * Nécessite ANTHROPIC_API_KEY dans .env — voir https://docs.claude.com
 */

async function callClaude(systemPrompt, userContent) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur API Anthropic (${response.status}): ${text}`);
  }

  const data = await response.json();
  const text = data.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return text;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// POST /api/ai/interpret-search { query: "une veste Nike noire taille M" }
const searchSchema = z.object({ query: z.string().min(2) });
router.post("/interpret-search", async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "query requis." });

  try {
    const raw = await callClaude(
      `Tu es l'assistant de recherche de Secondie, une marketplace marocaine de seconde main.
Transforme la requête de l'utilisateur en filtres JSON strict, sans texte autour, avec ce schéma :
{"keywords": string, "category": "Mode"|"Maison"|"Tech"|null, "maxPrice": number|null, "size": string|null, "color": string|null}
Si une information n'est pas mentionnée, mets null.`,
      parsed.data.query
    );
    const filters = extractJson(raw);

    const listings = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.maxPrice ? { price: { lte: filters.maxPrice } } : {}),
        ...(filters.size ? { size: { equals: filters.size } } : {}),
        ...(filters.keywords
          ? { OR: [{ title: { contains: filters.keywords } }, { description: { contains: filters.keywords } }] }
          : {}),
      },
      take: 30,
    });

    res.json({ filters, listings });
  } catch (err) {
    res.status(502).json({ error: "L'assistant IA est momentanément indisponible.", details: err.message });
  }
});

// POST /api/ai/generate-listing { rawDescription: "veste en jean délavée, boutons métal..." }
const genSchema = z.object({ rawDescription: z.string().min(3) });
router.post("/generate-listing", requireAuth, async (req, res) => {
  const parsed = genSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "rawDescription requis." });

  try {
    const raw = await callClaude(
      `Tu es l'assistant vendeur de Secondie. À partir d'une courte description d'objet donnée par
un utilisateur marocain, génère une fiche annonce prête à publier, au format JSON strict sans texte autour :
{"title": string (max 60 caractères), "description": string (2-3 phrases, honnête, engageante),
"category": "Mode"|"Maison"|"Tech", "condition": "Neuf avec étiquette"|"Comme neuf"|"Très bon état"|"Bon état",
"suggestedPrice": number (en dirhams marocains, prix de seconde main réaliste)}`,
      parsed.data.rawDescription
    );
    const listing = extractJson(raw);
    res.json({ listing });
  } catch (err) {
    res.status(502).json({ error: "L'assistant IA est momentanément indisponible.", details: err.message });
  }
});

// Recherche gratuite par mots-clés simples (sans IA), utilisée quand ANTHROPIC_API_KEY
// n'est pas configuré ou en repli si l'appel IA échoue — pour que la recherche marche
// toujours, même sans clé API payante.
async function freeKeywordSearch(query) {
  const words = query.split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
  if (!words.length) return [];
  return prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      OR: words.flatMap((w) => [
        { title: { contains: w } },
        { description: { contains: w } },
        { city: { contains: w } },
      ]),
    },
    take: 20,
  });
}

// POST /api/ai/chat — point d'entrée unique du chatbot "SeconBot".
// 1) Essaie d'abord une réponse gratuite par règles (navigation, vente, sécurité, livraison…)
// 2) Si le message ressemble à une recherche produit, propose des annonces (IA si configurée,
//    sinon recherche par mots-clés — toujours gratuite dans ce cas)
// 3) Sinon, réponse générique d'aide, toujours gratuite
const chatSchema = z.object({ message: z.string().min(1).max(500) });
router.post("/chat", optionalAuth, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "message requis." });
  const { message } = parsed.data;

  // 1) Règles gratuites (aucun appel API, réponse instantanée)
  const rule = matchRule(message);
  if (rule && rule.action !== "sell_guide" && rule.action !== "price_help") {
    return res.json({ reply: rule.reply, source: "rules" });
  }
  if (rule && (rule.action === "sell_guide" || rule.action === "price_help")) {
    // Réponse de guidage immédiate; l'IA de génération d'annonce (/generate-listing) prend
    // le relais seulement quand l'utilisateur donne une vraie description à publier.
    return res.json({ reply: rule.reply, source: "rules", action: rule.action });
  }

  // 2) Ça ressemble à une recherche produit
  if (looksLikeProductSearch(message)) {
    // "Mémoire" légère : si l'utilisateur est connecté et a une taille enregistrée sur son
    // profil, on l'utilise en repli quand il ne précise pas de taille dans sa phrase.
    let rememberedSize = null;
    if (req.user?.id) {
      const profile = await prisma.user.findUnique({ where: { id: req.user.id }, select: { height: true } });
      rememberedSize = profile?.height || null;
    }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const raw = await callClaude(
          `Tu es l'assistant de recherche de Secondie, une marketplace marocaine de seconde main.
Transforme la requête de l'utilisateur en filtres JSON strict, sans texte autour, avec ce schéma :
{"keywords": string, "category": "Mode"|"Maison"|"Tech"|null, "maxPrice": number|null, "size": string|null, "color": string|null}
Si une information n'est pas mentionnée, mets null.`,
          message
        );
        const filters = extractJson(raw);
        const effectiveSize = filters.size || rememberedSize;
        const listings = await prisma.listing.findMany({
          where: {
            status: "ACTIVE",
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.maxPrice ? { price: { lte: filters.maxPrice } } : {}),
            ...(effectiveSize ? { size: { equals: effectiveSize } } : {}),
            ...(filters.keywords
              ? { OR: [{ title: { contains: filters.keywords } }, { description: { contains: filters.keywords } }] }
              : {}),
          },
          take: 20,
        });
        const memoNote = !filters.size && rememberedSize ? ` (j'ai utilisé ta taille habituelle : ${rememberedSize})` : "";
        return res.json({
          reply: listings.length ? `Voilà ce que j'ai trouvé pour toi${memoNote} :` : "Je n'ai rien trouvé qui corresponde — essaie une autre recherche.",
          listings,
          source: "ai",
        });
      } catch (err) {
        // Repli gratuit si l'IA échoue (clé invalide, quota, service indisponible…)
        const listings = await freeKeywordSearch(message);
        return res.json({
          reply: listings.length ? "Voilà ce que j'ai trouvé pour toi :" : "Je n'ai rien trouvé qui corresponde pour l'instant.",
          listings,
          source: "keyword-fallback",
        });
      }
    } else {
      // Pas de clé API configurée : recherche gratuite par mots-clés
      const listings = await freeKeywordSearch(message);
      return res.json({
        reply: listings.length ? "Voilà ce que j'ai trouvé pour toi :" : "Je n'ai rien trouvé qui corresponde — essaie une autre recherche.",
        listings,
        source: "keyword",
      });
    }
  }

  // 3) Réponse générique, toujours gratuite
  return res.json({
    reply:
      "Je peux t'aider à trouver un article, vendre le tien, ou m'expliquer comment utiliser l'app " +
      "(livraison, compte, signalement…). Dis-m'en un peu plus ?",
    source: "rules",
  });
});

module.exports = router;