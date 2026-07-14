const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/listings?q=&category=&city=&minPrice=&maxPrice=&type=&mine=true
router.get("/", optionalAuth, async (req, res) => {
  const { q, category, city, minPrice, maxPrice, type, mine } = req.query;
  const isMine = mine === "true" && req.user;

  const where = {
    // Vue publique : seulement les annonces actives/réservées.
    // Vue "mine=true" : toutes les annonces du vendeur connecté, quel que soit le statut.
    ...(isMine ? { sellerId: req.user.id } : { status: { in: ["ACTIVE", "RESERVED"] } }),
    ...(category ? { category } : {}),
    ...(city ? { city } : {}),
    ...(type ? { type } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: String(q) } },
            { description: { contains: String(q) } },
          ],
        }
      : {}),
    ...(minPrice || maxPrice
      ? {
          price: {
            ...(minPrice ? { gte: Number(minPrice) } : {}),
            ...(maxPrice ? { lte: Number(maxPrice) } : {}),
          },
        }
      : {}),
  };

  const listings = await prisma.listing.findMany({
    where,
    include: { seller: { select: { id: true, name: true, avatarUrl: true, trustBadge: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  res.json({ listings: listings.map(serialize) });
});

// GET /api/listings/:id
router.get("/:id", async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: { seller: { select: { id: true, name: true, avatarUrl: true, trustBadge: true, city: true } } },
  });
  if (!listing) return res.status(404).json({ error: "Annonce introuvable." });
  res.json({ listing: serialize(listing) });
});

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  price: z.number().min(0),
  category: z.string(),
  condition: z.string(),
  size: z.string().optional(),
  city: z.string(),
  images: z.array(z.string()).min(1),
  type: z.enum(["vente", "don"]).default("vente"),
});

// POST /api/listings  (créer une annonce)
router.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Données invalides.", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const listing = await prisma.listing.create({
    data: { ...data, images: JSON.stringify(data.images), sellerId: req.user.id },
  });
  res.status(201).json({ listing: serialize(listing) });
});

// PATCH /api/listings/:id  (modifier — vendeur uniquement, sauf réservation d'un don)
router.patch("/:id", requireAuth, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "Annonce introuvable." });

  const isOwner = listing.sellerId === req.user.id;
  const bodyKeys = Object.keys(req.body);
  const isReserveAction = bodyKeys.length === 1 && req.body.status === "RESERVED";
  const canReserveAsBuyer = isReserveAction && listing.type === "don" && !isOwner;

  if (!isOwner && !canReserveAsBuyer) {
    return res.status(403).json({ error: "Vous n'êtes pas autorisé à modifier cette annonce." });
  }

  const updates = { ...req.body };
  if (updates.images) updates.images = JSON.stringify(updates.images);

  const updated = await prisma.listing.update({ where: { id: req.params.id }, data: updates });
  res.json({ listing: serialize(updated) });
});

// DELETE /api/listings/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "Annonce introuvable." });
  const isOwner = listing.sellerId === req.user.id;
  const isAdmin = req.user.role === "ADMIN";
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Vous n'êtes pas le vendeur de cette annonce." });

  await prisma.listing.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// POST /api/listings/:id/favorite (toggle)
router.post("/:id/favorite", requireAuth, async (req, res) => {
  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId: req.user.id, listingId: req.params.id } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return res.json({ favorited: false });
  }

  await prisma.favorite.create({ data: { userId: req.user.id, listingId: req.params.id } });
  res.json({ favorited: true });
});

function serialize(listing) {
  return { ...listing, images: JSON.parse(listing.images || "[]") };
}

module.exports = router;
