import { decryptSecret } from "@/lib/security";
import { parseCapabilities } from "@/lib/provider-profiles";

export function buildProviderConfig(profile) {
  return {
    id: profile.id,
    provider: profile.provider,
    name: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: decryptSecret(profile),
    modelId: profile.modelId,
    protocol: profile.protocol,
    capabilities: parseCapabilities(profile),
    timeoutMs: profile.timeoutMs,
    maxRetries: profile.maxRetries,
    enabled: profile.enabled,
  };
}
