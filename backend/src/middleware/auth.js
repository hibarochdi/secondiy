const jwt = require("jsonwebtoken");

/**
 * Vérifie le token JWT envoyé dans l'en-tête Authorization: Bearer <token>
 * et attache l'utilisateur décodé à req.user
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

/** Autorise seulement si req.user.role === "ADMIN" */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Accès réservé aux administrateurs." });
  }
  next();
}

/** Comme requireAuth mais ne bloque pas si absent — utile pour des routes publiques enrichies */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
