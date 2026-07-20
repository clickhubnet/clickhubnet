import { prisma } from "@/lib/prisma";
import { ensureInitialUsers } from "./initial-users";

async function main() {
  const users = await ensureInitialUsers();
  console.log(JSON.stringify({ seededUsers: users }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
