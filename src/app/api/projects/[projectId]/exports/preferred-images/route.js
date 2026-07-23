import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { prisma } from "@/lib/prisma";
import {
  buildStoredZip,
  loadPreferredZipEntries,
  preferredZipFileName,
} from "@/lib/result-management";

export async function GET(_req, context) {
  try {
    const { projectId } = await context.params;
    const user = await requireCurrentUser();

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: {
        imagePlans: {
          orderBy: { planIndex: "asc" },
          include: {
            preferredGeneratedImage: true,
          },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ code: "PROJECT_NOT_FOUND", error: "Project not found" }, { status: 404 });
    }

    const prepared = await loadPreferredZipEntries(project);
    if (!prepared.ok) {
      return NextResponse.json(
        {
          code: prepared.code,
          error:
            prepared.code === "PREFERRED_FILE_MISSING"
              ? "Preferred image file is missing"
              : "Preferred image set is incomplete",
          missingPlans: prepared.missing,
        },
        { status: 409 },
      );
    }

    const zip = buildStoredZip(prepared.entries);
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${preferredZipFileName(project.name)}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error?.status === 401) {
      return NextResponse.json({ code: "UNAUTHORIZED", error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { code: "ZIP_EXPORT_FAILED", error: "Unable to export preferred images" },
      { status: 500 },
    );
  }
}
