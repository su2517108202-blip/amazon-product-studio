import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";
import { prisma } from "@/lib/prisma";

export function isLocalMode() {
  return config.app.mode === "local";
}

export async function ensureDefaultLocalUser() {
  const id = config.app.defaultLocalUserId;
  const email = `${id}@local.lingtu`;

  try {
    return await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: "Local User",
        email,
        credits: 0,
      },
    });
  } catch (error) {
    if (error?.code !== "P2002") {
      throw error;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (user?.id === id && user.email === email) {
      return user;
    }
    throw error;
  }
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
