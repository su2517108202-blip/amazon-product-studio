import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/app-mode";
import { encryptSecret, hasCredentialKey } from "@/lib/security";
import {
  sanitizeProviderProfile,
  validateProviderInput,
} from "@/lib/provider-profiles";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const profiles = await prisma.providerProfile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      credentialKeyConfigured: hasCredentialKey(),
      profiles: profiles.map(sanitizeProviderProfile),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法读取 API 配置" },
      { status: error.status || 500 },
    );
  }
}

export async function POST(req) {
  try {
    const user = await requireCurrentUser();
    const input = await req.json();
    const validation = validateProviderInput(input, { requireApiKey: true });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors.join("；") }, { status: 400 });
    }

    const value = validation.value;
    const encrypted = encryptSecret(value.apiKey);
    const profile = await prisma.providerProfile.create({
      data: {
        userId: user.id,
        name: value.name,
        provider: value.provider,
        baseUrl: value.baseUrl,
        encryptedApiKey: encrypted.encryptedApiKey,
        apiKeyIv: encrypted.apiKeyIv,
        apiKeyAuthTag: encrypted.apiKeyAuthTag,
        apiKeyLast4: encrypted.apiKeyLast4,
        modelId: value.modelId,
        protocol: value.protocol,
        capabilitiesJson: JSON.stringify(value.capabilities),
        timeoutMs: value.timeoutMs,
        maxRetries: value.maxRetries,
        enabled: value.enabled,
      },
    });

    return NextResponse.json(sanitizeProviderProfile(profile), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "无法保存 API 配置" },
      { status: error.status || 500 },
    );
  }
}
