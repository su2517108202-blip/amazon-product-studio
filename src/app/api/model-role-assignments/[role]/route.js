import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { MODEL_ROLES, parseCapabilities, roleAcceptanceLevel, sanitizeRoleAssignment } from "@/lib/provider-profiles";

export async function PUT(req, context) {
  try {
    const { role } = await context.params;
    const user = await requireCurrentUser();
    const roleConfig = MODEL_ROLES[role];
    if (!roleConfig) return NextResponse.json({ error: "角色不存在" }, { status: 400 });

    const { providerProfileId, modelId, isUserForced } = await req.json();
    if (!providerProfileId) return NextResponse.json({ error: "请选择配置" }, { status: 400 });

    const profile = await prisma.providerProfile.findFirst({
      where: { id: providerProfileId, userId: user.id, enabled: true },
    });
    if (!profile) return NextResponse.json({ error: "配置不存在或已停用" }, { status: 404 });

    const effectiveModelId = (modelId || profile.modelId || "").trim();
    const capabilities = parseCapabilities(profile);
    const level = roleAcceptanceLevel(role, { ...profile, modelId: effectiveModelId, capabilities });

    if (level === "unsupported") {
      return NextResponse.json(
        { error: `该配置能力不符合 ${roleConfig.label} 角色要求`, code: "CAPABILITY_MISMATCH" },
        { status: 400 },
      );
    }

    const assignment = await prisma.modelRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role } },
      update: { providerProfileId, modelId: modelId || null, isUserForced: Boolean(isUserForced) },
      create: { userId: user.id, role, providerProfileId, modelId: modelId || null, isUserForced: Boolean(isUserForced) },
      include: { providerProfile: true },
    });

    return NextResponse.json({ ...sanitizeRoleAssignment(assignment), acceptanceLevel: level });
  } catch (error) {
    return NextResponse.json({ error: error.message || "无法保存角色绑定" }, { status: error.status || 500 });
  }
}

export async function DELETE(_req, context) {
  try {
    const { role } = await context.params;
    const user = await requireCurrentUser();
    if (!MODEL_ROLES[role]) return NextResponse.json({ error: "角色不存在" }, { status: 400 });
    await prisma.modelRoleAssignment.deleteMany({ where: { userId: user.id, role } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "无法清除角色绑定" }, { status: error.status || 500 });
  }
}
