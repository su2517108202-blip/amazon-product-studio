import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import {
  identityToDbData,
  identityToResponse,
} from "@/lib/product-identity";
import {
  calculateInputFingerprint,
  pickAnalysisImages,
} from "@/lib/product-analysis";
import { sanitizeReferenceImage } from "@/lib/projects";

async function getProject(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      productIdentity: true,
      referenceImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await getProject(projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    let selectedImages = [];
    let currentFingerprint = "";
    let canReuse = false;
    try {
      selectedImages = pickAnalysisImages(project);
      currentFingerprint = await calculateInputFingerprint(project, selectedImages);
      canReuse =
        Boolean(project.productIdentity) &&
        project.productIdentity.inputFingerprint === currentFingerprint &&
        !project.productIdentity.isStale;
    } catch {}

    return NextResponse.json({
      identity: identityToResponse(project.productIdentity),
      selectedImages: selectedImages.map(sanitizeReferenceImage),
      selectedCount: selectedImages.length,
      currentFingerprint,
      canReuse,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取产品身份证" },
      { status: error.status || 500 },
    );
  }
}

export async function PATCH(req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();
    const project = await getProject(projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const body = await req.json();
    const saved = await prisma.productIdentity.upsert({
      where: { projectId },
      create: {
        projectId,
        ...identityToDbData(body),
        sourceProvider: project.productIdentity?.sourceProvider || null,
        sourceModel: project.productIdentity?.sourceModel || null,
        sourceProfileId: project.productIdentity?.sourceProfileId || null,
        inputFingerprint: project.productIdentity?.inputFingerprint || null,
        isStale: false,
      },
      update: {
        ...identityToDbData(body),
        isStale: false,
      },
    });

    return NextResponse.json(identityToResponse(saved));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法保存产品身份证" },
      { status: error.status || 500 },
    );
  }
}
