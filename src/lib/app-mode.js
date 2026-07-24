import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth.js";
import config from "./config.js";
import { prisma } from "./prisma.js";

export function isLocalMode() {
  return config.app.mode === "local";
}

export async function ensureDefaultLocalUser() {
  const id = config.app.defaultLocalUserId;

  try {
    return await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: "Local User",
        email: `${id}@local.lingtu`,
        credits: 0,
      },
    });
  } catch (error) {
    if (!isDefaultLocalUserIdConflict(error)) throw error;

    const user = await prisma.user.findUnique({ where: { id } });
    if (user) return user;
    throw error;
  }
}

function isDefaultLocalUserIdConflict(error) {
  const target = error?.meta?.target;
  const message = error?.message || "";
  const targetText = Array.isArray(target) ? target.join(",") : String(target || "");
  const idOnlyTarget =
    (Array.isArray(target) && target.length === 1 && target[0] === "id") ||
    /^User_(pkey|id_key)$/.test(targetText) ||
    /fields:\s*\(`id`\)/.test(message);

  return error?.code === "P2002" && idOnlyTarget && !/email/i.test(targetText) && !/fields:\s*\(`email`\)/i.test(message);
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
