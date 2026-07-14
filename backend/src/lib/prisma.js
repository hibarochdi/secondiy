const { PrismaClient } = require("@prisma/client");

// Un seul client Prisma partagé par toute l'application
const prisma = new PrismaClient();

module.exports = prisma;
