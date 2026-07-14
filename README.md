# secondiy

Projet complet SeconDIY — marketplace de seconde main marocaine.

```
secondiy/
├── frontend/     → site React (Vite + Tailwind) — ce que voient les visiteurs
├── backend/      → API Node.js/Express + Prisma — auth, annonces, messages, IA
└── package.json  → lance les deux ensemble en une commande
```

## Ouvrir dans VS Code

```bash
code secondiy
```

(ou : ouvrir VS Code → "Ouvrir un dossier" → sélectionner `secondiy`)

## Installer

Il faut [Node.js](https://nodejs.org) 18+ installé. Puis, à la racine du projet :

```bash
cd secondiy
npm install
npm run install:all
```

## Configurer le backend

```bash
cd backend
cp .env.example .env
```

Ouvre `backend/.env` et renseigne au minimum :
- `JWT_SECRET` — n'importe quelle chaîne aléatoire longue
- `ANTHROPIC_API_KEY` — ta clé API Anthropic (nécessaire pour les fonctions IA — recherche naturelle et génération d'annonce)

Puis initialise la base de données :

```bash
npx prisma migrate dev --name init
npm run seed
cd ..
```

## Lancer le tout

Depuis la racine `secondiy/` :

```bash
npm run dev
```

Ça démarre en même temps :
- le frontend sur **http://localhost:5173**
- le backend sur **http://localhost:4000**

(Tu peux aussi les lancer séparément avec `npm run dev:frontend` ou `npm run dev:backend`.)

## Prochaine étape : brancher le frontend sur le backend

Pour l'instant le frontend (`frontend/src/App.jsx`) utilise des données simulées en dur dans le fichier. Pour qu'il affiche les vraies annonces de la base de données, il faut remplacer ces données par des appels à l'API du backend (`fetch("http://localhost:4000/api/listings")`, etc.). Demande-le si tu veux que ce soit fait.
