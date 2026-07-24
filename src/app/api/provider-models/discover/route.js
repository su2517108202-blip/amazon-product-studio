import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/app-mode";
import { validateProviderDraftInput } from "@/lib/provider-profiles";
import { getProviderAdapter } from "@/lib/providers/registry";
import { redactSecrets } from "@/lib/security";

const UNSUPPORTED_MESSAGE = "该接口不支持自动获取模型，请手动填写模型ID。";

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
    if (typeof adapter.listModels !== "function") {
      return NextResponse.json(
        { ok: false, code: "UNSUPPORTED_MODEL_DISCOVERY", message: UNSUPPORTED_MESSAGE, models: [] },
        { status: 400 },
      );
    }

    const result = await adapter.listModels(validation.value);
    const models = Array.isArray(result.models)
      ? [...new Set(result.models.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    return NextResponse.json(
      redactSecrets({
        ...result,
        models,
        message: result.ok ? result.message : result.message || UNSUPPORTED_MESSAGE,
      }),
      { status: result.ok ? 200 : 400 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "UPSTREAM_ERROR", message: "读取模型列表失败", models: [] },
      { status: 500 },
    );
  }
}
