const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/users/:id — profil public d'un utilisateur (vraies stats + statut de suivi réel)
router.get("/:id", optionalAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const [salesCount, listingsCount, followersCount, reviews, isFollowing] = await Promise.all([
    prisma.listing.count({ where: { sellerId: user.id, status: "SOLD" } }),
    prisma.listing.count({ where: { sellerId: user.id, status: { in: ["ACTIVE", "RESERVED"] } } }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.review.findMany({ where: { targetId: user.id }, select: { rating: true } }),
    req.user
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.user.id, followingId: user.id } } })
      : null,
  ]);
  const rating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  res.json({
    user: {
      id: user.id, name: user.name, city: user.city, trustBadge: user.trustBadge, createdAt: user.createdAt,
      salesCount, listingsCount, followersCount, rating, isFollowing: !!isFollowing,
    },
  });
});

// GET /api/users/:id/listings — annonces publiques d'un utilisateur
router.get("/:id/listings", async (req, res) => {
  const listings = await prisma.listing.findMany({
    where: { sellerId: req.params.id, status: { in: ["ACTIVE", "RESERVED"] } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ listings: listings.map(l => ({ ...l, images: JSON.parse(l.images || "[]") })) });
});

// POST /api/users/:id/follow — suivre / ne plus suivre (bascule), vrai état persistant
router.post("/:id/follow", requireAuth, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Tu ne peux pas te suivre toi-même." });

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: req.user.id, followingId: req.params.id } },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return res.json({ following: false });
  }
  await prisma.follow.create({ data: { followerId: req.user.id, followingId: req.params.id } });
  res.json({ following: true });
});

module.exports = router;
