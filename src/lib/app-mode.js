import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";
import { prisma } from "@/lib/prisma";

export function isLocalMode() {
  return config.app.mode === "local";
}

export async function ensureDefaultLocalUser() {
  const id = config.app.defaultLocalUserId;

  return prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name: "Local User",
      email: `${id}@local.lingtu`,
      credits: 0,
    },
  });
}

export async function getCurrentUser() {
  if (isLocalMode()) {
    return ensureDefaultLocalUser();
  }

  const session = await getServerSession(authOptions);
  return session?.user || null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error("未登录或无权访问");
    error.status = 401;
    throw error;
  }
  return user;
}
