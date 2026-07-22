import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { sanitizeRoleAssignment } from "@/lib/provider-profiles";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const assignments = await prisma.modelRoleAssignment.findMany({
      where: { userId: user.id },
      include: { providerProfile: true },
      orderBy: { role: "asc" },
    });

    return NextResponse.json(assignments.map(sanitizeRoleAssignment));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取角色绑定" },
      { status: error.status || 500 },
    );
  }
}
