import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { validateProviderDraftInput, inferModelCapabilities, inferProviderProtocol, CAPABILITIES } from "@/lib/provider-profiles";
import { redactSecrets } from "@/lib/security";

const UNSUPPORTED_MESSAGE = "该服务商不支持自动获取模型列表";

export async function POST(req) {
  try {
    const user = await requireCurrentUser();
    const input = await req.json();

    let config;
    let provider;

    // Mode A: saved profile (must verify ownership)
    if (input.providerProfileId) {
      const profile = await prisma.providerProfile.findFirst({
        where: { id: input.providerProfileId, userId: user.id },
      });
      if (!profile) {
        return NextResponse.json(
          { ok: false, code: "NOT_FOUND", message: "配置不存在或无权访问", models: [] },
          { status: 404 },
        );
      }
      config = buildProviderConfig(profile);
      provider = profile.provider;
    } else {
      // Mode B: draft form
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

    // Build unified model structure: { modelId, capabilities, protocol, capabilityStatus, reason }
    const models = rawModelIds.map((modelId) => {
      const capabilities = inferModelCapabilities(provider, modelId);
      const protocol = inferProviderProtocol(provider, modelId, capabilities);

      // Capability status: only mark as "inferred" (not "verified" or "official")
      // because we haven't tested the model yet.
      let capabilityStatus = "inferred";
      let reason = "";

      // For Gemini, only mark vision if model name contains vision/visual signals
      if (provider === "gemini") {
        const modelLower = modelId.toLowerCase();
        const hasVisionSignal = /vision|flash|pro|ultra/i.test(modelLower);
        if (!hasVisionSignal) {
          capabilityStatus = "unverified";
          reason = "模型名称未包含视觉信号，能力未经验证";
        }
      }

      return { modelId, capabilities, protocol, capabilityStatus, reason };
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
