import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { redactSecrets } from "@/lib/security";

export async function POST(_req, context) {
  const startedAt = Date.now();
  let profileId = "";
  let provider = "";
  let modelId = "";

  try {
    const params = await context.params;
    profileId = params.profileId;
    const user = await requireCurrentUser();
    const profile = await prisma.providerProfile.findFirst({
      where: { id: profileId, userId: user.id },
    });

    if (!profile) {
      return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "配置不存在", httpStatus: 404 }, { status: 404 });
    }

    provider = profile.provider;
    modelId = profile.modelId;
    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.testConnection(buildProviderConfig(profile));

    await prisma.providerProfile.update({
      where: { id: profile.id },
      data: {
        lastTestOk: Boolean(result.ok),
        lastTestMessage: result.message,
        lastTestedAt: new Date(),
      },
    });

    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[PROVIDER_TEST_ERROR]", {
      provider,
      modelId,
      profileId,
      code: error.code || "UNKNOWN",
      httpStatus: error.httpStatus || 0,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", message: "测试连接失败", httpStatus: 0 },
      { status: 500 },
    );
  }
}
