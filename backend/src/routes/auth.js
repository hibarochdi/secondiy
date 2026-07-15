const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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
const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  bio: z.string().max(300).optional(),
  city: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
});
router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Données invalides." });

  const user = await prisma.user.update({ where: { id: req.user.id }, data: parsed.data });
  res.json({ user: await withStats(user) });
});

// POST /api/auth/me/password — changer son mot de passe (vérifie l'ancien d'abord)
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis."),
  newPassword: z.string().min(6, "6 caractères minimum."),
});
router.post("/me/password", requireAuth, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Données invalides." });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Mot de passe actuel incorrect." });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  res.json({ success: true });
});

// DELETE /api/auth/me — supprimer définitivement son compte et toutes ses données
router.delete("/me", requireAuth, async (req, res) => {
  const id = req.user.id;
  const listingIds = (await prisma.listing.findMany({ where: { sellerId: id }, select: { id: true } })).map(l => l.id);
  const conversationIds = (await prisma.conversation.findMany({
    where: { OR: [{ buyerId: id }, { sellerId: id }, { listingId: { in: listingIds } }] },
    select: { id: true },
  })).map(c => c.id);

  // Important : on supprime TOUS les messages de ces conversations (pas seulement ceux
  // envoyés par ce compte), sinon la suppression de la conversation échoue à cause des
  // messages restants envoyés par l'autre personne.
  await prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.favorite.deleteMany({ where: { OR: [{ userId: id }, { listingId: { in: listingIds } }] } });
  await prisma.review.deleteMany({ where: { OR: [{ authorId: id }, { targetId: id }] } });
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: id }, { followingId: id }] } });
  await prisma.listing.deleteMany({ where: { sellerId: id } });
  await prisma.user.delete({ where: { id } });

  res.status(204).send();
});

// POST /api/auth/forgot-password — génère un vrai lien de réinitialisation.
// Réponse volontairement générique dans tous les cas, pour ne pas révéler si un email existe en base.
const forgotSchema = z.object({ email: z.string().email() });
router.post("/forgot-password", async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email invalide." });

  const genericMsg = { message: "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé." };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return res.json(genericMsg); // on ne révèle pas si le compte existe ou non

  const rawToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash, resetTokenExpiresAt } });

  const resetLink = `${process.env.CLIENT_URL || "http://localhost:5173"}/?reset=${rawToken}&email=${encodeURIComponent(user.email)}`;

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "SeconDIY <onboarding@resend.dev>",
          to: user.email,
          subject: "Réinitialise ton mot de passe SeconDIY",
          html: `<p>Bonjour ${user.name},</p><p>Clique sur ce lien pour choisir un nouveau mot de passe (valable 1h) :</p><p><a href="${resetLink}">${resetLink}</a></p><p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>`,
        }),
      });
    } catch (err) {
      console.error("Échec d'envoi de l'email de réinitialisation :", err.message);
    }
  } else {
    // Aucun service d'email configuré : on log le lien côté serveur pour pouvoir tester/débugger.
    console.log(`[reset-password] Aucun RESEND_API_KEY configuré. Lien de réinitialisation pour ${user.email} : ${resetLink}`);
  }

  res.json(genericMsg);
});

// POST /api/auth/reset-password — vérifie le token et applique le nouveau mot de passe
const resetSchema = z.object({ email: z.string().email(), token: z.string().min(10), newPassword: z.string().min(6) });
router.post("/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Données invalides." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
    return res.status(400).json({ error: "Lien invalide ou expiré." });
  }
  if (user.resetTokenExpiresAt < new Date()) {
    return res.status(400).json({ error: "Ce lien a expiré, redemande une réinitialisation." });
  }
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  if (tokenHash !== user.resetTokenHash) {
    return res.status(400).json({ error: "Lien invalide ou expiré." });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  res.json({ success: true });
});

module.exports = router;
