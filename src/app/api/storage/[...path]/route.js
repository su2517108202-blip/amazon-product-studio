import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { resolveStoragePath } from "@/lib/storage";

export async function GET(_req, context) {
  try {
    const params = await context.params;
    const parts = params.path || [];
    const filePath = resolveStoragePath(parts);
    const file = await fs.readFile(filePath);

    return new Response(file, {
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "文件不存在" },
      { status: 404 },
    );
  }
}

function getContentType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}
