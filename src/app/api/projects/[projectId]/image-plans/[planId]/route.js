import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import {
  imagePlanToDbData,
  imagePlanToResponse,
  sanitizeEditableImagePlan,
} from "@/lib/image-planning";

export async function PATCH(req, context) {
  try {
    const { projectId, planId } = await context.params;
    const user = await requireCurrentUser();
    const plan = await prisma.imagePlan.findFirst({
      where: {
        id: planId,
        projectId,
        project: { userId: user.id },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Image plan not found" }, { status: 404 });
    }

    const body = await req.json();
    const clean = sanitizeEditableImagePlan(body, plan);
    const saved = await prisma.imagePlan.update({
      where: { id: plan.id },
      data: {
        ...imagePlanToDbData(clean, {
          inputFingerprint: plan.inputFingerprint,
          sourceProvider: plan.sourceProvider,
          sourceModel: plan.sourceModel,
          sourceProfileId: plan.sourceProfileId,
          isStale: plan.isStale,
          isManuallyEdited: true,
          status: plan.status,
        }),
        isManuallyEdited: true,
      },
    });

    return NextResponse.json(imagePlanToResponse(saved));
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to save image plan" },
      { status: error.status || 500 },
    );
  }
}
