import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { validateProviderDraftInput, inferModelCapabilities, inferProviderProtocol, CAPABILITIES, PROVIDER_DEFAULTS } from "@/lib/provider-profiles";
import { redactSecrets } from "@/lib/security";

const UNSUPPORTED_MESSAGE = "该服务商不支持自动获取模型列表，请手动填写模型ID。";

export async function POST(req) {
  try {
    await requireCurrentUser();
    const input = await req.json();

    // 模式 A: 已保存配置 (providerProfileId)
    // 模式 B: 未保存草稿 (provider + baseUrl + apiKey)
    let config;
    let provider;

    if (input.providerProfileId) {
      const profile = await prisma.providerProfile.findFirst({
        where: { id: input.providerProfileId },
      });
      if (!profile) {
        return NextResponse.json(
          { ok: false, code: "NOT_FOUND", message: "配置不存在", models: [] },
          { status: 404 },
        );
      }
      config = buildProviderConfig(profile);
      provider = profile.provider;
    } else {
      const validation = validateProviderDraftInput(input, { requireApiKey: true });
      if (!validation.ok) {
        return NextResponse.json(
          { ok: false, code: "INVALID_DRAFT_PROVIDER", message: validation.errors.join("；"), models: [] },
          { status: 400 },
        );
      }
      config = validation.value;
      provider = validation.value.provider;
    }

    const adapter = getProviderAdapter(provider);
    if (typeof adapter.listModels !== "function") {
      return NextResponse.json(
        { ok: false, code: "UNSUPPORTED_MODEL_DISCOVERY", message: UNSUPPORTED_MESSAGE, models: [] },
        { status: 400 },
      );
    }

    const result = await adapter.listModels(config);
    const rawModelIds = Array.isArray(result.models)
      ? [...new Set(result.models.map((m) => String(m || "").trim()).filter(Boolean))]
      : [];

    // 为每个模型推断能力和协议
    const models = rawModelIds.map((modelId) => {
      const capabilities = inferModelCapabilities(provider, modelId);
      const protocol = inferProviderProtocol(provider, modelId, capabilities);
      return { modelId, capabilities, protocol };
    });

    return NextResponse.json(redactSecrets({
      ok: true,
      provider,
      models,
      count: models.length,
      message: result.ok
        ? `已从官方 API 读取 ${models.length} 个模型`
        : (result.message || "模型列表读取完成"),
    }), { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[DISCOVER_MODELS_ERROR]", error);
    return NextResponse.json(
      { ok: false, code: error.code || "UPSTREAM_ERROR", message: error.message || "读取模型列表失败", models: [] },
      { status: error.httpStatus || 500 },
    );
  }
}
