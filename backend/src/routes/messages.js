const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/messages/conversations — toutes mes conversations
router.get("/conversations", requireAuth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }] },
    include: {
      listing: { select: { id: true, title: true, price: true, images: true } },
      buyer: { select: { id: true, name: true, avatarUrl: true } },
      seller: { select: { id: true, name: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ conversations });
});

// POST /api/messages/conversations — démarrer (ou récupérer) une conversation sur une annonce
const startSchema = z.object({ listingId: z.string() });
router.post("/conversations", requireAuth, async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "listingId requis." });

  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing) return res.status(404).json({ error: "Annonce introuvable." });
  if (listing.sellerId === req.user.id) return res.status(400).json({ error: "Vous ne pouvez pas discuter avec vous-même." });

  const conversation = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: req.user.id } },
    update: {},
    create: { listingId: listing.id, buyerId: req.user.id, sellerId: listing.sellerId },
  });

  res.status(201).json({ conversation });
});

// GET /api/messages/conversations/:id — historique des messages
router.get("/conversations/:id", requireAuth, async (req, res) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      buyer: { select: { id: true, name: true, avatarUrl: true } },
      seller: { select: { id: true, name: true, avatarUrl: true } },
      listing: { select: { id: true, title: true, price: true } },
    },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
  if (![conversation.buyerId, conversation.sellerId].includes(req.user.id)) {
    return res.status(403).json({ error: "Accès non autorisé à cette conversation." });
  }
  res.json({ conversation });
});

// POST /api/messages/conversations/:id — envoyer un message
const sendSchema = z.object({ body: z.string().min(1), kind: z.enum(["TEXT", "OFFER"]).default("TEXT") });
router.post("/conversations/:id", requireAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Message vide." });

  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
  if (![conversation.buyerId, conversation.sellerId].includes(req.user.id)) {
    return res.status(403).json({ error: "Accès non autorisé à cette conversation." });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: req.user.id,
      body: parsed.data.body,
      kind: parsed.data.kind,
    },
  });
  res.status(201).json({ message });
});

module.exports = router;
