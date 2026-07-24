import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { validateProviderDraftInput } from "@/lib/provider-profiles";
import { getProviderAdapter } from "@/lib/providers/registry";
import { redactSecrets } from "@/lib/security";

export async function POST(req) {
  try {
    await requireCurrentUser();
    const input = await req.json();
    const validation = validateProviderDraftInput(input, { requireApiKey: true });
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, code: "INVALID_DRAFT_PROVIDER", message: validation.errors.join("；") },
        { status: 400 },
      );
    }

    const adapter = getProviderAdapter(validation.value.provider);
    const result =
      validation.value.modelId && typeof adapter.testConnection === "function"
        ? await adapter.testConnection(validation.value)
        : await adapter.listModels(validation.value);

    return NextResponse.json(redactSecrets(result), { status: result.ok ? 200 : 400 });
  } catch {
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", message: "测试连接失败" },
      { status: 500 },
    );
  }
}
