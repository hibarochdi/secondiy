const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

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

module.exports = router;
