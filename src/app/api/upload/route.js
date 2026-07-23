import { NextResponse } from "next/server";
import { isLocalMode, requireCurrentUser } from "@/lib/app-mode";
import config from "@/lib/config";

export async function POST(req) {
  try {
    await requireCurrentUser();
    if (isLocalMode()) {
      return NextResponse.json(
        { code: "LEGACY_ROUTE_DISABLED", error: "本地模式已停用旧上传接口" },
        { status: 410 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ code: "NO_FILE", error: "请选择文件" }, { status: 400 });
    }

    const apiKey = config.ai.apiKey;
    if (!apiKey) {
      return NextResponse.json(
        { code: "LEGACY_API_KEY_MISSING", error: "旧上传接口未配置" },
        { status: 500 },
      );
    }

    const muapiFormData = new FormData();
    muapiFormData.append("file", file);

    const response = await fetch(config.ai.uploadEndpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: muapiFormData,
    });

    if (!response.ok) {
      console.error("[legacy-upload] upstream failed", { status: response.status });
      return NextResponse.json(
        { code: "LEGACY_UPLOAD_FAILED", error: "旧上传接口请求失败" },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[legacy-upload] failed", { name: error?.name, code: error?.code });
    return NextResponse.json(
      { code: "LEGACY_UPLOAD_FAILED", error: "旧上传接口不可用" },
      { status: 500 },
    );
  }
}
