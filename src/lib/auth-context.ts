import { cookies } from "next/headers";
import { authCookieName, verifyAuthToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const token = (await cookies()).get(authCookieName)?.value;
  const payload = token ? await verifyAuthToken(token) : null;

  if (!payload) {
    return null;
  }

  return prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, status: "ACTIVE" },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
