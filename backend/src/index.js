require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const listingsRoutes = require("./routes/listings");
const messagesRoutes = require("./routes/messages");
const aiRoutes = require("./routes/ai");
const adminRoutes = require("./routes/admin");
const usersRoutes = require("./routes/users");

const app = express();

// En développement, on autorise tous les ports localhost (Vite peut choisir
// 5173, 5174... si le port par défaut est déjà pris). En production, on autorise
// CLIENT_URL (peut contenir plusieurs origines séparées par des virgules, ex:
// "https://secondiy.vercel.app,https://www.secondiy.ma") ainsi que les URLs de
// preview Vercel (*.vercel.app) pour ne pas se bloquer soi-même à chaque déploiement.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, "")) // enlève un éventuel slash final
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // requêtes sans origine (curl, apps mobiles, health checks)
    const cleanOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(cleanOrigin)) return callback(null, true);
    if (/^http:\/\/localhost:\d+$/.test(cleanOrigin)) return callback(null, true); // tout port localhost en dev
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(cleanOrigin)) return callback(null, true); // previews Vercel
    console.warn(`[CORS] Origine refusée : ${origin}. Ajoute-la à CLIENT_URL dans les variables d'environnement du backend si elle est légitime.`);
    return callback(null, false); // refuse sans lever d'exception (évite un 500 qui masque la vraie cause)
  },
}));
app.use(express.json({ limit: "5mb" })); // limite plus haute pour accepter des photos en base64

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", usersRoutes);

// Gestion d'erreurs générique
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Secondie API en écoute sur http://localhost:${PORT}`);
});