const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
  phone: z.string().min(6, "Numéro de téléphone invalide"),
  age: z.coerce.number().int().min(18, "Tu dois avoir au moins 18 ans pour créer un compte.").max(120),
  address: z.string().min(3, "Adresse requise"),
  city: z.string().min(2, "Ville requise"),
  newsletterOptIn: z.boolean().optional().default(false),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "Tu dois accepter la politique de confidentialité pour créer un compte." }),
  }),
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({ error: firstIssue?.message || "Données invalides.", details: parsed.error.flatten() });
  }
  const { firstName, lastName, email, password, phone, age, address, city, newsletterOptIn, acceptedTerms } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name: `${firstName} ${lastName}`.trim(),
      firstName, lastName, email, passwordHash, phone, age, address, city,
      newsletterOptIn, acceptedTerms,
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: await withStats(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email ou mot de passe manquant." });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const token = signToken(user);
  res.json({ token, user: await withStats(user) });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: await withStats(user) });
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// Calcule les vraies stats d'un profil : annonces vendues, abonnés, note moyenne
async function withStats(user) {
  const [salesCount, listingsCount, followersCount, reviews] = await Promise.all([
    prisma.listing.count({ where: { sellerId: user.id, status: "SOLD" } }),
    prisma.listing.count({ where: { sellerId: user.id } }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.review.findMany({ where: { targetId: user.id }, select: { rating: true } }),
  ]);
  const rating = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : null; // pas encore d'avis reçu

  return { ...publicUser(user), salesCount, listingsCount, followersCount, rating };
}

// GET /api/auth/me/reviews — vrais avis reçus par l'utilisateur connecté (vide s'il n'y en a pas)
router.get("/me/reviews", requireAuth, async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { targetId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
  res.json({ reviews });
});

// PATCH /api/auth/me — modifier son profil (nom, bio, ville, téléphone)
