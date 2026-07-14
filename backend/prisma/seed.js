/* Remplit la base avec quelques utilisateurs et annonces de démonstration.
   Lancer avec : npm run seed */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "admin@secondiy.ma" },
    update: {},
    create: {
      name: "Admin SeconDIY", firstName: "Admin", lastName: "SeconDIY",
      email: "admin@secondiy.ma", passwordHash, city: "Casablanca",
      role: "ADMIN", trustBadge: true, acceptedTerms: true,
    },
  });

  const yasmine = await prisma.user.upsert({
    where: { email: "yasmine@example.com" },
    update: {},
    create: { name: "Yasmine B.", email: "yasmine@example.com", passwordHash, city: "Casablanca", trustBadge: true },
  });

  const karim = await prisma.user.upsert({
    where: { email: "karim@example.com" },
    update: {},
    create: { name: "Karim T.", email: "karim@example.com", passwordHash, city: "Rabat", trustBadge: true },
  });

  await prisma.listing.createMany({
    data: [
      {
        title: "Veste Nike Windrunner",
        description: "Veste coupe-vent Nike, noire, portée quelques fois seulement.",
        price: 320,
        category: "Mode",
        condition: "Très bon état",
        size: "M",
        city: "Casablanca",
        images: JSON.stringify(["https://picsum.photos/seed/veste1/600/600"]),
        type: "vente",
        sellerId: yasmine.id,
      },
      {
        title: "Fauteuil vintage rotin",
        description: "Fauteuil en rotin des années 70, bon état général.",
        price: 650,
        category: "Maison",
        condition: "Bon état",
        city: "Rabat",
        images: JSON.stringify(["https://picsum.photos/seed/fauteuil1/600/600"]),
        type: "vente",
        sellerId: karim.id,
      },
      {
        title: "Livres pour enfants (lot de 12)",
        description: "Lot de livres pour enfants de 4 à 8 ans, bon état, à donner à qui en a besoin.",
        price: 0,
        category: "Maison",
        condition: "Bon état",
        city: "Casablanca",
        images: JSON.stringify(["https://picsum.photos/seed/livres1/600/600"]),
        type: "don",
        sellerId: yasmine.id,
      },
    ],
  });

  console.log("Base de données initialisée avec des données de démonstration.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
