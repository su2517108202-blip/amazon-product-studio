import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { buildProviderConfig } from "@/lib/provider-runtime";
import { getProviderAdapter } from "@/lib/providers/registry";
import { identityToDbData, identityToResponse } from "@/lib/product-identity";
import { buildAnalysisImages, calculateInputFingerprint, pickAnalysisImages, runToResponse } from "@/lib/product-analysis";
import { sanitizeReferenceImage } from "@/lib/projects";
import { humanErrorLabel } from "@/lib/providers/errors";
import { redactSecrets } from "@/lib/security";
import crypto from "crypto";

async function getProject(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { productIdentity: true, referenceImages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function POST(req, context) {
  const startedAt = Date.now();
  let run = null, profile = null, effectiveModelId = "", projectId = "";

  try {
    projectId = (await context.params).projectId;
    const user = await requireCurrentUser();
    const body = await req.json().catch(() => ({}));
    const project = await getProject(projectId, user.id);
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const selectedImages = pickAnalysisImages(project);

    // Get assignment first to compute effectiveModelId for fingerprint
    const assignment = await prisma.modelRoleAssignment.findUnique({
      where: { userId_role: { userId: user.id, role: "product_vision" } },
      include: { providerProfile: true },
    });
    if (!assignment?.providerProfile) {
      return NextResponse.json({ ok: false, code: "MISSING_PROVIDER_PROFILE", message: "请先在 API 设置中绑定商品识图模型" }, { status: 400 });
    }
    profile = assignment.providerProfile;
    effectiveModelId = (assignment.modelId || profile.modelId || "").trim();
    const effectiveConfig = buildProviderConfig(profile, { modelId: effectiveModelId });

    // P1-7: fingerprint includes model info so changing model invalidates cache
    const imageFingerprint = await calculateInputFingerprint(project, selectedImages);
    const modelFingerprint = crypto.createHash("sha256").update(JSON.stringify({
      profileId: profile.id, modelId: effectiveModelId,
    })).digest("hex");
    const inputFingerprint = `${imageFingerprint}_${modelFingerprint}`;

    if (project.productIdentity && project.productIdentity.inputFingerprint === inputFingerprint && !project.productIdentity.isStale && !body.force) {
      return NextResponse.json({
        ok: true, reused: true, message: "当前参考图和识图模型未变化，可复用上次识别结果",
        identity: identityToResponse(project.productIdentity), selectedImages: selectedImages.map(sanitizeReferenceImage),
      });
    }

    if (!profile.enabled) {
      return NextResponse.json({ ok: false, code: "PROFILE_DISABLED", message: "商品识图配置已停用" }, { status: 400 });
    }
    // P1-4: use effectiveConfig capabilities, not profile defaults
    if (!effectiveConfig.capabilities?.includes("vision")) {
      return NextResponse.json({
        ok: false, code: "CAPABILITY_MISMATCH",
        message: `模型 ${effectiveModelId} 缺少视觉能力`,
        diagnostic: redactSecrets({ provider: profile.provider, model: effectiveModelId }),
      }, { status: 400 });
    }

    run = await prisma.productAnalysisRun.create({
      data: { projectId, providerProfileId: profile.id, provider: profile.provider, model: effectiveModelId, inputFingerprint, status: "processing" },
    });

    const images = await buildAnalysisImages(project);
    const adapter = getProviderAdapter(profile.provider);
    const result = await adapter.analyzeProduct(effectiveConfig, { project, images });

    const saved = await prisma.productIdentity.upsert({
      where: { projectId },
      create: { projectId, ...identityToDbData(result), sourceProvider: profile.provider, sourceModel: effectiveModelId, sourceProfileId: profile.id, inputFingerprint, isStale: false },
      update: { ...identityToDbData(result), sourceProvider: profile.provider, sourceModel: effectiveModelId, sourceProfileId: profile.id, inputFingerprint, isStale: false },
    });

    const updatedRun = await prisma.productAnalysisRun.update({
      where: { id: run.id }, data: { status: "completed", durationMs: Date.now() - startedAt, completedAt: new Date() },
    });
    await prisma.imagePlan.updateMany({ where: { projectId }, data: { isStale: true } });

    return NextResponse.json({
      ok: true, reused: false,
      identity: identityToResponse(saved), run: runToResponse(updatedRun),
      selectedImages: selectedImages.map(sanitizeReferenceImage),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("[PRODUCT_ANALYSIS_ERROR]", { projectId, profileId: profile?.id || "", provider: profile?.provider || "", model: effectiveModelId || "", errorCode: error.code || "UPSTREAM_ERROR", httpStatus: error.httpStatus || 0, durationMs });

    if (run) {
      await prisma.productAnalysisRun.update({
        where: { id: run.id }, data: { status: "failed", errorCode: error.code || "UPSTREAM_ERROR", errorMessage: error.message || "商品识别失败", durationMs, completedAt: new Date() },
      }).catch(() => {});
    }

    // P1-11: Preserve cause chain. P1-12: redactSecrets diagnostic
    const upstreamSummary = error?.cause?.summary;
    return NextResponse.json(redactSecrets({
      ok: false,
      code: error.code || "UPSTREAM_ERROR",
      message: error.message || humanErrorLabel(error.code) || "商品识别失败",
      httpStatus: error.httpStatus || 0,
      diagnostic: {
        provider: profile?.provider || "",
        model: effectiveModelId || profile?.modelId || "",
        upstreamHttpStatus: error.httpStatus || upstreamSummary?.httpStatus || 0,
        upstreamStatus: upstreamSummary?.errorStatus || "",
        upstreamMessage: upstreamSummary?.errorMessage || "",
        upstreamDetails: upstreamSummary?.errorDetails || "",
      },
    }), { status: error.httpStatus >= 500 ? 502 : 400 });
  }
}
