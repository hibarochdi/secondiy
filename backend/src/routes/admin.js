const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Toutes les routes admin exigent d'être connecté ET d'avoir le rôle ADMIN
router.use(requireAuth, requireAdmin);

// GET /api/admin/stats — chiffres clés pour les cartes du haut du panneau
router.get("/stats", async (req, res) => {
  const [usersCount, listingsCount, soldCount, reservedCount, activeCount, donsCount] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "SOLD" } }),
    prisma.listing.count({ where: { status: "RESERVED" } }),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count({ where: { type: "don" } }),
  ]);

  res.json({
    usersCount,
    listingsCount,
    soldCount,
    reservedCount,
    activeCount,
    donsCount,
  });
});

// GET /api/admin/users — liste des personnes inscrites
router.get("/users", async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, phone: true, city: true,
      role: true, trustBadge: true, createdAt: true,
      _count: { select: { listings: true } },
    },
  });
  res.json({ users });
});

// GET /api/admin/listings — toutes les annonces (ventes + dons), avec le vendeur
router.get("/listings", async (req, res) => {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { id: true, name: true, email: true } } },
  });
  res.json({
    listings: listings.map(l => ({ ...l, images: JSON.parse(l.images || "[]") })),
  });
});

module.exports = router;
