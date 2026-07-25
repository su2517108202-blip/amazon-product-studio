import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { MODEL_ROLES, parseCapabilities, inferModelCapabilities, roleAcceptanceLevel, sanitizeRoleAssignment } from "@/lib/provider-profiles";

function hasHardRoleConflict(role, profile) {
  if (!profile.enabled) return true;
  if (role === "image_generation" && profile.provider === "deepseek") return true;
  return false;
}

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

    // Re-infer capabilities based on effectiveModelId, not just profile defaults
    const profileCapabilities = parseCapabilities(profile);
    const effectiveCaps = effectiveModelId && effectiveModelId !== profile.modelId
      ? inferModelCapabilities(profile.provider, effectiveModelId)
      : profileCapabilities;
    const effectiveProfile = { ...profile, modelId: effectiveModelId, capabilities: effectiveCaps };

    const level = roleAcceptanceLevel(role, effectiveProfile);
    const capabilityStatus = level === "unsupported" && isUserForced ? "unverified" : level;
    if (level === "unsupported" && (!isUserForced || hasHardRoleConflict(role, effectiveProfile))) {
      return NextResponse.json(
        { error: `该模型不具备 ${roleConfig.label} 所需能力`, code: "CAPABILITY_MISMATCH", capabilityStatus: level },
        { status: 400 },
      );
    }

    const assignment = await prisma.modelRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role } },
      update: { providerProfileId, modelId: modelId || null, isUserForced: Boolean(isUserForced) },
      create: { userId: user.id, role, providerProfileId, modelId: modelId || null, isUserForced: Boolean(isUserForced) },
      include: { providerProfile: true },
    });

    return NextResponse.json({ ...sanitizeRoleAssignment(assignment), acceptanceLevel: capabilityStatus });
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
