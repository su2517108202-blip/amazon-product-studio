import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { encryptSecret } from "@/lib/security";
import {
  sanitizeProviderProfile,
  validateProviderInput,
} from "@/lib/provider-profiles";

async function getProfile(profileId, userId) {
  return prisma.providerProfile.findFirst({
    where: { id: profileId, userId },
    include: { modelRoleAssignments: true },
  });
}

export async function GET(_req, context) {
  try {
    const { profileId } = await context.params;
    const user = await requireCurrentUser();
    const profile = await getProfile(profileId, user.id);

    if (!profile) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }

    return NextResponse.json(sanitizeProviderProfile(profile));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取 API 配置" },
      { status: error.status || 500 },
    );
  }
}

export async function PATCH(req, context) {
  try {
    const { profileId } = await context.params;
    const user = await requireCurrentUser();
    const existing = await getProfile(profileId, user.id);

    if (!existing) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }

    const input = await req.json();
    const validation = validateProviderInput(input, { requireApiKey: false });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors.join("；") }, { status: 400 });
    }

    const value = validation.value;
    const keyPatch = value.apiKey ? encryptSecret(value.apiKey) : {};
    const profile = await prisma.providerProfile.update({
      where: { id: profileId },
      data: {
        name: value.name,
        provider: value.provider,
        baseUrl: value.baseUrl,
        modelId: value.modelId,
        protocol: value.protocol,
        capabilitiesJson: JSON.stringify(value.capabilities),
        timeoutMs: value.timeoutMs,
        maxRetries: value.maxRetries,
        enabled: value.enabled,
        ...keyPatch,
      },
    });

    return NextResponse.json(sanitizeProviderProfile(profile));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法更新 API 配置" },
      { status: error.status || 500 },
    );
  }
}

export async function DELETE(_req, context) {
  try {
    const { profileId } = await context.params;
    const user = await requireCurrentUser();
    const profile = await getProfile(profileId, user.id);

    if (!profile) {
      return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    }

    if (profile.modelRoleAssignments.length > 0) {
      return NextResponse.json(
        { error: "该配置正在被角色使用，请先清除对应角色绑定" },
        { status: 409 },
      );
    }

    await prisma.providerProfile.delete({
      where: { id: profileId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法删除 API 配置" },
      { status: error.status || 500 },
    );
  }
}
