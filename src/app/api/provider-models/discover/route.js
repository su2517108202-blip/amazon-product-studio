import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { validateProviderDraftInput } from "@/lib/provider-profiles";
import { resolveEffectiveModelCapability } from "@/lib/model-capabilities";
import { applyModelAvailability } from "@/lib/model-availability";
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
    const modelMetadata = new Map();
    const rawModelIds = Array.isArray(result.models)
      ? [...new Set(result.models.map((m) => {
          const id = typeof m === "string" ? m : (m.id || m.name || "");
          const modelId = String(id).trim();
          if (modelId && typeof m === "object") {
            modelMetadata.set(modelId, {
              displayName: m.displayName || "",
              description: m.description || "",
              supportedGenerationMethods: Array.isArray(m.supportedGenerationMethods)
                ? m.supportedGenerationMethods
                : [],
            });
          }
          return modelId;
        }).filter(Boolean))]
      : [];

    const modelDetails = rawModelIds.map((modelId) => {
      const metadata = modelMetadata.get(modelId) || {
        displayName: "",
        description: "",
        supportedGenerationMethods: [],
      };
      const resolved = applyModelAvailability(resolveEffectiveModelCapability({
        provider,
        modelId,
        discoveredModel: { modelId, metadata },
        profile: config,
      }), { providerProfileId: input.providerProfileId || "" });

      return {
        modelId: resolved.modelId,
        rawModelId: modelId,
        displayName: resolved.displayName,
        badges: resolved.badges,
        rank: resolved.rank,
        recommendedFor: resolved.recommendedFor,
        lifecycle: resolved.lifecycle,
        deprecationDate: resolved.deprecationDate,
        aliases: resolved.aliases,
        capabilities: resolved.capabilities,
        protocol: resolved.protocol,
        supportsReferenceImages: resolved.supportsReferenceImages,
        capabilityStatus: resolved.capabilityStatus,
        reason: resolved.reason,
        metadata,
      };
    });

    return NextResponse.json(redactSecrets({
      ok: true,
      provider,
      models: rawModelIds,
      modelDetails,
      count: rawModelIds.length,
      message: result.ok
        ? `已从官方 API 读取 ${rawModelIds.length} 个模型`
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
