/* Supprime définitivement les comptes et annonces de démonstration créés par seed.js
   (admin@secondiy.ma, yasmine@example.com, karim@example.com et leurs annonces),
   sans toucher aux vrais comptes/annonces créés depuis l'app.

   Lancer une seule fois avec : node prisma/clean-demo.js */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DEMO_EMAILS = ["admin@secondiy.ma", "yasmine@example.com", "karim@example.com"];

async function main() {
  const demoUsers = await prisma.user.findMany({ where: { email: { in: DEMO_EMAILS } } });
  if (demoUsers.length === 0) {
    console.log("Aucun compte de démo trouvé — la base est déjà propre.");
    return;
  }
  const demoIds = demoUsers.map(u => u.id);

  // On supprime d'abord tout ce qui dépend de ces comptes (contraintes de clé étrangère),
  // puis les comptes eux-mêmes.
  const demoListings = await prisma.listing.findMany({ where: { sellerId: { in: demoIds } } });
  const listingIds = demoListings.map(l => l.id);

  await prisma.message.deleteMany({ where: { senderId: { in: demoIds } } });
  await prisma.conversation.deleteMany({ where: { OR: [{ buyerId: { in: demoIds } }, { sellerId: { in: demoIds } }, { listingId: { in: listingIds } }] } });
  await prisma.favorite.deleteMany({ where: { OR: [{ userId: { in: demoIds } }, { listingId: { in: listingIds } }] } });
  await prisma.review.deleteMany({ where: { OR: [{ authorId: { in: demoIds } }, { targetId: { in: demoIds } }] } });
  await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: demoIds } }, { followingId: { in: demoIds } }] } });
  await prisma.listing.deleteMany({ where: { sellerId: { in: demoIds } } });
  await prisma.user.deleteMany({ where: { id: { in: demoIds } } });

  console.log(`Supprimé : ${demoUsers.length} compte(s) de démo et ${demoListings.length} annonce(s) de démo.`);
  console.log("Ta base ne contient plus que tes vraies données.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
