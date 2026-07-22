import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { redactSecrets } from "@/lib/security";

export async function POST(_req, context) {
  try {
    const { profileId } = await context.params;
    const user = await requireCurrentUser();
    const profile = await prisma.providerProfile.findFirst({
      where: { id: profileId, userId: user.id },
    });

    if (!profile) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "配置不存在", httpStatus: 404 }, { status: 404 });
    }

    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.listModels(buildProviderConfig(profile));
    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", message: "读取模型列表失败", httpStatus: 0 },
      { status: 500 },
    );
  }
}
