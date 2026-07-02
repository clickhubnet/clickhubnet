import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

async function main() {
  const passwordHash = await hashPassword("roots2601");

  const user = await prisma.user.upsert({
    where: { email: "joana@central.com" },
    update: {
      name: "Joana",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      deletedAt: null,
      title: "Administradora",
      passwordChangedAt: new Date(),
    },
    create: {
      name: "Joana",
      email: "joana@central.com",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      title: "Administradora",
      permissions: {},
      theme: "light",
      passwordChangedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
  });

  console.log(JSON.stringify({ seededUser: user }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
